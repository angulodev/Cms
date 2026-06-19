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
