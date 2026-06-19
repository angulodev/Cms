-- ══════════════════════════════════════════════════════════════════
--  SYS_CORE — RPCs para el módulo de Administración de Sistema
--  (gestión de usuarios, roles custom y permisos vía UI)
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. USUARIOS
-- ──────────────────────────────────────────────────────────────────

-- Lista miembros de la empresa con su perfil + el/los roles que tienen.
CREATE OR REPLACE FUNCTION public.sys_list_members(p_company_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.company.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.company.manage';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.joined_at NULLS LAST), '[]'::json) INTO result
  FROM (
    SELECT
      cm.id AS member_id,
      cm.user_id,
      cm.invited_email,
      cm.status,
      cm.invited_at,
      cm.joined_at,
      up.full_name,
      up.email,
      up.avatar_url,
      (
        SELECT json_agg(json_build_object('role_id', r.id, 'role_name', r.name))
        FROM sys_core.user_company_roles ucr
        JOIN sys_core.roles r ON r.id = ucr.role_id
        WHERE ucr.user_id = cm.user_id AND ucr.company_id = p_company_id
      ) AS roles
    FROM sys_core.company_members cm
    LEFT JOIN sys_core.user_profiles up ON up.id = cm.user_id
    WHERE cm.company_id = p_company_id
  ) t;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_list_members TO authenticated;

-- Cambia el rol de un miembro (reemplaza — un usuario tiene un rol activo
-- por empresa en el modelo actual de UI, aunque la tabla soporte varios).
CREATE OR REPLACE FUNCTION public.sys_change_member_role(
  p_company_id UUID, p_user_id UUID, p_role_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role_company UUID;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.company.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.company.manage';
  END IF;

  SELECT company_id INTO v_role_company FROM sys_core.roles WHERE id = p_role_id;
  IF v_role_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'invalid_role: role does not belong to this company';
  END IF;

  DELETE FROM sys_core.user_company_roles
  WHERE user_id = p_user_id AND company_id = p_company_id;

  INSERT INTO sys_core.user_company_roles (user_id, company_id, role_id, assigned_by)
  VALUES (p_user_id, p_company_id, p_role_id, auth.uid());

  PERFORM sys_core.log_audit(p_company_id, 'sys_core', 'member_role', p_user_id, 'update',
    jsonb_build_object('new_role_id', p_role_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_change_member_role TO authenticated;

-- Revoca el acceso de un miembro (no lo borra: queda trazado como 'revoked').
CREATE OR REPLACE FUNCTION public.sys_revoke_member(p_company_id UUID, p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.company.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.company.manage';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_revoke_self: no puedes revocar tu propio acceso';
  END IF;

  UPDATE sys_core.company_members
  SET status = 'revoked'
  WHERE company_id = p_company_id AND user_id = p_user_id;

  DELETE FROM sys_core.user_company_roles
  WHERE company_id = p_company_id AND user_id = p_user_id;

  PERFORM sys_core.log_audit(p_company_id, 'sys_core', 'member', p_user_id, 'delete');
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_revoke_member TO authenticated;

-- Reactiva a un miembro previamente revocado.
CREATE OR REPLACE FUNCTION public.sys_reactivate_member(p_company_id UUID, p_user_id UUID, p_role_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.company.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.company.manage';
  END IF;

  UPDATE sys_core.company_members
  SET status = 'active', joined_at = COALESCE(joined_at, now())
  WHERE company_id = p_company_id AND user_id = p_user_id;

  INSERT INTO sys_core.user_company_roles (user_id, company_id, role_id, assigned_by)
  VALUES (p_user_id, p_company_id, p_role_id, auth.uid())
  ON CONFLICT DO NOTHING;

  PERFORM sys_core.log_audit(p_company_id, 'sys_core', 'member', p_user_id, 'restore');
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_reactivate_member TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 2. ROLES
-- ──────────────────────────────────────────────────────────────────

-- Lista roles de la empresa con su conteo de permisos y de miembros asignados.
CREATE OR REPLACE FUNCTION public.sys_list_roles(p_company_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  IF NOT sys_core.is_member_of(p_company_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of this company';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.name), '[]'::json) INTO result
  FROM (
    SELECT
      r.id, r.name, r.description, r.is_system,
      (SELECT array_agg(rp.permission_id) FROM sys_core.role_permissions rp WHERE rp.role_id = r.id) AS permission_ids,
      (SELECT count(*) FROM sys_core.user_company_roles ucr WHERE ucr.role_id = r.id) AS member_count
    FROM sys_core.roles r
    WHERE r.company_id = p_company_id
  ) t;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_list_roles TO authenticated;

-- Catálogo completo de permisos disponibles, agrupado para pintar checkboxes.
CREATE OR REPLACE FUNCTION public.sys_list_permissions()
RETURNS JSON LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id', p.id, 'module_id', p.module_id, 'resource', p.resource,
    'action', p.action, 'description', p.description
  ) ORDER BY p.module_id, p.resource, p.action), '[]'::json)
  FROM sys_core.permissions p;
$$;

GRANT EXECUTE ON FUNCTION public.sys_list_permissions TO authenticated;

-- Crea un rol custom para la empresa (vacío de permisos al inicio).
CREATE OR REPLACE FUNCTION public.sys_create_role(
  p_company_id UUID, p_name TEXT, p_description TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.role.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.role.manage';
  END IF;

  INSERT INTO sys_core.roles (company_id, name, description, is_system)
  VALUES (p_company_id, p_name, p_description, false)
  RETURNING id INTO v_id;

  PERFORM sys_core.log_audit(p_company_id, 'sys_core', 'role', v_id, 'create',
    jsonb_build_object('name', p_name));

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_create_role TO authenticated;

-- Reemplaza el set completo de permisos de un rol (lo que envían los
-- checkboxes marcados). No se puede usar en roles de sistema (is_system).
CREATE OR REPLACE FUNCTION public.sys_update_role_permissions(
  p_company_id UUID, p_role_id UUID, p_permission_ids TEXT[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_system BOOLEAN; v_role_company UUID;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.role.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.role.manage';
  END IF;

  SELECT is_system, company_id INTO v_is_system, v_role_company
  FROM sys_core.roles WHERE id = p_role_id;

  IF v_role_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'invalid_role: role does not belong to this company';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'cannot_edit_system_role: los roles de sistema no son editables';
  END IF;

  DELETE FROM sys_core.role_permissions WHERE role_id = p_role_id;

  INSERT INTO sys_core.role_permissions (role_id, permission_id)
  SELECT p_role_id, perm_id FROM unnest(p_permission_ids) AS perm_id;

  PERFORM sys_core.log_audit(p_company_id, 'sys_core', 'role', p_role_id, 'update',
    jsonb_build_object('permission_ids', p_permission_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_update_role_permissions TO authenticated;

-- Actualiza nombre/descripción de un rol custom.
CREATE OR REPLACE FUNCTION public.sys_update_role(
  p_company_id UUID, p_role_id UUID, p_name TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_system BOOLEAN; v_role_company UUID;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.role.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.role.manage';
  END IF;

  SELECT is_system, company_id INTO v_is_system, v_role_company
  FROM sys_core.roles WHERE id = p_role_id;

  IF v_role_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'invalid_role: role does not belong to this company';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'cannot_edit_system_role: los roles de sistema no son editables';
  END IF;

  UPDATE sys_core.roles SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description)
  WHERE id = p_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_update_role TO authenticated;

-- Elimina un rol custom (falla si tiene miembros asignados, para evitar
-- dejar usuarios sin rol por accidente).
CREATE OR REPLACE FUNCTION public.sys_delete_role(p_company_id UUID, p_role_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_system BOOLEAN; v_role_company UUID; v_member_count INT;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.role.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.role.manage';
  END IF;

  SELECT is_system, company_id INTO v_is_system, v_role_company
  FROM sys_core.roles WHERE id = p_role_id;

  IF v_role_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'invalid_role: role does not belong to this company';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'cannot_delete_system_role: los roles de sistema no se pueden eliminar';
  END IF;

  SELECT count(*) INTO v_member_count FROM sys_core.user_company_roles WHERE role_id = p_role_id;
  IF v_member_count > 0 THEN
    RAISE EXCEPTION 'role_in_use: % usuario(s) tienen este rol asignado, reasígnalos primero', v_member_count;
  END IF;

  DELETE FROM sys_core.roles WHERE id = p_role_id;
  PERFORM sys_core.log_audit(p_company_id, 'sys_core', 'role', p_role_id, 'delete');
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_delete_role TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 3. MÓDULOS (la empresa ya tiene sys_set_company_module; agregamos
--    el listado con metadata para pintar la pantalla de Módulos)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sys_list_company_modules(p_company_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'sys_core.company.manage') THEN
    RAISE EXCEPTION 'forbidden: missing sys_core.company.manage';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.name), '[]'::json) INTO result
  FROM (
    SELECT m.id, m.name, m.description,
      COALESCE(cm.active, false) AS active
    FROM sys_core.modules m
    LEFT JOIN sys_core.company_modules cm ON cm.module_id = m.id AND cm.company_id = p_company_id
    WHERE m.active = true
  ) t;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_list_company_modules TO authenticated;
