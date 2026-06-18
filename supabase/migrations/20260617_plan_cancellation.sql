-- Flujo de cancelación de plan: "se cancela al final del período", sin bajar
-- el plan de inmediato (todavía no hay cobro real ni ciclos de facturación
-- automatizados, así que el cierre real del período lo procesará a futuro
-- el job/función que conecte con el proveedor de pago).

alter table public.user_plans
  add column cancel_at_period_end boolean not null default false;

-- Marca el plan actual para cancelarse al final del período.
-- No cambia plan_id ahora; solo deja la intención registrada con fecha objetivo.
create or replace function public.al_cancel_plan()
returns json
language plpgsql
security definer
as $function$
declare
  v_expires timestamptz;
begin
  -- Si no hay expires_at todavía (plan sin ciclo de facturación conocido),
  -- usamos +30 días como fecha de referencia para cuándo se aplicaría la baja.
  select coalesce(expires_at, now() + interval '30 days')
    into v_expires
  from public.user_plans
  where user_id = auth.uid();

  update public.user_plans
  set cancel_at_period_end = true,
      expires_at = v_expires,
      updated_at = now()
  where user_id = auth.uid();

  return json_build_object(
    'cancel_at_period_end', true,
    'expires_at', v_expires
  );
end;
$function$;

-- Revierte una cancelación pendiente (el usuario cambió de opinión antes
-- de que se aplique la baja).
create or replace function public.al_undo_cancel_plan()
returns json
language plpgsql
security definer
as $function$
begin
  update public.user_plans
  set cancel_at_period_end = false,
      updated_at = now()
  where user_id = auth.uid();

  return json_build_object('cancel_at_period_end', false);
end;
$function$;

grant execute on function public.al_cancel_plan to authenticated;
grant execute on function public.al_undo_cancel_plan to authenticated;

-- al_plan_status ahora también informa si hay una cancelación pendiente
-- y la fecha en que se aplicaría, para que la UI pueda mostrarlo.
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
  v_cancel_at_period_end boolean;
  v_expires_at timestamptz;
  result json;
begin
  select coalesce(up.plan_id, 'basic'),
         coalesce(up.cancel_at_period_end, false),
         up.expires_at
    into v_plan_id, v_cancel_at_period_end, v_expires_at
  from public.user_plans up
  where up.user_id = auth.uid();

  if v_plan_id is null then
    v_plan_id := 'basic';
    v_cancel_at_period_end := false;
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
    'next_plan', v_next,
    'cancel_at_period_end', v_cancel_at_period_end,
    'expires_at', v_expires_at
  );

  return result;
end;
$function$;
