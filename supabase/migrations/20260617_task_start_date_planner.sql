-- Fecha de inicio por tarea, para el planner/Gantt del proyecto: cada tarea
-- se ve como una barra de start_date a due_date, agrupada por group_name
-- (que ya se usa como "fase" en la UI de tareas).

alter table area_leader.tasks add column start_date date;

drop function public.al_upsert_task(uuid,uuid,uuid,text,text,text,date);

create function public.al_upsert_task(
  p_id uuid default null, p_project_id uuid default null, p_assigned_to uuid default null,
  p_title text default null, p_group_name text default null, p_status text default 'todo',
  p_due_date date default null, p_start_date date default null
)
returns uuid
language plpgsql
security definer
as $function$
declare v_id uuid;
begin
  if p_id is not null then
    update area_leader.tasks set assigned_to=p_assigned_to, title=coalesce(p_title,title),
      group_name=p_group_name, status=coalesce(p_status,status), due_date=p_due_date,
      start_date=p_start_date
    where id=p_id and user_id=auth.uid() returning id into v_id;
  else
    insert into area_leader.tasks(project_id,assigned_to,title,group_name,status,due_date,start_date,user_id)
    values(p_project_id,p_assigned_to,p_title,p_group_name,p_status,p_due_date,p_start_date,auth.uid()) returning id into v_id;
  end if; return v_id; end;
$function$;

grant execute on function public.al_upsert_task to authenticated;
revoke execute on function public.al_upsert_task(uuid,uuid,uuid,text,text,text,date,date) from anon;

-- al_tasks: expone start_date. Se recrea (drop+create) porque Postgres no
-- permite insertar columnas en medio del orden existente de una vista.
drop view public.al_tasks;

create view public.al_tasks as
 SELECT t.id,
    t.user_id,
    t.project_id,
    t.assigned_to,
    t.title,
    t.group_name,
    t.status,
    t.due_date,
    t.start_date,
    t.created_at,
    tm.name AS assigned_name,
    tm.initials AS assigned_initials,
    tm.color AS assigned_color
   FROM (area_leader.tasks t
     LEFT JOIN area_leader.team_members tm ON ((tm.id = t.assigned_to)))
  WHERE (t.user_id = auth.uid());

-- IMPORTANTE: drop+create restaura los grants por defecto de Postgres.
revoke insert, update, delete, truncate, references, trigger on public.al_tasks from anon, authenticated;
revoke select on public.al_tasks from anon;
grant select on public.al_tasks to authenticated;
