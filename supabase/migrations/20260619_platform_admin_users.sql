-- ══════════════════════════════════════════════════════════════════
--  SYS_CORE — Super-admin de plataforma + vista global de usuarios
--  estilo ServiceNow (sys_user con related lists: empresas, roles)
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. PLATFORM_ADMINS — fuera del modelo de company_id. Quien está
--    aquí puede ver y operar across TODAS las empresas.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sys_core.platform_admins ENABLE ROW LEVEL SECURITY;

-- Solo otros platform admins pueden ver esta tabla (evita que cualquiera
-- liste quién tiene este poder). Se gestiona por SQL directo por ahora;
-- no hay UI para auto-otorgarse este rol.
CREATE POLICY "platform_admins_see_themselves" ON sys_core.platform_admins
  FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION sys_core.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM sys_core.platform_admins WHERE user_id = auth.uid());
$$;

-- Te registro a ti (francisco.angulo1992@gmail.com) como el primer
-- super-admin de la plataforma.
INSERT INTO sys_core.platform_admins (user_id, granted_by)
VALUES ('5c1563dd-e396-4cf6-873d-4b9440817bda', '5c1563dd-e396-4cf6-873d-4b9440817bda');

-- ──────────────────────────────────────────────────────────────────
-- 2. sys_list_all_users — TODOS los usuarios de auth.users.
--    Solo platform admin. Es la tabla principal (estilo sys_user).
-- ──────────────────────────────────────────────────────────────────

-- Helper auxiliar (se define antes de usarla en sys_list_all_users)
CREATE OR REPLACE FUNCTION sys_core.is_platform_admin_of(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM sys_core.platform_admins WHERE user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.sys_list_all_users()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  IF NOT sys_core.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: requires platform admin';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json) INTO result
  FROM (
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at IS NOT NULL AS email_confirmed,
      up.full_name,
      up.avatar_url,
      up.active AS profile_active,
      (
        SELECT count(*) FROM sys_core.company_members cm
        WHERE cm.user_id = u.id AND cm.status = 'active'
      ) AS company_count,
      sys_core.is_platform_admin_of(u.id) AS is_platform_admin
    FROM auth.users u
    LEFT JOIN sys_core.user_profiles up ON up.id = u.id
  ) t;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_list_all_users TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 3. sys_get_user_detail — el "registro" de un usuario + sus related
--    lists: empresas a las que pertenece, con su(s) rol(es) en cada una.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sys_get_user_detail(p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user JSON;
  v_companies JSON;
BEGIN
  IF NOT sys_core.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: requires platform admin';
  END IF;

  SELECT json_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed', u.email_confirmed_at IS NOT NULL,
    'full_name', up.full_name, 'avatar_url', up.avatar_url,
    'phone', up.phone, 'profile_active', up.active,
    'is_platform_admin', sys_core.is_platform_admin_of(u.id)
  ) INTO v_user
  FROM auth.users u
  LEFT JOIN sys_core.user_profiles up ON up.id = u.id
  WHERE u.id = p_user_id;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Related list: empresas + rol(es) en cada una
  SELECT COALESCE(json_agg(json_build_object(
    'company_id', c.id, 'company_name', c.name, 'company_slug', c.slug,
    'member_status', cm.status, 'joined_at', cm.joined_at,
    'roles', (
      SELECT json_agg(r.name) FROM sys_core.user_company_roles ucr
      JOIN sys_core.roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = p_user_id AND ucr.company_id = c.id
    )
  ) ORDER BY cm.joined_at DESC NULLS LAST), '[]'::json) INTO v_companies
  FROM sys_core.company_members cm
  JOIN sys_core.companies c ON c.id = cm.company_id
  WHERE cm.user_id = p_user_id;

  RETURN json_build_object('user', v_user, 'companies', v_companies);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_get_user_detail TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 4. sys_set_user_active — activar/desactivar el perfil de un usuario
--    (no borra la cuenta de auth, solo marca user_profiles.active;
--    útil para "deshabilitar sin eliminar", como sys_user.active).
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sys_set_user_active(p_user_id UUID, p_active BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: requires platform admin';
  END IF;

  UPDATE sys_core.user_profiles SET active = p_active WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_set_user_active TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 5. sys_remove_user_from_company — quitar a un usuario de una
--    empresa específica desde la vista global (related list action).
--    Reutiliza la misma semántica que sys_revoke_member, pero callable
--    por platform admin sin necesitar el permiso de esa empresa.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sys_admin_remove_user_from_company(p_user_id UUID, p_company_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: requires platform admin';
  END IF;

  UPDATE sys_core.company_members
  SET status = 'revoked'
  WHERE company_id = p_company_id AND user_id = p_user_id;

  DELETE FROM sys_core.user_company_roles
  WHERE company_id = p_company_id AND user_id = p_user_id;

  PERFORM sys_core.log_audit(p_company_id, 'sys_core', 'member', p_user_id, 'delete');
END;
$$;

GRANT EXECUTE ON FUNCTION public.sys_admin_remove_user_from_company TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 6. sys_am_i_platform_admin — para que el frontend sepa si debe
--    mostrar la vista global de usuarios o la de "miembros de mi
--    empresa" (la que ya existía).
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sys_am_i_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT sys_core.is_platform_admin();
$$;

GRANT EXECUTE ON FUNCTION public.sys_am_i_platform_admin TO authenticated;
