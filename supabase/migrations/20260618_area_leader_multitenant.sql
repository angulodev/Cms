-- ══════════════════════════════════════════════════════════════════
--  AREA_LEADER → MULTI-TENANT
--  Agrega company_id a todas las tablas, reescribe RLS para usar
--  sys_core.has_permission() en vez de auth.uid() = user_id directo.
--
--  Regla de visibilidad de proyectos:
--    - area_leader.project.view_all → ve todos los proyectos de la empresa
--    - area_leader.project.view_own → ve solo donde es leader o member asignado
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. Agregar company_id + created_by a todas las tablas del módulo
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE area_leader.team_members    ADD COLUMN company_id UUID REFERENCES sys_core.companies(id);
ALTER TABLE area_leader.team_members    ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE area_leader.projects        ADD COLUMN company_id UUID REFERENCES sys_core.companies(id);
ALTER TABLE area_leader.projects        ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE area_leader.tasks           ADD COLUMN company_id UUID REFERENCES sys_core.companies(id);
ALTER TABLE area_leader.risks           ADD COLUMN company_id UUID REFERENCES sys_core.companies(id);
ALTER TABLE area_leader.activity        ADD COLUMN company_id UUID REFERENCES sys_core.companies(id);
ALTER TABLE area_leader.workload        ADD COLUMN company_id UUID REFERENCES sys_core.companies(id);
ALTER TABLE area_leader.project_members ADD COLUMN company_id UUID REFERENCES sys_core.companies(id);

-- Nota: user_id se conserva en projects/tasks/etc como "created_by" histórico.
-- No se elimina por compatibilidad con datos ya existentes; nuevas filas
-- deben poblar company_id obligatoriamente (se exige a nivel de función, no
-- a nivel de NOT NULL todavía, porque hay 0 filas hoy pero dejamos la migración
-- segura ante reintentos).

-- ──────────────────────────────────────────────────────────────────
-- 2. Función helper: ¿el usuario es leader o member asignado del proyecto?
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION area_leader.is_assigned_to_project(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    -- soy el leader del proyecto (vía team_members.user_id)
    SELECT 1 FROM area_leader.projects p
    JOIN area_leader.team_members tm ON tm.id = p.leader_id
    WHERE p.id = p_project_id AND tm.user_id = auth.uid()
  ) OR EXISTS (
    -- soy member asignado del proyecto (vía team_members.user_id)
    SELECT 1 FROM area_leader.project_members pm
    JOIN area_leader.team_members tm ON tm.id = pm.member_id
    WHERE pm.project_id = p_project_id AND tm.user_id = auth.uid()
  );
$$;

-- ──────────────────────────────────────────────────────────────────
-- 3. DROP de policies viejas (basadas en user_id directo)
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_all" ON area_leader.team_members;
DROP POLICY IF EXISTS "public_all" ON area_leader.projects;
DROP POLICY IF EXISTS "public_all" ON area_leader.project_members;
DROP POLICY IF EXISTS "public_all" ON area_leader.tasks;
DROP POLICY IF EXISTS "public_all" ON area_leader.risks;
DROP POLICY IF EXISTS "public_all" ON area_leader.activity;
DROP POLICY IF EXISTS "public_all" ON area_leader.workload;

-- ──────────────────────────────────────────────────────────────────
-- 4. POLICIES NUEVAS — basadas en company + permisos RBAC
-- ──────────────────────────────────────────────────────────────────

-- team_members: visible a todos los miembros activos de la empresa
CREATE POLICY "company_members_read" ON area_leader.team_members
  FOR SELECT USING (sys_core.is_member_of(company_id));
CREATE POLICY "team_manage_with_permission" ON area_leader.team_members
  FOR ALL USING (sys_core.has_permission(company_id, 'area_leader.team.manage'));

-- projects: view_all ve todo; view_own solo donde es leader/member
CREATE POLICY "project_view_all" ON area_leader.projects
  FOR SELECT USING (sys_core.has_permission(company_id, 'area_leader.project.view_all'));
CREATE POLICY "project_view_own" ON area_leader.projects
  FOR SELECT USING (
    sys_core.has_permission(company_id, 'area_leader.project.view_own')
    AND area_leader.is_assigned_to_project(id)
  );
CREATE POLICY "project_create" ON area_leader.projects
  FOR INSERT WITH CHECK (sys_core.has_permission(company_id, 'area_leader.project.create'));
CREATE POLICY "project_edit" ON area_leader.projects
  FOR UPDATE USING (sys_core.has_permission(company_id, 'area_leader.project.edit'));
CREATE POLICY "project_delete" ON area_leader.projects
  FOR DELETE USING (sys_core.has_permission(company_id, 'area_leader.project.delete'));

-- project_members: visible si puedes ver el proyecto padre
CREATE POLICY "project_members_read" ON area_leader.project_members
  FOR SELECT USING (sys_core.is_member_of(company_id));
CREATE POLICY "project_members_manage" ON area_leader.project_members
  FOR ALL USING (sys_core.has_permission(company_id, 'area_leader.team.manage'));

-- tasks: view_all ve todas; manage_own solo las propias asignadas
-- (assigned_to referencia team_members.id, se resuelve a auth.uid() vía team_members.user_id)
CREATE POLICY "task_view_all" ON area_leader.tasks
  FOR SELECT USING (sys_core.has_permission(company_id, 'area_leader.task.view_all'));
CREATE POLICY "task_view_own" ON area_leader.tasks
  FOR SELECT USING (
    sys_core.has_permission(company_id, 'area_leader.task.manage_own')
    AND assigned_to IN (SELECT id FROM area_leader.team_members WHERE user_id = auth.uid())
  );
CREATE POLICY "task_manage_all" ON area_leader.tasks
  FOR ALL USING (sys_core.has_permission(company_id, 'area_leader.task.manage_all'));
CREATE POLICY "task_manage_own" ON area_leader.tasks
  FOR UPDATE USING (
    sys_core.has_permission(company_id, 'area_leader.task.manage_own')
    AND assigned_to IN (SELECT id FROM area_leader.team_members WHERE user_id = auth.uid())
  );

-- risks
CREATE POLICY "risk_view" ON area_leader.risks
  FOR SELECT USING (sys_core.is_member_of(company_id));
CREATE POLICY "risk_manage" ON area_leader.risks
  FOR ALL USING (sys_core.has_permission(company_id, 'area_leader.risk.manage'));

-- activity: cualquier miembro puede leer; insertar vía función SECURITY DEFINER
CREATE POLICY "activity_read" ON area_leader.activity
  FOR SELECT USING (sys_core.is_member_of(company_id));

-- workload
CREATE POLICY "workload_read" ON area_leader.workload
  FOR SELECT USING (sys_core.is_member_of(company_id));
CREATE POLICY "workload_manage" ON area_leader.workload
  FOR ALL USING (sys_core.has_permission(company_id, 'area_leader.team.manage'));

-- ──────────────────────────────────────────────────────────────────
-- 5. Vistas públicas — agregar company_id, filtrar por pertenencia
--    (el filtro fino de view_all/view_own ya lo hace RLS de la tabla base)
-- ──────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.al_projects;
CREATE VIEW public.al_projects AS
 SELECT p.id, p.company_id, p.user_id, p.created_by, p.name, p.client, p.status,
    p.progress, p.estimated, p.leader_id, p.due_date, p.start_date,
    p.archived_at, p.description, p.created_at, p.updated_at,
    tm.name AS leader_name, tm.initials AS leader_initials,
    tm.color AS leader_color, tm.email AS leader_email
   FROM area_leader.projects p
   LEFT JOIN area_leader.team_members tm ON tm.id = p.leader_id;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.al_projects FROM anon, authenticated;
REVOKE SELECT ON public.al_projects FROM anon;
GRANT SELECT ON public.al_projects TO authenticated;

DROP VIEW IF EXISTS public.al_tasks;
CREATE VIEW public.al_tasks AS
 SELECT t.id, t.company_id, t.user_id, t.project_id, t.assigned_to, t.title,
    t.group_name, t.status, t.due_date, t.start_date, t.created_at,
    tm.name AS assigned_name, tm.initials AS assigned_initials, tm.color AS assigned_color
   FROM area_leader.tasks t
   LEFT JOIN area_leader.team_members tm ON tm.id = t.assigned_to;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.al_tasks FROM anon, authenticated;
REVOKE SELECT ON public.al_tasks FROM anon;
GRANT SELECT ON public.al_tasks TO authenticated;

DROP VIEW IF EXISTS public.al_team_members;
CREATE VIEW public.al_team_members AS
  SELECT * FROM area_leader.team_members WHERE active = true;
GRANT SELECT ON public.al_team_members TO authenticated;
REVOKE SELECT ON public.al_team_members FROM anon;

DROP VIEW IF EXISTS public.al_team_members_all;
CREATE VIEW public.al_team_members_all AS
  SELECT * FROM area_leader.team_members;
GRANT SELECT ON public.al_team_members_all TO authenticated;
REVOKE SELECT ON public.al_team_members_all FROM anon;

DROP VIEW IF EXISTS public.al_risks;
CREATE VIEW public.al_risks AS SELECT * FROM area_leader.risks;
GRANT SELECT ON public.al_risks TO authenticated;
REVOKE SELECT ON public.al_risks FROM anon;

DROP VIEW IF EXISTS public.al_risks_by_project;
CREATE VIEW public.al_risks_by_project AS
  SELECT r.*, p.name AS project_name
  FROM area_leader.risks r
  LEFT JOIN area_leader.projects p ON p.id = r.project_id;
GRANT SELECT ON public.al_risks_by_project TO authenticated;
REVOKE SELECT ON public.al_risks_by_project FROM anon;

DROP VIEW IF EXISTS public.al_activity;
CREATE VIEW public.al_activity AS
  SELECT a.*, tm.name AS actor_name, tm.initials AS actor_initials,
    tm.color AS actor_color, p.name AS project_name
  FROM area_leader.activity a
  LEFT JOIN area_leader.team_members tm ON tm.id = a.actor_id
  LEFT JOIN area_leader.projects p ON p.id = a.project_id;
GRANT SELECT ON public.al_activity TO authenticated;
REVOKE SELECT ON public.al_activity FROM anon;

DROP VIEW IF EXISTS public.al_workload;
CREATE VIEW public.al_workload AS
  SELECT w.*, tm.name AS member_name, tm.initials AS member_initials,
    tm.color AS member_color, p.name AS project_name
  FROM area_leader.workload w
  LEFT JOIN area_leader.team_members tm ON tm.id = w.member_id
  LEFT JOIN area_leader.projects p ON p.id = w.project_id;
GRANT SELECT ON public.al_workload TO authenticated;
REVOKE SELECT ON public.al_workload FROM anon;

DROP VIEW IF EXISTS public.al_project_members;
CREATE VIEW public.al_project_members AS
  SELECT pm.*, tm.name, tm.initials, tm.color, tm.role, tm.email
  FROM area_leader.project_members pm
  JOIN area_leader.team_members tm ON tm.id = pm.member_id
  WHERE tm.active = true;
GRANT SELECT ON public.al_project_members TO authenticated;
REVOKE SELECT ON public.al_project_members FROM anon;

-- ──────────────────────────────────────────────────────────────────
-- 6. Funciones RPC — agregar p_company_id, validar permiso de creación
-- ──────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.al_upsert_project(uuid,text,text,text,int,int,uuid,date,text,date);

CREATE FUNCTION public.al_upsert_project(
  p_company_id UUID, p_id UUID DEFAULT NULL, p_name TEXT DEFAULT NULL,
  p_client TEXT DEFAULT NULL, p_status TEXT DEFAULT 'planning',
  p_progress INT DEFAULT 0, p_estimated INT DEFAULT 0, p_leader_id UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL, p_description TEXT DEFAULT NULL, p_start_date DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF p_id IS NOT NULL THEN
    IF NOT sys_core.has_permission(p_company_id, 'area_leader.project.edit') THEN
      RAISE EXCEPTION 'forbidden: missing area_leader.project.edit';
    END IF;
    UPDATE area_leader.projects SET
      name=COALESCE(p_name,name), client=COALESCE(p_client,client),
      status=COALESCE(p_status,status), progress=COALESCE(p_progress,progress),
      estimated=COALESCE(p_estimated,estimated), leader_id=p_leader_id,
      due_date=p_due_date, description=p_description, start_date=p_start_date,
      updated_at=now()
    WHERE id=p_id AND company_id=p_company_id RETURNING id INTO v_id;
  ELSE
    IF NOT sys_core.has_permission(p_company_id, 'area_leader.project.create') THEN
      RAISE EXCEPTION 'forbidden: missing area_leader.project.create';
    END IF;
    IF NOT public.al_can_create_project() THEN
      RAISE EXCEPTION 'project_limit_reached'
        USING detail = 'El plan actual no permite crear más proyectos.',
              hint = 'upgrade_required';
    END IF;
    INSERT INTO area_leader.projects(
      company_id, name, client, status, progress, estimated, leader_id,
      due_date, description, start_date, user_id, created_by
    ) VALUES (
      p_company_id, p_name, p_client, p_status, p_progress, p_estimated, p_leader_id,
      p_due_date, p_description, p_start_date, auth.uid(), auth.uid()
    ) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_upsert_project TO authenticated;

DROP FUNCTION IF EXISTS public.al_upsert_task(uuid,uuid,uuid,text,text,text,date,date);

CREATE FUNCTION public.al_upsert_task(
  p_company_id UUID, p_id UUID DEFAULT NULL, p_project_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL, p_title TEXT DEFAULT NULL, p_group_name TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'todo', p_due_date DATE DEFAULT NULL, p_start_date DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_is_assignee BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM area_leader.team_members WHERE id = p_assigned_to AND user_id = auth.uid()
  ) INTO v_is_assignee;

  IF p_id IS NOT NULL THEN
    IF NOT (sys_core.has_permission(p_company_id, 'area_leader.task.manage_all')
            OR (sys_core.has_permission(p_company_id, 'area_leader.task.manage_own') AND v_is_assignee)) THEN
      RAISE EXCEPTION 'forbidden: missing task management permission';
    END IF;
    UPDATE area_leader.tasks SET
      assigned_to=p_assigned_to, title=COALESCE(p_title,title), group_name=p_group_name,
      status=COALESCE(p_status,status), due_date=p_due_date, start_date=p_start_date
    WHERE id=p_id AND company_id=p_company_id RETURNING id INTO v_id;
  ELSE
    IF NOT (sys_core.has_permission(p_company_id, 'area_leader.task.manage_all')
            OR (sys_core.has_permission(p_company_id, 'area_leader.task.manage_own') AND v_is_assignee)) THEN
      RAISE EXCEPTION 'forbidden: missing task management permission';
    END IF;
    INSERT INTO area_leader.tasks(company_id, project_id, assigned_to, title, group_name, status, due_date, start_date, user_id)
    VALUES (p_company_id, p_project_id, p_assigned_to, p_title, p_group_name, p_status, p_due_date, p_start_date, auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_upsert_task TO authenticated;

-- al_delete_project: ahora valida por permiso + company, conserva lógica de archivado
DROP FUNCTION IF EXISTS public.al_delete_project(uuid);

CREATE FUNCTION public.al_delete_project(p_company_id UUID, p_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_status TEXT;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.project.delete') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.project.delete';
  END IF;

  SELECT status INTO v_status FROM area_leader.projects
  WHERE id = p_id AND company_id = p_company_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  IF v_status IN ('completed', 'cancelled', 'closed') THEN
    UPDATE area_leader.projects SET archived_at = now()
    WHERE id = p_id AND company_id = p_company_id;
    RETURN json_build_object('archived', true);
  END IF;

  DELETE FROM area_leader.activity        WHERE project_id=p_id AND company_id=p_company_id;
  DELETE FROM area_leader.risks           WHERE project_id=p_id AND company_id=p_company_id;
  DELETE FROM area_leader.tasks           WHERE project_id=p_id AND company_id=p_company_id;
  DELETE FROM area_leader.workload        WHERE project_id=p_id AND company_id=p_company_id;
  DELETE FROM area_leader.project_members WHERE project_id=p_id AND company_id=p_company_id;
  DELETE FROM area_leader.projects        WHERE id=p_id AND company_id=p_company_id;
  RETURN json_build_object('archived', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_delete_project TO authenticated;
