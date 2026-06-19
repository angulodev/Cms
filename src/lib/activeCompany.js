// Almacenamiento puro del company_id activo — sin dependencias de supabase.js
// para evitar import circular (supabase.js lo necesita para inyectar
// p_company_id en sus RPCs; company.js lo necesita para las funciones de
// sys_core; ambos importan de aquí, no entre sí).

const STORAGE_KEY = 'alp_active_company_id'

export function getActiveCompanyId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function setActiveCompanyId(companyId) {
  try {
    if (companyId) localStorage.setItem(STORAGE_KEY, companyId)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage puede no estar disponible (modo privado, cuotas, etc.)
  }
}

export function clearActiveCompany() {
  setActiveCompanyId(null)
}
