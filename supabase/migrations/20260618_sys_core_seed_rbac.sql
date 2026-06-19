-- ══════════════════════════════════════════════════════════════════
--  SYS_CORE — Seed de permisos y roles de sistema (plantillas)
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. PERMISOS — sys_core
-- ──────────────────────────────────────────────────────────────────
INSERT INTO sys_core.permissions (id, module_id, resource, action, description) VALUES
  ('sys_core.company.manage',    'sys_core', 'company', 'manage', 'Editar configuración de la empresa'),
  ('sys_core.user.invite',       'sys_core', 'user',    'invite', 'Invitar usuarios a la empresa'),
  ('sys_core.user.remove',       'sys_core', 'user',    'remove', 'Remover usuarios de la empresa'),
  ('sys_core.role.manage',       'sys_core', 'role',    'manage', 'Crear/editar roles y permisos');

-- ──────────────────────────────────────────────────────────────────
-- 2. PERMISOS — area_leader
-- ──────────────────────────────────────────────────────────────────
INSERT INTO sys_core.permissions (id, module_id, resource, action, description) VALUES
  ('area_leader.project.view_all',  'area_leader', 'project', 'view_all',  'Ver todos los proyectos de la empresa'),
  ('area_leader.project.view_own',  'area_leader', 'project', 'view_own',  'Ver solo proyectos asignados'),
  ('area_leader.project.create',    'area_leader', 'project', 'create',    'Crear proyectos'),
  ('area_leader.project.edit',      'area_leader', 'project', 'edit',      'Editar cualquier proyecto'),
  ('area_leader.project.delete',    'area_leader', 'project', 'delete',    'Eliminar/archivar proyectos'),
  ('area_leader.task.view_all',     'area_leader', 'task',    'view_all',  'Ver todas las tareas'),
  ('area_leader.task.manage_own',   'area_leader', 'task',    'manage_own','Gestionar tareas propias'),
  ('area_leader.task.manage_all',   'area_leader', 'task',    'manage_all','Gestionar cualquier tarea'),
  ('area_leader.risk.manage',       'area_leader', 'risk',    'manage',    'Crear/editar riesgos'),
  ('area_leader.team.manage',       'area_leader', 'team',    'manage',    'Gestionar miembros del equipo'),
  ('area_leader.report.view',       'area_leader', 'report',  'view',      'Ver reportes y dashboards');

-- ──────────────────────────────────────────────────────────────────
-- 3. ROLES DE SISTEMA (plantillas, company_id NULL)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO sys_core.roles (id, company_id, name, description, is_system) VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'admin',  'Administrador de la empresa — acceso total', true),
  ('00000000-0000-0000-0000-000000000002', NULL, 'leader', 'Líder de proyecto — gestiona sus proyectos y equipo', true),
  ('00000000-0000-0000-0000-000000000003', NULL, 'member', 'Miembro — ve y gestiona solo lo asignado', true);

-- ── Permisos del rol "admin" → todo
INSERT INTO sys_core.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM sys_core.permissions;

-- ── Permisos del rol "leader"
INSERT INTO sys_core.role_permissions (role_id, permission_id) VALUES
  ('00000000-0000-0000-0000-000000000002', 'area_leader.project.view_all'),
  ('00000000-0000-0000-0000-000000000002', 'area_leader.project.create'),
  ('00000000-0000-0000-0000-000000000002', 'area_leader.project.edit'),
  ('00000000-0000-0000-0000-000000000002', 'area_leader.task.view_all'),
  ('00000000-0000-0000-0000-000000000002', 'area_leader.task.manage_all'),
  ('00000000-0000-0000-0000-000000000002', 'area_leader.risk.manage'),
  ('00000000-0000-0000-0000-000000000002', 'area_leader.team.manage'),
  ('00000000-0000-0000-0000-000000000002', 'area_leader.report.view'),
  ('00000000-0000-0000-0000-000000000002', 'sys_core.user.invite');

-- ── Permisos del rol "member"
INSERT INTO sys_core.role_permissions (role_id, permission_id) VALUES
  ('00000000-0000-0000-0000-000000000003', 'area_leader.project.view_own'),
  ('00000000-0000-0000-0000-000000000003', 'area_leader.task.manage_own');

-- ──────────────────────────────────────────────────────────────────
-- 4. FUNCIÓN: clonar roles de sistema al crear una empresa nueva
--    (cada empresa tiene su propia copia editable de admin/leader/member)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sys_core.clone_system_roles_to_company(p_company_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sys_role RECORD;
  v_new_role_id UUID;
BEGIN
  FOR v_sys_role IN SELECT * FROM sys_core.roles WHERE is_system = true LOOP
    INSERT INTO sys_core.roles (company_id, name, description, is_system)
    VALUES (p_company_id, v_sys_role.name, v_sys_role.description, false)
    RETURNING id INTO v_new_role_id;

    INSERT INTO sys_core.role_permissions (role_id, permission_id)
    SELECT v_new_role_id, permission_id
    FROM sys_core.role_permissions
    WHERE role_id = v_sys_role.id;
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 5. FUNCIÓN: crear empresa (solo quien la crea queda como admin)
-- ──────────────────────────────────────────────────────────────────
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

GRANT EXECUTE ON FUNCTION public.sys_create_company TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 6. FUNCIÓN: invitar usuario a la empresa (requiere permiso)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sys_invite_member(
  p_company_id UUID, p_email TEXT, p_role_name TEXT DEFAULT 'member'
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target_user UUID;
  v_role_id UUID;
  v_member_id UUID;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.user.invite') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.user.invite permission';
  END IF;

  SELECT id INTO v_role_id FROM sys_core.roles
  WHERE company_id = p_company_id AND name = p_role_name;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'invalid_role: % does not exist for this company', p_role_name;
  END IF;

  SELECT id INTO v_target_user FROM auth.users WHERE email = p_email;

  INSERT INTO sys_core.company_members (company_id, user_id, invited_email, status, invited_by)
  VALUES (p_company_id, v_target_user, p_email, 'pending', auth.uid())
  ON CONFLICT (company_id, user_id) DO NOTHING
  RETURNING id INTO v_member_id;

  IF v_target_user IS NOT NULL THEN
    INSERT INTO sys_core.user_company_roles (user_id, company_id, role_id, assigned_by)
    VALUES (v_target_user, p_company_id, v_role_id, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object(
    'member_id', v_member_id,
    'email', p_email,
    'role', p_role_name,
    'user_exists', v_target_user IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_invite_member TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 7. FUNCIÓN: aceptar invitación (el usuario invitado confirma)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sys_accept_invite(p_company_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE sys_core.company_members
  SET status = 'active', joined_at = now(), user_id = auth.uid()
  WHERE company_id = p_company_id
    AND (user_id = auth.uid() OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_accept_invite TO authenticated;
