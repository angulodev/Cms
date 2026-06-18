-- ══════════════════════════════════════════════════════════════════
--  AREA LEADER PRO — Schema completo
--  Ejecutar en Supabase SQL Editor para instalar desde cero
--  Proyecto: https://github.com/angulodev/leader_pro
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
--  1. SCHEMA
-- ─────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS area_leader;

-- ─────────────────────────────────────────────────────────────────
--  2. TABLAS
-- ─────────────────────────────────────────────────────────────────

-- Equipo
CREATE TABLE area_leader.team_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  initials   TEXT        NOT NULL,
  role       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#3b82f6',
  email      TEXT,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Proyectos
CREATE TABLE area_leader.projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  client      TEXT,
  status      TEXT        NOT NULL DEFAULT 'planning'
              CHECK (status IN ('backlog','planning','active','at-risk','on-hold','completed')),
  progress    INT         NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  estimated   INT         NOT NULL DEFAULT 0 CHECK (estimated BETWEEN 0 AND 100),
  leader_id   UUID        REFERENCES area_leader.team_members(id),
  due_date    DATE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Relación proyecto ↔ miembro (many-to-many)
CREATE TABLE area_leader.project_members (
  project_id UUID NOT NULL REFERENCES area_leader.projects(id)     ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES area_leader.team_members(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, member_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tareas
CREATE TABLE area_leader.tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES area_leader.projects(id) ON DELETE CASCADE,
  assigned_to UUID        REFERENCES area_leader.team_members(id),
  title       TEXT        NOT NULL,
  group_name  TEXT,
  status      TEXT        NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo','in-progress','review','blocked','completed')),
  due_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Riesgos
CREATE TABLE area_leader.risks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES area_leader.projects(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  severity     TEXT        NOT NULL DEFAULT 'medium'
               CHECK (severity IN ('high','medium','low')),
  time_delta   TEXT,
  budget_delta TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Actividad
CREATE TABLE area_leader.activity (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        REFERENCES area_leader.projects(id) ON DELETE CASCADE,
  actor_id   UUID        REFERENCES area_leader.team_members(id),
  type       TEXT        NOT NULL CHECK (type IN ('comment','status','milestone','assignment')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Carga de trabajo semanal
CREATE TABLE area_leader.workload (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID        NOT NULL REFERENCES area_leader.team_members(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES area_leader.projects(id),
  week_start  DATE        NOT NULL,
  day_of_week INT         NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  hours       NUMERIC(4,1) NOT NULL,
  task_label  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
--  3. TRIGGER updated_at en projects
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION area_leader.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON area_leader.projects
  FOR EACH ROW EXECUTE FUNCTION area_leader.set_updated_at();

-- ─────────────────────────────────────────────────────────────────
--  4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE area_leader.team_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_leader.projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_leader.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_leader.tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_leader.risks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_leader.activity       ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_leader.workload       ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso público (ajustar para producción con auth)
CREATE POLICY "public_all" ON area_leader.team_members    FOR ALL USING (true);
CREATE POLICY "public_all" ON area_leader.projects        FOR ALL USING (true);
CREATE POLICY "public_all" ON area_leader.project_members FOR ALL USING (true);
CREATE POLICY "public_all" ON area_leader.tasks           FOR ALL USING (true);
CREATE POLICY "public_all" ON area_leader.risks           FOR ALL USING (true);
CREATE POLICY "public_all" ON area_leader.activity        FOR ALL USING (true);
CREATE POLICY "public_all" ON area_leader.workload        FOR ALL USING (true);

-- ─────────────────────────────────────────────────────────────────
--  5. VISTAS PÚBLICAS (PostgREST expone solo "public")
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.al_team_members AS
  SELECT * FROM area_leader.team_members WHERE active = true;

CREATE OR REPLACE VIEW public.al_team_members_all AS
  SELECT * FROM area_leader.team_members;

CREATE OR REPLACE VIEW public.al_projects AS
  SELECT p.*,
    tm.name     AS leader_name,
    tm.initials AS leader_initials,
    tm.color    AS leader_color,
    tm.email    AS leader_email
  FROM area_leader.projects p
  LEFT JOIN area_leader.team_members tm ON tm.id = p.leader_id;

CREATE OR REPLACE VIEW public.al_tasks AS
  SELECT t.*,
    tm.name     AS assigned_name,
    tm.initials AS assigned_initials,
    tm.color    AS assigned_color
  FROM area_leader.tasks t
  LEFT JOIN area_leader.team_members tm ON tm.id = t.assigned_to;

CREATE OR REPLACE VIEW public.al_risks AS
  SELECT * FROM area_leader.risks;

CREATE OR REPLACE VIEW public.al_risks_by_project AS
  SELECT r.*, p.name AS project_name
  FROM area_leader.risks r
  LEFT JOIN area_leader.projects p ON p.id = r.project_id;

CREATE OR REPLACE VIEW public.al_activity AS
  SELECT a.*,
    tm.name     AS actor_name,
    tm.initials AS actor_initials,
    tm.color    AS actor_color,
    p.name      AS project_name
  FROM area_leader.activity a
  LEFT JOIN area_leader.team_members tm ON tm.id = a.actor_id
  LEFT JOIN area_leader.projects p ON p.id = a.project_id;

CREATE OR REPLACE VIEW public.al_workload AS
  SELECT w.*,
    tm.name     AS member_name,
    tm.initials AS member_initials,
    tm.color    AS member_color,
    p.name      AS project_name
  FROM area_leader.workload w
  LEFT JOIN area_leader.team_members tm ON tm.id = w.member_id
  LEFT JOIN area_leader.projects p ON p.id = w.project_id;

CREATE OR REPLACE VIEW public.al_project_members AS
  SELECT pm.*, tm.name, tm.initials, tm.color, tm.role, tm.email
  FROM area_leader.project_members pm
  JOIN area_leader.team_members tm ON tm.id = pm.member_id
  WHERE tm.active = true;

-- Permisos de lectura en vistas
GRANT SELECT ON public.al_team_members      TO anon, authenticated;
GRANT SELECT ON public.al_team_members_all  TO anon, authenticated;
GRANT SELECT ON public.al_projects          TO anon, authenticated;
GRANT SELECT ON public.al_tasks             TO anon, authenticated;
GRANT SELECT ON public.al_risks             TO anon, authenticated;
GRANT SELECT ON public.al_risks_by_project  TO anon, authenticated;
GRANT SELECT ON public.al_activity          TO anon, authenticated;
GRANT SELECT ON public.al_workload          TO anon, authenticated;
GRANT SELECT ON public.al_project_members   TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
--  6. FUNCIONES RPC
-- ─────────────────────────────────────────────────────────────────

-- Actividad
CREATE OR REPLACE FUNCTION public.al_add_activity(
  p_project_id UUID, p_actor_id UUID, p_type TEXT, p_content TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO area_leader.activity(project_id, actor_id, type, content)
  VALUES (p_project_id, p_actor_id, p_type, p_content);
END; $$;

-- Miembros
CREATE OR REPLACE FUNCTION public.al_upsert_member(
  p_id UUID DEFAULT NULL, p_name TEXT DEFAULT NULL, p_initials TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL, p_color TEXT DEFAULT '#3b82f6',
  p_email TEXT DEFAULT NULL, p_active BOOLEAN DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE area_leader.team_members SET
      name=COALESCE(p_name,name), initials=COALESCE(p_initials,initials),
      role=COALESCE(p_role,role), color=COALESCE(p_color,color),
      email=COALESCE(p_email,email), active=COALESCE(p_active,active)
    WHERE id=p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO area_leader.team_members(name,initials,role,color,email,active)
    VALUES(p_name,p_initials,p_role,p_color,p_email,COALESCE(p_active,true))
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.al_deactivate_member(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN UPDATE area_leader.team_members SET active=false WHERE id=p_id; END; $$;

CREATE OR REPLACE FUNCTION public.al_activate_member(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN UPDATE area_leader.team_members SET active=true WHERE id=p_id; END; $$;

CREATE OR REPLACE FUNCTION public.al_delete_member(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM area_leader.team_members WHERE id=p_id; END; $$;

-- Proyectos
CREATE OR REPLACE FUNCTION public.al_upsert_project(
  p_id UUID DEFAULT NULL, p_name TEXT DEFAULT NULL, p_client TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'planning', p_progress INT DEFAULT 0, p_estimated INT DEFAULT 0,
  p_leader_id UUID DEFAULT NULL, p_due_date DATE DEFAULT NULL, p_description TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE area_leader.projects SET
      name=COALESCE(p_name,name), client=COALESCE(p_client,client),
      status=COALESCE(p_status,status), progress=COALESCE(p_progress,progress),
      estimated=COALESCE(p_estimated,estimated), leader_id=COALESCE(p_leader_id,leader_id),
      due_date=COALESCE(p_due_date,due_date), description=COALESCE(p_description,description),
      updated_at=now()
    WHERE id=p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO area_leader.projects(name,client,status,progress,estimated,leader_id,due_date,description)
    VALUES(p_name,p_client,p_status,p_progress,p_estimated,p_leader_id,p_due_date,p_description)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.al_delete_project(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM area_leader.activity     WHERE project_id=p_id;
  DELETE FROM area_leader.risks        WHERE project_id=p_id;
  DELETE FROM area_leader.tasks        WHERE project_id=p_id;
  DELETE FROM area_leader.workload     WHERE project_id=p_id;
  DELETE FROM area_leader.project_members WHERE project_id=p_id;
  DELETE FROM area_leader.projects     WHERE id=p_id;
END; $$;

-- Miembros de proyecto
CREATE OR REPLACE FUNCTION public.al_add_project_member(p_project_id UUID, p_member_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO area_leader.project_members(project_id,member_id)
  VALUES(p_project_id,p_member_id) ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.al_remove_project_member(p_project_id UUID, p_member_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM area_leader.project_members WHERE project_id=p_project_id AND member_id=p_member_id; END; $$;

-- Tareas
CREATE OR REPLACE FUNCTION public.al_upsert_task(
  p_id UUID DEFAULT NULL, p_project_id UUID DEFAULT NULL, p_assigned_to UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL, p_group_name TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'todo', p_due_date DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE area_leader.tasks SET
      assigned_to=p_assigned_to, title=COALESCE(p_title,title),
      group_name=p_group_name, status=COALESCE(p_status,status), due_date=p_due_date
    WHERE id=p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO area_leader.tasks(project_id,assigned_to,title,group_name,status,due_date)
    VALUES(p_project_id,p_assigned_to,p_title,p_group_name,p_status,p_due_date)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.al_delete_task(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM area_leader.tasks WHERE id=p_id; END; $$;

-- Riesgos
CREATE OR REPLACE FUNCTION public.al_upsert_risk(
  p_id UUID DEFAULT NULL, p_project_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'medium', p_time_delta TEXT DEFAULT NULL, p_budget_delta TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE area_leader.risks SET
      title=COALESCE(p_title,title), description=COALESCE(p_description,description),
      severity=COALESCE(p_severity,severity), time_delta=p_time_delta, budget_delta=p_budget_delta
    WHERE id=p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO area_leader.risks(project_id,title,description,severity,time_delta,budget_delta)
    VALUES(p_project_id,p_title,p_description,p_severity,p_time_delta,p_budget_delta)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.al_delete_risk(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM area_leader.risks WHERE id=p_id; END; $$;

-- ─────────────────────────────────────────────────────────────────
--  7. RPCs DE REPORTES
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.al_report_summary()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_build_object(
    'total_projects',   (SELECT COUNT(*) FROM area_leader.projects),
    'by_status',        (SELECT json_agg(r) FROM (SELECT status, COUNT(*) AS count FROM area_leader.projects GROUP BY status) r),
    'avg_progress',     (SELECT ROUND(AVG(progress)::numeric,1) FROM area_leader.projects),
    'avg_estimated',    (SELECT ROUND(AVG(estimated)::numeric,1) FROM area_leader.projects),
    'total_tasks',      (SELECT COUNT(*) FROM area_leader.tasks),
    'tasks_by_status',  (SELECT json_agg(r) FROM (SELECT status, COUNT(*) AS count FROM area_leader.tasks GROUP BY status) r),
    'completed_tasks',  (SELECT COUNT(*) FROM area_leader.tasks WHERE status='completed'),
    'blocked_tasks',    (SELECT COUNT(*) FROM area_leader.tasks WHERE status='blocked'),
    'total_members',    (SELECT COUNT(*) FROM area_leader.team_members WHERE active=true),
    'overdue_projects', (SELECT COUNT(*) FROM area_leader.projects WHERE due_date < CURRENT_DATE AND status != 'completed')
  ) INTO result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.al_report_progress()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_agg(r ORDER BY r.progress DESC) INTO result FROM (
    SELECT p.id, p.name, p.status, p.progress, p.estimated, p.due_date,
      (p.progress - p.estimated) AS deviation, tm.name AS leader_name,
      (SELECT COUNT(*) FROM area_leader.tasks t WHERE t.project_id=p.id) AS task_count,
      (SELECT COUNT(*) FROM area_leader.tasks t WHERE t.project_id=p.id AND t.status='completed') AS tasks_done
    FROM area_leader.projects p
    LEFT JOIN area_leader.team_members tm ON tm.id=p.leader_id
  ) r;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.al_report_activity(p_days INT DEFAULT 14)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_agg(r ORDER BY r.day DESC) INTO result FROM (
    SELECT DATE(created_at) AS day, COUNT(*) AS events,
      COUNT(*) FILTER (WHERE type='comment')   AS comments,
      COUNT(*) FILTER (WHERE type='status')    AS status_changes,
      COUNT(*) FILTER (WHERE type='milestone') AS milestones
    FROM area_leader.activity
    WHERE created_at >= CURRENT_DATE - p_days
    GROUP BY DATE(created_at)
  ) r;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.al_report_team_load()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_agg(r ORDER BY r.projects_count DESC) INTO result FROM (
    SELECT tm.id, tm.name, tm.initials, tm.color, tm.role,
      COUNT(DISTINCT pm.project_id) AS projects_count,
      COUNT(DISTINCT t.id) AS tasks_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status='blocked') AS blocked_tasks
    FROM area_leader.team_members tm
    LEFT JOIN area_leader.project_members pm ON pm.member_id=tm.id
    LEFT JOIN area_leader.tasks t ON t.assigned_to=tm.id
    WHERE tm.active=true
    GROUP BY tm.id, tm.name, tm.initials, tm.color, tm.role
  ) r;
  RETURN result;
END; $$;

-- Permisos en todas las RPCs
GRANT EXECUTE ON FUNCTION public.al_add_activity            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_upsert_member           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_deactivate_member       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_activate_member         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_delete_member           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_upsert_project          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_delete_project          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_add_project_member      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_remove_project_member   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_upsert_task             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_delete_task             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_upsert_risk             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_delete_risk             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_report_summary          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_report_progress         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_report_activity         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.al_report_team_load        TO anon, authenticated;
