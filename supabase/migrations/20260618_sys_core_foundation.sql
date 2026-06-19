-- ══════════════════════════════════════════════════════════════════
--  SYS_CORE — Núcleo de identidad, tenancy y RBAC dinámico
--  Modelo: multi-tenant, roles configurables por empresa,
--          permisos atómicos estilo "modulo.recurso.accion"
-- ══════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS sys_core;

-- ──────────────────────────────────────────────────────────────────
-- 1. MÓDULOS — catálogo de módulos instalados en la plataforma
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.modules (
  id          TEXT        PRIMARY KEY,      -- 'area_leader', 'sys_core'
  name        TEXT        NOT NULL,
  description TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO sys_core.modules (id, name, description) VALUES
  ('sys_core',    'Sistema Core',          'Identidad, empresas, roles y permisos'),
  ('area_leader', 'Area Leader Pro',       'Gestión de portafolio de proyectos');

-- ──────────────────────────────────────────────────────────────────
-- 2. COMPANIES — el tenant
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.companies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  plan_id     TEXT        REFERENCES public.plans(id) DEFAULT 'basic',
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION sys_core.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON sys_core.companies
  FOR EACH ROW EXECUTE FUNCTION sys_core.set_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- 3. USER_PROFILES — extensión 1:1 de auth.users
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.user_profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  email       TEXT,
  phone       TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON sys_core.user_profiles
  FOR EACH ROW EXECUTE FUNCTION sys_core.set_updated_at();

-- Auto-crear perfil cuando se registra un usuario en auth.users
CREATE OR REPLACE FUNCTION sys_core.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sys_core.user_profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sys_core.handle_new_user();

-- ──────────────────────────────────────────────────────────────────
-- 4. COMPANY_MEMBERS — pertenencia usuario↔empresa (solo por invitación)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.company_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES sys_core.companies(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT,                     -- para invitaciones a alguien que aún no tiene cuenta
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','active','suspended','revoked')),
  invited_by  UUID        REFERENCES auth.users(id),
  invited_at  TIMESTAMPTZ DEFAULT now(),
  joined_at   TIMESTAMPTZ,
  UNIQUE (company_id, user_id)
);

CREATE INDEX idx_company_members_user   ON sys_core.company_members(user_id);
CREATE INDEX idx_company_members_company ON sys_core.company_members(company_id);

-- ──────────────────────────────────────────────────────────────────
-- 5. PERMISSIONS — catálogo atómico "modulo.recurso.accion"
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.permissions (
  id          TEXT        PRIMARY KEY,   -- ej: 'area_leader.project.create'
  module_id   TEXT        NOT NULL REFERENCES sys_core.modules(id),
  resource    TEXT        NOT NULL,      -- ej: 'project'
  action      TEXT        NOT NULL,      -- ej: 'create'
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 6. ROLES — configurables por empresa (is_system = plantilla global)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE sys_core.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        REFERENCES sys_core.companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_system   BOOLEAN     NOT NULL DEFAULT false,  -- true = plantilla (company_id NULL)
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE sys_core.role_permissions (
  role_id       UUID NOT NULL REFERENCES sys_core.roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES sys_core.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE sys_core.user_company_roles (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES sys_core.companies(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES sys_core.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, company_id, role_id)
);

CREATE INDEX idx_ucr_user_company ON sys_core.user_company_roles(user_id, company_id);

-- ──────────────────────────────────────────────────────────────────
-- 7. FUNCIONES HELPER — usadas en políticas RLS de todos los módulos
-- ──────────────────────────────────────────────────────────────────

-- ¿El usuario actual pertenece (activo) a esta empresa?
CREATE OR REPLACE FUNCTION sys_core.is_member_of(p_company_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM sys_core.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- ¿El usuario actual tiene el permiso X en la empresa Y?
CREATE OR REPLACE FUNCTION sys_core.has_permission(p_company_id UUID, p_permission_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sys_core.user_company_roles ucr
    JOIN sys_core.role_permissions rp ON rp.role_id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND rp.permission_id = p_permission_id
  );
$$;

-- Lista de empresas activas del usuario actual (para selector de empresa en UI)
CREATE OR REPLACE FUNCTION public.sys_my_companies()
RETURNS JSON LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id', c.id, 'name', c.name, 'slug', c.slug,
    'status', cm.status,
    'roles', (
      SELECT json_agg(r.name) FROM sys_core.user_company_roles ucr
      JOIN sys_core.roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = c.id
    )
  )), '[]'::json)
  FROM sys_core.company_members cm
  JOIN sys_core.companies c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid() AND cm.status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.sys_my_companies TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 8. RLS — sys_core
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE sys_core.companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_core.user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_core.company_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_core.roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_core.role_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_core.user_company_roles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_core.permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_core.modules             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_see_their_company" ON sys_core.companies
  FOR SELECT USING (sys_core.is_member_of(id));

CREATE POLICY "user_sees_own_profile" ON sys_core.user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "user_updates_own_profile" ON sys_core.user_profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "members_see_company_members" ON sys_core.company_members
  FOR SELECT USING (sys_core.is_member_of(company_id));

CREATE POLICY "members_see_company_roles" ON sys_core.roles
  FOR SELECT USING (company_id IS NULL OR sys_core.is_member_of(company_id));

CREATE POLICY "members_see_role_permissions" ON sys_core.role_permissions
  FOR SELECT USING (true);

CREATE POLICY "members_see_user_roles" ON sys_core.user_company_roles
  FOR SELECT USING (sys_core.is_member_of(company_id));

CREATE POLICY "anyone_reads_permissions" ON sys_core.permissions
  FOR SELECT USING (true);

CREATE POLICY "anyone_reads_modules" ON sys_core.modules
  FOR SELECT USING (true);

GRANT SELECT ON sys_core.companies          TO authenticated;
GRANT SELECT, UPDATE ON sys_core.user_profiles TO authenticated;
GRANT SELECT ON sys_core.company_members     TO authenticated;
GRANT SELECT ON sys_core.roles               TO authenticated;
GRANT SELECT ON sys_core.role_permissions    TO authenticated;
GRANT SELECT ON sys_core.user_company_roles  TO authenticated;
GRANT SELECT ON sys_core.permissions         TO anon, authenticated;
GRANT SELECT ON sys_core.modules             TO anon, authenticated;
