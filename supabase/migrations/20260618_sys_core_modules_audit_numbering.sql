-- ══════════════════════════════════════════════════════════════════
--  SYS_CORE — Módulos por empresa, auditoría genérica, numbering
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. COMPANY_MODULES — qué módulo está activo en qué empresa
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.company_modules (
  company_id  UUID NOT NULL REFERENCES sys_core.companies(id) ON DELETE CASCADE,
  module_id   TEXT NOT NULL REFERENCES sys_core.modules(id),
  active      BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ DEFAULT now(),
  activated_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (company_id, module_id)
);

ALTER TABLE sys_core.company_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_see_company_modules" ON sys_core.company_modules
  FOR SELECT USING (sys_core.is_member_of(company_id));

CREATE POLICY "admins_manage_company_modules" ON sys_core.company_modules
  FOR ALL USING (sys_core.has_permission(company_id, 'sys_core.company.manage'));

GRANT SELECT ON sys_core.company_modules TO authenticated;

-- Helper: ¿el módulo X está activo para la empresa Y?
CREATE OR REPLACE FUNCTION sys_core.module_active(p_company_id UUID, p_module_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM sys_core.company_modules
    WHERE company_id = p_company_id AND module_id = p_module_id AND active = true
  );
$$;

-- has_permission ahora también exige que el módulo del permiso esté activo
-- en la empresa (defensa adicional: aunque tengas el rol, si el módulo está
-- desactivado para tu empresa, el permiso no aplica)
CREATE OR REPLACE FUNCTION sys_core.has_permission(p_company_id UUID, p_permission_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sys_core.user_company_roles ucr
    JOIN sys_core.role_permissions rp ON rp.role_id = ucr.role_id
    JOIN sys_core.permissions perm ON perm.id = rp.permission_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND rp.permission_id = p_permission_id
      AND sys_core.module_active(p_company_id, perm.module_id)
  );
$$;

-- sys_core mismo siempre está activo (no se puede desactivar el core)
-- y se activa automáticamente todo módulo al crear empresa
CREATE OR REPLACE FUNCTION sys_core.activate_all_modules_for_company(p_company_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sys_core.company_modules (company_id, module_id, active)
  SELECT p_company_id, id, true FROM sys_core.modules WHERE active = true
  ON CONFLICT (company_id, module_id) DO NOTHING;
END;
$$;

-- Engancha la activación de módulos al flujo de creación de empresa existente
CREATE OR REPLACE FUNCTION public.sys_create_company(p_name TEXT, p_slug TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id UUID;
  v_admin_role_id UUID;
BEGIN
  INSERT INTO sys_core.companies (name, slug, created_by)
  VALUES (p_name, p_slug, auth.uid())
  RETURNING id INTO v_company_id;

  PERFORM sys_core.clone_system_roles_to_company(v_company_id);
  PERFORM sys_core.activate_all_modules_for_company(v_company_id);

  SELECT id INTO v_admin_role_id
  FROM sys_core.roles
  WHERE company_id = v_company_id AND name = 'admin';

  INSERT INTO sys_core.company_members (company_id, user_id, status, joined_at)
  VALUES (v_company_id, auth.uid(), 'active', now());

  INSERT INTO sys_core.user_company_roles (user_id, company_id, role_id, assigned_by)
  VALUES (auth.uid(), v_company_id, v_admin_role_id, auth.uid());

  RETURN v_company_id;
END;
$$;

-- Función admin: activar/desactivar un módulo para una empresa
CREATE OR REPLACE FUNCTION public.sys_set_company_module(
  p_company_id UUID, p_module_id TEXT, p_active BOOLEAN
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.company.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.company.manage';
  END IF;

  INSERT INTO sys_core.company_modules (company_id, module_id, active, activated_by)
  VALUES (p_company_id, p_module_id, p_active, auth.uid())
  ON CONFLICT (company_id, module_id)
  DO UPDATE SET active = p_active, activated_by = auth.uid(), activated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_set_company_module TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 2. AUDIT_LOG — genérico, cualquier módulo lo usa
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        REFERENCES sys_core.companies(id) ON DELETE CASCADE,
  module_id   TEXT        REFERENCES sys_core.modules(id),
  resource    TEXT        NOT NULL,        -- ej: 'project', 'task'
  resource_id UUID,                        -- id del registro afectado
  action      TEXT        NOT NULL CHECK (action IN ('create','update','delete','archive','restore')),
  actor_id    UUID        REFERENCES auth.users(id),
  changes     JSONB,                       -- diff o snapshot relevante
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_company_created ON sys_core.audit_log(company_id, created_at DESC);
CREATE INDEX idx_audit_resource        ON sys_core.audit_log(resource, resource_id);

ALTER TABLE sys_core.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_audit_log" ON sys_core.audit_log
  FOR SELECT USING (sys_core.is_member_of(company_id));

GRANT SELECT ON sys_core.audit_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON sys_core.audit_log FROM anon, authenticated;

-- Helper: cualquier función SECURITY DEFINER puede llamar esto
CREATE OR REPLACE FUNCTION sys_core.log_audit(
  p_company_id UUID, p_module_id TEXT, p_resource TEXT, p_resource_id UUID,
  p_action TEXT, p_changes JSONB DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sys_core.audit_log (company_id, module_id, resource, resource_id, action, actor_id, changes)
  VALUES (p_company_id, p_module_id, p_resource, p_resource_id, p_action, auth.uid(), p_changes);
END;
$$;

-- RPC: leer el log de auditoría de una empresa (paginado simple)
CREATE OR REPLACE FUNCTION public.sys_get_audit_log(
  p_company_id UUID, p_limit INT DEFAULT 50, p_resource TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  IF NOT sys_core.is_member_of(p_company_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of this company';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT al.id, al.module_id, al.resource, al.resource_id, al.action,
      al.changes, al.created_at, up.full_name AS actor_name, up.email AS actor_email
    FROM sys_core.audit_log al
    LEFT JOIN sys_core.user_profiles up ON up.id = al.actor_id
    WHERE al.company_id = p_company_id
      AND (p_resource IS NULL OR al.resource = p_resource)
    ORDER BY al.created_at DESC
    LIMIT p_limit
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_get_audit_log TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 3. NUMBER_SEQUENCES — numeración legible por (empresa, prefijo)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.number_sequences (
  company_id  UUID NOT NULL REFERENCES sys_core.companies(id) ON DELETE CASCADE,
  prefix      TEXT NOT NULL,        -- 'PRJ', 'TSK'
  last_value  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix)
);

-- RLS habilitado sin policies: solo accesible vía sys_core.next_number()
-- (SECURITY DEFINER), nunca directo desde el cliente.
ALTER TABLE sys_core.number_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sys_core.number_sequences FROM anon, authenticated;

-- Atómico: UPDATE...RETURNING evita colisiones bajo concurrencia
-- (el row lock de Postgres serializa los incrementos por fila)
CREATE OR REPLACE FUNCTION sys_core.next_number(p_company_id UUID, p_prefix TEXT, p_padding INT DEFAULT 4)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_next BIGINT;
BEGIN
  INSERT INTO sys_core.number_sequences (company_id, prefix, last_value)
  VALUES (p_company_id, p_prefix, 1)
  ON CONFLICT (company_id, prefix)
  DO UPDATE SET last_value = sys_core.number_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || lpad(v_next::TEXT, p_padding, '0');
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 4. Aplicar numbering a area_leader.projects y tasks
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE area_leader.projects ADD COLUMN code TEXT;
ALTER TABLE area_leader.tasks    ADD COLUMN code TEXT;

CREATE UNIQUE INDEX idx_projects_company_code ON area_leader.projects(company_id, code);
CREATE UNIQUE INDEX idx_tasks_company_code    ON area_leader.tasks(company_id, code);

-- Trigger: autogenerar code al insertar (si no viene seteado)
CREATE OR REPLACE FUNCTION area_leader.assign_project_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL AND NEW.company_id IS NOT NULL THEN
    NEW.code := sys_core.next_number(NEW.company_id, 'PRJ');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_assign_code
  BEFORE INSERT ON area_leader.projects
  FOR EACH ROW EXECUTE FUNCTION area_leader.assign_project_code();

CREATE OR REPLACE FUNCTION area_leader.assign_task_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL AND NEW.company_id IS NOT NULL THEN
    NEW.code := sys_core.next_number(NEW.company_id, 'TSK');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_assign_code
  BEFORE INSERT ON area_leader.tasks
  FOR EACH ROW EXECUTE FUNCTION area_leader.assign_task_code();

-- Actualizar vistas para exponer "code"
DROP VIEW IF EXISTS public.al_projects;
CREATE VIEW public.al_projects AS
 SELECT p.id, p.code, p.company_id, p.user_id, p.created_by, p.name, p.client, p.status,
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
 SELECT t.id, t.code, t.company_id, t.user_id, t.project_id, t.assigned_to, t.title,
    t.group_name, t.status, t.due_date, t.start_date, t.created_at,
    tm.name AS assigned_name, tm.initials AS assigned_initials, tm.color AS assigned_color
   FROM area_leader.tasks t
   LEFT JOIN area_leader.team_members tm ON tm.id = t.assigned_to;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.al_tasks FROM anon, authenticated;
REVOKE SELECT ON public.al_tasks FROM anon;
GRANT SELECT ON public.al_tasks TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 5. Hook de auditoría en las funciones RPC existentes
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.al_upsert_project(
  p_company_id UUID, p_id UUID DEFAULT NULL, p_name TEXT DEFAULT NULL,
  p_client TEXT DEFAULT NULL, p_status TEXT DEFAULT 'planning',
  p_progress INT DEFAULT 0, p_estimated INT DEFAULT 0, p_leader_id UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL, p_description TEXT DEFAULT NULL, p_start_date DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID; v_is_new BOOLEAN := p_id IS NULL;
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

  PERFORM sys_core.log_audit(
    p_company_id, 'area_leader', 'project', v_id,
    CASE WHEN v_is_new THEN 'create' ELSE 'update' END,
    jsonb_build_object('name', p_name, 'status', p_status)
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_upsert_project TO authenticated;

CREATE OR REPLACE FUNCTION public.al_delete_project(p_company_id UUID, p_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_status TEXT; v_archived BOOLEAN;
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
    v_archived := true;
  ELSE
    DELETE FROM area_leader.activity        WHERE project_id=p_id AND company_id=p_company_id;
    DELETE FROM area_leader.risks           WHERE project_id=p_id AND company_id=p_company_id;
    DELETE FROM area_leader.tasks           WHERE project_id=p_id AND company_id=p_company_id;
    DELETE FROM area_leader.workload        WHERE project_id=p_id AND company_id=p_company_id;
    DELETE FROM area_leader.project_members WHERE project_id=p_id AND company_id=p_company_id;
    DELETE FROM area_leader.projects        WHERE id=p_id AND company_id=p_company_id;
    v_archived := false;
  END IF;

  PERFORM sys_core.log_audit(
    p_company_id, 'area_leader', 'project', p_id,
    CASE WHEN v_archived THEN 'archive' ELSE 'delete' END
  );

  RETURN json_build_object('archived', v_archived);
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_delete_project TO authenticated;

CREATE OR REPLACE FUNCTION public.al_upsert_task(
  p_company_id UUID, p_id UUID DEFAULT NULL, p_project_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL, p_title TEXT DEFAULT NULL, p_group_name TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'todo', p_due_date DATE DEFAULT NULL, p_start_date DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_is_assignee BOOLEAN;
  v_is_new BOOLEAN := p_id IS NULL;
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

  PERFORM sys_core.log_audit(
    p_company_id, 'area_leader', 'task', v_id,
    CASE WHEN v_is_new THEN 'create' ELSE 'update' END,
    jsonb_build_object('title', p_title, 'status', p_status)
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_upsert_task TO authenticated;
