-- Sistema de planes y monetización + flujo de upgrade.
--
-- IMPORTANTE: las tablas `plans` y `user_plans` ya existían en la base de
-- producción antes de esta migración (creadas directamente, sin quedar
-- versionadas). Este archivo las documenta tal cual están hoy y agrega
-- `subscriptions`, que es la pieza nueva para soportar el flujo de upgrade.
-- Si estás instalando desde cero, correr este archivo después de
-- 001_full_schema.sql deja la base exactamente como la de producción.

-- ── Catálogo de planes ────────────────────────────
-- Sin RLS: es un catálogo de lectura pública, no contiene datos por usuario.
create table public.plans (
  id text primary key,
  name text not null,
  price_clp integer not null default 0,
  max_projects integer not null default 1,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

insert into public.plans (id, name, price_clp, max_projects, description) values
  ('basic',      'Básico',    0,     1,   'Perfecto para empezar. 1 proyecto activo gratis.'),
  ('starter',    'Inicial',   5990,  3,   'Para líderes que manejan varios proyectos.'),
  ('pro',        'Pro',       10990, 10,  'Para equipos en crecimiento.'),
  ('advanced',   'Avanzado',  29990, 30,  'Para organizaciones medianas.'),
  ('ultra',      'Ultra',     45990, 50,  'Para grandes portfolios de proyectos.'),
  ('enterprise', 'Enterprise',89990, 100, 'Solución completa con base de datos dedicada.');

-- ── Plan activo por usuario ───────────────────────
create table public.user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_plans enable row level security;

create policy "user_sees_own_plan"
  on public.user_plans
  for all
  using (user_id = auth.uid());

-- Asigna el plan Básico automáticamente a cada usuario nuevo.
create or replace function public.handle_new_user_plan()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.user_plans(user_id, plan_id)
  values (new.id, 'basic')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

create trigger on_auth_user_plan
  after insert on auth.users
  for each row execute function public.handle_new_user_plan();

-- ── Funciones de consulta de plan ─────────────────

-- Plan actual + conteo de proyectos activos (excluye completados).
create or replace function public.al_get_my_plan()
returns json
language plpgsql
security definer
as $function$
declare result json;
begin
  select json_build_object(
    'plan_id',      coalesce(up.plan_id, 'basic'),
    'plan_name',    p.name,
    'max_projects', p.max_projects,
    'price_clp',    p.price_clp,
    'started_at',   up.started_at,
    'expires_at',   up.expires_at,
    'current_projects', (
      select count(*) from area_leader.projects
      where user_id = auth.uid() and status != 'completed'
    )
  ) into result
  from public.user_plans up
  join public.plans p on p.id = up.plan_id
  where up.user_id = auth.uid();

  if result is null then
    select json_build_object(
      'plan_id', 'basic',
      'plan_name', 'Básico',
      'max_projects', 1,
      'price_clp', 0,
      'started_at', null,
      'expires_at', null,
      'current_projects', (
        select count(*) from area_leader.projects where user_id = auth.uid()
      )
    ) into result;
  end if;

  return result;
end;
$function$;

-- true/false: si el usuario puede crear un proyecto más dentro de su límite.
-- Nota: cuenta TODOS los proyectos del usuario (sin excluir completados),
-- a diferencia de al_get_my_plan(), que sí los excluye.
create or replace function public.al_can_create_project()
returns boolean
language plpgsql
security definer
as $function$
declare
  v_max  int;
  v_curr int;
begin
  select coalesce(p.max_projects, 1) into v_max
  from public.user_plans up
  join public.plans p on p.id = up.plan_id
  where up.user_id = auth.uid();

  if v_max is null then v_max := 1; end if;

  select count(*) into v_curr
  from area_leader.projects where user_id = auth.uid();

  return v_curr < v_max;
end;
$function$;

-- Estado completo del plan para la UI: consumo, near_limit/at_limit y
-- el siguiente plan recomendado. Usado por PlanLimitBanner y UpgradePlanModal.
create or replace function public.al_plan_status()
returns json
language plpgsql
security definer
as $function$
declare
  v_plan_id text;
  v_plan_name text;
  v_max int;
  v_price int;
  v_current int;
  v_next json;
  result json;
begin
  select coalesce(up.plan_id, 'basic') into v_plan_id
  from public.user_plans up
  where up.user_id = auth.uid();

  if v_plan_id is null then
    v_plan_id := 'basic';
  end if;

  select p.name, p.max_projects, p.price_clp
    into v_plan_name, v_max, v_price
  from public.plans p
  where p.id = v_plan_id;

  select count(*) into v_current
  from area_leader.projects
  where user_id = auth.uid();

  -- Siguiente plan: el de menor max_projects que sea mayor al actual, activo.
  select json_build_object('id', np.id, 'name', np.name, 'max_projects', np.max_projects, 'price_clp', np.price_clp)
    into v_next
  from public.plans np
  where np.is_active = true
    and np.max_projects > v_max
  order by np.max_projects asc
  limit 1;

  result := json_build_object(
    'plan_id', v_plan_id,
    'plan_name', v_plan_name,
    'price_clp', v_price,
    'max_projects', v_max,
    'current_projects', v_current,
    'remaining', greatest(v_max - v_current, 0),
    'at_limit', v_current >= v_max,
    'near_limit', v_current >= (v_max - 1) and v_current < v_max,
    'next_plan', v_next
  );

  return result;
end;
$function$;

grant select on public.plans to anon, authenticated;
grant select on public.user_plans to authenticated;
grant execute on function public.al_get_my_plan to authenticated;
grant execute on function public.al_can_create_project to authenticated;
grant execute on function public.al_plan_status to authenticated;

-- 'plans' es un catálogo y no usa RLS; los grants por defecto de Supabase
-- otorgan INSERT/UPDATE/DELETE/TRUNCATE a anon/authenticated en tablas nuevas.
-- Los revocamos explícitamente para dejarla en solo lectura pública.
revoke insert, update, delete, truncate, references, trigger on public.plans from anon, authenticated;

-- user_plans tiene RLS, pero igual quitamos los grants de tabla que no
-- corresponden: la escritura debe pasar siempre por funciones SECURITY DEFINER
-- (handle_new_user_plan), no por INSERT/UPDATE/DELETE directos del cliente.
revoke insert, update, delete, truncate, references, trigger on public.user_plans from anon, authenticated;
revoke select, insert, update, delete, truncate, references, trigger on public.user_plans from anon;

-- ── Flujo de upgrade (agnóstico de proveedor de pago) ─────
-- user_plans sigue siendo la fuente de verdad de "qué plan está activo ahora".
-- subscriptions registra el ciclo de vida de cada intento/cobro de suscripción.
-- Todavía no hay proveedor de pago integrado: provider y provider_subscription_id
-- quedan null hasta conectar Mercado Pago/Stripe/etc.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'cancelled')),
  provider text,                          -- 'mercadopago' | 'stripe' | null mientras no se decide
  provider_subscription_id text,          -- id externo una vez creado el checkout/preapproval
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_status on public.subscriptions(status);

alter table public.subscriptions enable row level security;

create policy "user_sees_own_subscriptions"
  on public.subscriptions
  for all
  using (user_id = auth.uid());

-- Solicita iniciar un upgrade: crea una suscripción pendiente.
-- No activa el plan todavía -- eso lo hará la función que procese el webhook
-- del proveedor de pago, una vez que se integre.
create or replace function public.al_request_upgrade(p_plan_id text)
returns json
language plpgsql
security definer
as $function$
declare
  v_sub_id uuid;
  v_plan json;
begin
  select json_build_object('id', p.id, 'name', p.name, 'price_clp', p.price_clp, 'max_projects', p.max_projects)
    into v_plan
  from public.plans p
  where p.id = p_plan_id and p.is_active = true;

  if v_plan is null then
    raise exception 'invalid_plan';
  end if;

  insert into public.subscriptions (user_id, plan_id, status)
  values (auth.uid(), p_plan_id, 'pending')
  returning id into v_sub_id;

  return json_build_object(
    'subscription_id', v_sub_id,
    'plan', v_plan,
    'status', 'pending'
  );
end;
$function$;

grant execute on function public.al_request_upgrade to authenticated;
grant select, insert on public.subscriptions to authenticated;
revoke update, delete, truncate, references, trigger on public.subscriptions from anon, authenticated;
revoke select, insert on public.subscriptions from anon;
