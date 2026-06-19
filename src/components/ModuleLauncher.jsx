import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyAccess, getActiveCompanyId, clearActiveCompany } from '../lib/company'
import { supabase } from '../lib/supabase'

// Catálogo de tiles del launcher. "moduleId" debe coincidir con
// sys_core.modules.id; "requiresPermission" es el permiso mínimo para
// ver el tile (si null, basta con que el módulo esté activo).
const MODULE_TILES = [
  {
    moduleId: 'area_leader',
    path: '/projects-app/',
    icon: 'folder_open',
    name: 'Administración de Proyectos',
    description: 'Portafolio, equipo, riesgos y reportes ejecutivos.',
    color: '#3b82f6',
    requiresPermission: null, // visible para cualquier miembro con el módulo activo
  },
  {
    moduleId: 'sys_core',
    path: '/system/',
    icon: 'admin_panel_settings',
    name: 'Administración de Sistema',
    description: 'Usuarios, roles, permisos y módulos de la empresa.',
    color: '#8b5cf6',
    requiresPermission: 'sys_core.company.manage',
  },
  // Próximos módulos (ServiceNow-style): se agregan aquí + en
  // sys_core.modules + se activan por empresa vía sys_set_company_module.
  // {
  //   moduleId: 'incidents',
  //   path: '/incidents/',
  //   icon: 'confirmation_number',
  //   name: 'Incidentes',
  //   description: 'Gestión de tickets e incidencias.',
  //   color: '#f59e0b',
  //   requiresPermission: null,
  // },
]

export default function ModuleLauncher() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [access, setAccess] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const companyId = getActiveCompanyId()

    async function load() {
      try {
        const data = await getMyAccess(companyId)
        if (active) setAccess(data)
      } catch (e) {
        if (active) setError(e.message)
      }
      if (active) setLoading(false)
    }

    load()
    return () => { active = false }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function handleSwitchCompany() {
    clearActiveCompany()
    navigate('/', { replace: true })
    window.location.reload() // fuerza a AuthGate a re-evaluar companyId desde cero
  }

  if (loading) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--surface)'}}>
        <span className="mat-icon spin" style={{fontSize:32,color:'var(--accent)'}}>hub</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--surface)'}}>
        <div className="lp-msg lp-msg-err" style={{ maxWidth: 400 }}>
          <span className="mat-icon" style={{ fontSize: 16 }}>error_outline</span>
          {error}
        </div>
      </div>
    )
  }

  const activeModuleIds = new Set((access?.modules || []).map(m => m.id))
  const myPermissions = new Set(access?.permissions || [])

  const visibleTiles = MODULE_TILES.filter(tile => {
    if (!activeModuleIds.has(tile.moduleId)) return false
    if (tile.requiresPermission && !myPermissions.has(tile.requiresPermission)) return false
    return true
  })

  return (
    <div className="launcher-shell">
      <header className="launcher-header">
        <div className="launcher-brand">
          <div className="launcher-brand-icon"><span className="mat-icon">hub</span></div>
          <div>
            <div className="launcher-brand-name">{access?.company?.name || 'Workspace'}</div>
            <div className="launcher-brand-sub">{(access?.roles || []).join(', ') || 'Miembro'}</div>
          </div>
        </div>
        <div className="launcher-header-actions">
          <button className="btn-ghost" onClick={handleSwitchCompany}>
            <span className="mat-icon" style={{ fontSize: 16 }}>swap_horiz</span> Cambiar empresa
          </button>
          <button className="btn-ghost" onClick={handleLogout}>
            <span className="mat-icon" style={{ fontSize: 16 }}>logout</span> Salir
          </button>
        </div>
      </header>

      <main className="launcher-main">
        <h1>Tus aplicaciones</h1>
        <p className="launcher-sub">Selecciona un módulo para empezar a trabajar.</p>

        {visibleTiles.length === 0 ? (
          <div className="launcher-empty">
            <span className="mat-icon" style={{ fontSize: 32, color: 'var(--text-muted)' }}>apps</span>
            <p>No tienes módulos disponibles todavía. Contacta a un administrador de tu empresa.</p>
          </div>
        ) : (
          <div className="launcher-grid">
            {visibleTiles.map(tile => (
              <button key={tile.moduleId} className="launcher-tile" onClick={() => navigate(tile.path)}>
                <div className="launcher-tile-icon" style={{ background: `${tile.color}1a`, color: tile.color }}>
                  <span className="mat-icon">{tile.icon}</span>
                </div>
                <div className="launcher-tile-name">{tile.name}</div>
                <div className="launcher-tile-desc">{tile.description}</div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
