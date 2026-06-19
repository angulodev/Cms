-- ══════════════════════════════════════════════════════════════════
--  SYS_CORE — sys_get_my_access
--  Una sola llamada que el frontend usa para decidir qué módulos
--  mostrar en el Launcher y qué puede hacer el usuario en cada uno.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sys_get_my_access(p_company_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_company JSON;
  v_modules JSON;
  v_permissions JSON;
  v_roles JSON;
BEGIN
  IF NOT sys_core.is_member_of(p_company_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of this company';
  END IF;

  SELECT json_build_object('id', id, 'name', name, 'slug', slug, 'plan_id', plan_id)
  INTO v_company
  FROM sys_core.companies WHERE id = p_company_id;

  -- Módulos activos para esta empresa (catálogo + estado)
  SELECT COALESCE(json_agg(json_build_object(
    'id', m.id, 'name', m.name, 'description', m.description
  )), '[]'::json) INTO v_modules
  FROM sys_core.company_modules cm
  JOIN sys_core.modules m ON m.id = cm.module_id
  WHERE cm.company_id = p_company_id AND cm.active = true AND m.active = true;

  -- Permisos del usuario en esta empresa (set plano de IDs, ej: 'area_leader.project.create')
  SELECT COALESCE(json_agg(DISTINCT rp.permission_id), '[]'::json) INTO v_permissions
  FROM sys_core.user_company_roles ucr
  JOIN sys_core.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN sys_core.permissions perm ON perm.id = rp.permission_id
  WHERE ucr.user_id = auth.uid()
    AND ucr.company_id = p_company_id
    AND sys_core.module_active(p_company_id, perm.module_id);

  -- Roles del usuario en esta empresa (nombres, para mostrar "Admin", "Leader", etc.)
  SELECT COALESCE(json_agg(r.name), '[]'::json) INTO v_roles
  FROM sys_core.user_company_roles ucr
  JOIN sys_core.roles r ON r.id = ucr.role_id
  WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id;

  RETURN json_build_object(
    'company', v_company,
    'modules', v_modules,
    'permissions', v_permissions,
    'roles', v_roles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_get_my_access TO authenticated;
