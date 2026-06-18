-- Estados finales nuevos (cancelled, closed) + soft delete de proyectos en
-- estado final + start_date para el planner de línea de tiempo.

-- 1) Nuevos estados finales: cancelled y closed (junto a completed, ya existente).
alter table area_leader.projects drop constraint projects_status_check;
alter table area_leader.projects add constraint projects_status_check
  check (status in ('backlog','planning','active','at-risk','on-hold','completed','cancelled','closed'));

-- 2) Fecha de inicio del proyecto. Distinta de created_at (cuándo se registró
-- en el sistema) — start_date es cuándo arrancó formalmente, usado por el
-- planner/línea de tiempo.
alter table area_leader.projects add column start_date date;

-- 3) Soft delete: proyectos en estado final (completed/cancelled/closed) se
-- archivan en vez de borrarse. Proyectos en otros estados se siguen borrando
-- de verdad, como antes.
alter table area_leader.projects add column archived_at timestamptz;

drop function public.al_delete_project(uuid);

create function public.al_delete_project(p_id uuid)
returns json
language plpgsql
security definer
as $function$
declare
  v_status text;
begin
  select status into v_status
  from area_leader.projects
  where id = p_id and user_id = auth.uid();

  if v_status is null then
    raise exception 'project_not_found';
  end if;

  if v_status in ('completed', 'cancelled', 'closed') then
    update area_leader.projects
    set archived_at = now()
    where id = p_id and user_id = auth.uid();
    return json_build_object('archived', true);
  end if;

  DELETE FROM area_leader.activity        WHERE project_id=p_id AND user_id=auth.uid();
  DELETE FROM area_leader.risks           WHERE project_id=p_id AND user_id=auth.uid();
  DELETE FROM area_leader.tasks           WHERE project_id=p_id AND user_id=auth.uid();
  DELETE FROM area_leader.workload        WHERE project_id=p_id AND user_id=auth.uid();
  DELETE FROM area_leader.project_members WHERE project_id=p_id AND user_id=auth.uid();
  DELETE FROM area_leader.projects        WHERE id=p_id AND user_id=auth.uid();
  return json_build_object('archived', false);
end;
$function$;

grant execute on function public.al_delete_project to authenticated;

-- al_upsert_project ahora acepta p_start_date.
create or replace function public.al_upsert_project(
  p_id uuid default null, p_name text default null, p_client text default null,
  p_status text default 'planning', p_progress int default 0, p_estimated int default 0,
  p_leader_id uuid default null, p_due_date date default null, p_description text default null,
  p_start_date date default null
)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_id uuid;
begin
  if p_id is not null then
    update area_leader.projects set
      name=coalesce(p_name,name),
      client=coalesce(p_client,client),
      status=coalesce(p_status,status),
      progress=coalesce(p_progress,progress),
      estimated=coalesce(p_estimated,estimated),
      leader_id=p_leader_id,
      due_date=p_due_date,
      description=p_description,
      start_date=p_start_date,
      updated_at=now()
    where id=p_id and user_id=auth.uid()
    returning id into v_id;
  else
    if not public.al_can_create_project() then
      raise exception 'project_limit_reached'
        using detail = 'El plan actual no permite crear más proyectos.',
              hint = 'upgrade_required';
    end if;

    insert into area_leader.projects(name,client,status,progress,estimated,leader_id,due_date,description,start_date,user_id)
    values(p_name,p_client,p_status,p_progress,p_estimated,p_leader_id,p_due_date,p_description,p_start_date,auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$function$;

grant execute on function public.al_upsert_project to authenticated;

-- al_projects: expone start_date y archived_at. Se recrea (drop+create) en
-- vez de CREATE OR REPLACE porque Postgres no permite insertar columnas en
-- medio del orden existente de una vista.
drop view public.al_projects;

create view public.al_projects as
 SELECT p.id,
    p.user_id,
    p.name,
    p.client,
    p.status,
    p.progress,
    p.estimated,
    p.leader_id,
    p.due_date,
    p.start_date,
    p.archived_at,
    p.description,
    p.created_at,
    p.updated_at,
    tm.name AS leader_name,
    tm.initials AS leader_initials,
    tm.color AS leader_color,
    tm.email AS leader_email
   FROM (area_leader.projects p
     LEFT JOIN area_leader.team_members tm ON ((tm.id = p.leader_id)))
  WHERE (p.user_id = auth.uid());

-- IMPORTANTE: drop+create restaura los grants por defecto de Postgres
-- (INSERT/UPDATE/DELETE/TRUNCATE para anon/authenticated). Esta vista es de
-- solo lectura: las escrituras van siempre por al_upsert_project/al_delete_project.
revoke insert, update, delete, truncate, references, trigger on public.al_projects from anon, authenticated;
revoke select on public.al_projects from anon;
grant select on public.al_projects to authenticated;
