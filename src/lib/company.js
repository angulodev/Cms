import { supabase } from './supabase'

export { getActiveCompanyId, setActiveCompanyId, clearActiveCompany } from './activeCompany'

// ── Empresas del usuario actual ───────────────────────
// Devuelve [{ id, name, slug, status, roles: [...] }]
export async function getMyCompanies() {
  const { data, error } = await supabase.rpc('sys_my_companies')
  if (error) throw error
  return data || []
}

export async function createCompany(name) {
  const slug = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'empresa'

  const { data, error } = await supabase.rpc('sys_create_company', {
    p_name: name,
    p_slug: `${slug}-${Date.now().toString(36)}`, // sufijo para evitar colisión de slug
  })
  if (error) throw error
  return data // company_id (uuid)
}

export async function inviteMember(companyId, email, roleName = 'member') {
  const { data, error } = await supabase.rpc('sys_invite_member', {
    p_company_id: companyId,
    p_email: email,
    p_role_name: roleName,
  })
  if (error) throw error
  return data
}

export async function acceptInvite(companyId) {
  const { error } = await supabase.rpc('sys_accept_invite', { p_company_id: companyId })
  if (error) throw error
}

export async function setCompanyModule(companyId, moduleId, active) {
  const { error } = await supabase.rpc('sys_set_company_module', {
    p_company_id: companyId,
    p_module_id: moduleId,
    p_active: active,
  })
  if (error) throw error
}

export async function getAuditLog(companyId, { limit = 50, resource = null } = {}) {
  const { data, error } = await supabase.rpc('sys_get_audit_log', {
    p_company_id: companyId,
    p_limit: limit,
    p_resource: resource,
  })
  if (error) throw error
  return data || []
}

// Acceso completo del usuario en la empresa activa: módulos activos,
// permisos planos (ej. 'area_leader.project.create') y roles (nombres).
// Es la única llamada que el Launcher y los guards de módulo necesitan.
export async function getMyAccess(companyId) {
  const { data, error } = await supabase.rpc('sys_get_my_access', { p_company_id: companyId })
  if (error) throw error
  return data
}

// ── Administración de Sistema: Usuarios ───────────────
export async function listMembers(companyId) {
  const { data, error } = await supabase.rpc('sys_list_members', { p_company_id: companyId })
  if (error) throw error
  return data || []
}

export async function changeMemberRole(companyId, userId, roleId) {
  const { error } = await supabase.rpc('sys_change_member_role', {
    p_company_id: companyId, p_user_id: userId, p_role_id: roleId,
  })
  if (error) throw error
}

export async function revokeMember(companyId, userId) {
  const { error } = await supabase.rpc('sys_revoke_member', {
    p_company_id: companyId, p_user_id: userId,
  })
  if (error) throw error
}

export async function reactivateMember(companyId, userId, roleId) {
  const { error } = await supabase.rpc('sys_reactivate_member', {
    p_company_id: companyId, p_user_id: userId, p_role_id: roleId,
  })
  if (error) throw error
}

// ── Administración de Sistema: Roles y permisos ───────
export async function listRoles(companyId) {
  const { data, error } = await supabase.rpc('sys_list_roles', { p_company_id: companyId })
  if (error) throw error
  return data || []
}

export async function listPermissions() {
  const { data, error } = await supabase.rpc('sys_list_permissions')
  if (error) throw error
  return data || []
}

export async function createRole(companyId, name, description) {
  const { data, error } = await supabase.rpc('sys_create_role', {
    p_company_id: companyId, p_name: name, p_description: description || null,
  })
  if (error) throw error
  return data // role_id
}

export async function updateRole(companyId, roleId, { name, description } = {}) {
  const { error } = await supabase.rpc('sys_update_role', {
    p_company_id: companyId, p_role_id: roleId,
    p_name: name || null, p_description: description ?? null,
  })
  if (error) throw error
}

export async function updateRolePermissions(companyId, roleId, permissionIds) {
  const { error } = await supabase.rpc('sys_update_role_permissions', {
    p_company_id: companyId, p_role_id: roleId, p_permission_ids: permissionIds,
  })
  if (error) throw error
}

export async function deleteRole(companyId, roleId) {
  const { error } = await supabase.rpc('sys_delete_role', {
    p_company_id: companyId, p_role_id: roleId,
  })
  if (error) throw error
}

// ── Administración de Sistema: Módulos ────────────────
export async function listCompanyModules(companyId) {
  const { data, error } = await supabase.rpc('sys_list_company_modules', { p_company_id: companyId })
  if (error) throw error
  return data || []
}

// ── Super-admin de plataforma: vista global de usuarios (sys_user) ──
export async function amIPlatformAdmin() {
  const { data, error } = await supabase.rpc('sys_am_i_platform_admin')
  if (error) throw error
  return !!data
}

export async function listAllUsers() {
  const { data, error } = await supabase.rpc('sys_list_all_users')
  if (error) throw error
  return data || []
}

export async function getUserDetail(userId) {
  const { data, error } = await supabase.rpc('sys_get_user_detail', { p_user_id: userId })
  if (error) throw error
  return data
}

export async function setUserActive(userId, active) {
  const { error } = await supabase.rpc('sys_set_user_active', { p_user_id: userId, p_active: active })
  if (error) throw error
}

export async function adminRemoveUserFromCompany(userId, companyId) {
  const { error } = await supabase.rpc('sys_admin_remove_user_from_company', {
    p_user_id: userId, p_company_id: companyId,
  })
  if (error) throw error
}
