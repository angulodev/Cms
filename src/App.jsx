import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import Projects from './components/Projects'
import ProjectDetail from './components/ProjectDetail'
import Workload from './components/Workload'
import Team from './components/Team'
import Reports from './components/Reports'
import Notifications from './components/Notifications'
import Settings from './components/Settings'
import ProfileDropdown from './components/ProfileDropdown'
import Wall from './components/Wall'
import SharePage from './components/SharePage'
import { applyTheme, THEMES } from './lib/theme'
import ExportModal from './components/ExportModal'
import { getProjects, getActivity, getUserPrefs, supabase } from './lib/supabase'
import Login from './components/Login'
import CompanyGate from './components/CompanyGate'
import SysUsers from './components/system/Users'
import SysRoles from './components/system/Roles'
import SysModules from './components/system/Modules'
import { getActiveCompanyId, clearActiveCompany } from './lib/activeCompany'
import { getMyAccess } from './lib/company'
import './index.css'

// ── Catálogo de módulos: cada uno es un acordeón en el sidebar.
// "requiresPermission" oculta el módulo entero si el usuario no lo tiene.
const MODULES = [
  {
    id: 'area_leader',
    label: 'Administración de Proyectos',
    icon: 'folder_open',
    basePath: '/projects-app',
    requiresPermission: null,
    items: [
      { id: 'dashboard', path: '',          icon: 'grid_view',   label: 'Dashboard' },
      { id: 'wall',      path: 'wall',      icon: 'view_module', label: 'Vista general' },
      { id: 'projects',  path: 'projects',  icon: 'folder_open', label: 'Proyectos' },
      { id: 'team',      path: 'team',      icon: 'groups',      label: 'Equipo' },
      { id: 'workload',  path: 'workload',  icon: 'balance',     label: 'Carga' },
      { id: 'reports',   path: 'reports',   icon: 'bar_chart',   label: 'Reportes' },
      { id: 'settings',  path: 'settings',  icon: 'settings',    label: 'Configuración' },
    ],
  },
  {
    id: 'sys_core',
    label: 'Administración de Sistema',
    icon: 'admin_panel_settings',
    basePath: '/system',
    requiresPermission: 'sys_core.company.manage',
    items: [
      { id: 'users',   path: 'users',   icon: 'group',                label: 'Usuarios' },
      { id: 'roles',   path: 'roles',   icon: 'shield',               label: 'Roles y permisos' },
      { id: 'modules', path: 'modules', icon: 'apps',                 label: 'Módulos' },
    ],
  },
  // Próximos módulos: agregar aquí + sys_core.modules + su set de
  // permisos + sus rutas en el <Routes> central de AppShell.
]

// ── Auth + Company guard (envuelve TODA la app: launcher, módulos) ──
function AuthGate({ children }) {
  const [session,     setSession]     = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [companyId,   setCompanyId]   = useState(getActiveCompanyId)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setAuthLoading(false)
      // Si la sesión se cierra (logout), también soltamos la empresa activa
      // para que el próximo login (potencialmente otro usuario) pase por
      // el selector de empresa de nuevo.
      if (!session) {
        clearActiveCompany()
        setCompanyId(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--surface)'}}>
      <div style={{textAlign:'center',color:'var(--text-muted)'}}>
        <span className="mat-icon spin" style={{fontSize:36,display:'block',marginBottom:8}}>hub</span>
        <div style={{fontSize:14,fontWeight:600}}>Area Leader Pro</div>
      </div>
    </div>
  )

  if (!session) return <Login />

  if (!companyId) return <CompanyGate onCompanySelected={setCompanyId} />

  return children
}

// ── AppShell: shell ÚNICO y persistente para toda la app autenticada.
// El sidebar muestra un acordeón por módulo (según permisos reales del
// usuario); el <main> es lo único que cambia según la ruta.
function AppShell() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const companyId = getActiveCompanyId()

  const [access,         setAccess]         = useState(null)
  const [expandedModule, setExpandedModule] = useState(null)
  const [sideOpen,       setSideOpen]       = useState(window.innerWidth > 640)
  const [sidePinned,     setSidePinned]     = useState(() => {
    const prefs = getUserPrefs()
    return prefs.sidebarPinned !== false && window.innerWidth > 640
  })
  const [notifOpen,      setNotifOpen]      = useState(false)
  const [profileOpen,    setProfileOpen]    = useState(false)
  const [exportOpen,     setExportOpen]     = useState(false)
  const [projectCount,   setProjectCount]   = useState(null)
  const [activeProjects, setActiveProjects] = useState([])
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [userPrefs, setUserPrefs] = useState(getUserPrefs)
  const [navSearch, setNavSearch] = useState('')
  const [allProjects, setAllProjects] = useState([])

  useEffect(() => {
    let active = true

    getMyAccess(companyId).then(data => {
      if (active) setAccess(data)
    }).catch(() => {})

    getProjects().then(p => {
      if (!active) return
      setProjectCount(p.length)
      setAllProjects(p)
      setActiveProjects(
        p.filter(x => ['active','at-risk','planning'].includes(x.status))
          .sort((a,b) => new Date(b.updated_at||b.created_at) - new Date(a.updated_at||a.created_at))
          .slice(0, 6)
      )
    }).catch(() => {})
    getActivity(20).then(items => {
      if (!active) return
      const read = JSON.parse(localStorage.getItem('alp_read') || '[]')
      setUnreadCount(items.filter(i => !read.includes(i.id)).length)
    }).catch(() => {})
    const prefs = getUserPrefs()
    if (prefs.themeId) { const t = THEMES.find(t => t.id === prefs.themeId); if (t) applyTheme(t) }
    if (prefs.compact) document.documentElement.classList.add('compact')

    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  // Módulos visibles según permisos reales del usuario en esta empresa
  const myPermissions = new Set(access?.permissions || [])
  const activeModuleIds = new Set((access?.modules || []).map(m => m.id))
  const visibleModules = MODULES.filter(m => {
    if (!activeModuleIds.has(m.id)) return false
    if (m.requiresPermission && !myPermissions.has(m.requiresPermission)) return false
    return true
  })

  // ¿Qué módulo y qué item están activos según la URL actual?
  // La raíz '/' es un alias del dashboard de Proyectos, y el basePath
  // exacto de un módulo (ej. '/system') es alias de su primer item,
  // para que el sidebar siempre resalte algo coherente con lo que se ve.
  const effectivePath = location.pathname === '/' ? '/projects-app/' : location.pathname
  const currentModule = visibleModules.find(m => effectivePath.startsWith(m.basePath))
  const currentItemId = currentModule?.items
    .slice()
    .sort((a, b) => b.path.length - a.path.length) // match más específico primero
    .find(it => {
      const isModuleRoot = effectivePath === currentModule.basePath || effectivePath === `${currentModule.basePath}/`
      if (isModuleRoot) return it.path === '' || it === currentModule.items[0]
      if (it.path === '') return false
      const full = `${currentModule.basePath}/${it.path}`
      return effectivePath.startsWith(full)
    })?.id

  // El acordeón del módulo activo se expande solo, salvo que el usuario
  // haya tocado otro manualmente (expandedModule no-nulo manda).
  const openModuleId = expandedModule ?? currentModule?.id ?? visibleModules[0]?.id

  function goToItem(mod, item) {
    navigate(`${mod.basePath}/${item.path}`)
    if (!sidePinned) setSideOpen(false)
  }

  const STATUS_COLOR = {
    active:'#10b981','at-risk':'#f59e0b',planning:'#3b82f6',
    'on-hold':'#8b5cf6',backlog:'#94a3b8',completed:'#06b6d4',
    cancelled:'#ef4444',closed:'#64748b'
  }

  return (
    <div className="app">
      {/* ── TOP NAV ── */}
      <header className="topnav">
        <button
          className={`icon-btn mobile-menu-btn ${sidePinned ? 'is-pinned' : ''}`}
          title={sidePinned ? 'Desanclar sidebar' : sideOpen ? 'Cerrar sidebar' : 'Abrir sidebar'}
          onClick={() => {
            if (sidePinned) {
              setSidePinned(false)
              setSideOpen(false)
              try {
                const k = 'alp_user_prefs'
                const cur = JSON.parse(localStorage.getItem(k) || '{}')
                localStorage.setItem(k, JSON.stringify({ ...cur, sidebarPinned: false }))
              } catch {
                // localStorage puede no estar disponible (modo privado, cuotas, etc.)
              }
            } else if (sideOpen) {
              setSidePinned(true)
              try {
                const k = 'alp_user_prefs'
                const cur = JSON.parse(localStorage.getItem(k) || '{}')
                localStorage.setItem(k, JSON.stringify({ ...cur, sidebarPinned: true }))
              } catch {
                // localStorage puede no estar disponible (modo privado, cuotas, etc.)
              }
            } else {
              setSideOpen(true)
            }
          }}>
          <span className="mat-icon" style={{
            transform: sidePinned ? 'rotate(-45deg)' : 'none',
            transition: 'transform .2s',
            color: sidePinned ? 'var(--accent)' : 'inherit'
          }}>
            {sidePinned ? 'push_pin' : sideOpen ? 'push_pin' : 'menu'}
          </span>
        </button>
        <div className="brand" onClick={() => navigate('/')} style={{cursor:'pointer'}}>
          <div className="brand-icon"><span className="mat-icon">hub</span></div>
          <span className="brand-name">{access?.company?.name || 'Workspace'}</span>
        </div>

        <div className="topnav-search">
          <span className="mat-icon search-icon-nav">search</span>
          <input
            type="text"
            placeholder="Buscar proyectos, tareas…"
            value={navSearch}
            onChange={e => setNavSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !navSearch.trim()) return
              const q = navSearch.trim().toLowerCase()
              const found = allProjects.find(p =>
                p.name.toLowerCase().includes(q) || (p.client || '').toLowerCase().includes(q)
              )
              if (found) {
                navigate(`/projects-app/projects/${found.id}`, { state: { project: found } })
                setNavSearch('')
              } else {
                navigate(`/projects-app/projects?q=${encodeURIComponent(navSearch.trim())}`)
              }
            }}
          />
        </div>
        <div className="topnav-actions">
          <div style={{ position: 'relative' }}>
            <button className="icon-btn notif-btn"
              onClick={() => setNotifOpen(o => !o)}>
              <span className="mat-icon">{notifOpen ? 'notifications' : 'notifications_none'}</span>
              {unreadCount > 0 && <span className="notif-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {notifOpen && <Notifications onClose={() => setNotifOpen(false)} />}
          </div>
          <div style={{ position: 'relative' }}>
            <div
              className="avatar-circle topnav-avatar"
              style={{ background: userPrefs.color || '#1e293b', fontSize: 12, cursor: 'pointer' }}
              title="Mi perfil"
              onClick={() => setProfileOpen(o => !o)}>
              {(userPrefs.name || 'FA').trim().split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')}
            </div>
            {profileOpen && (
              <ProfileDropdown
                onClose={() => setProfileOpen(false)}
                onSaved={updated => setUserPrefs(p => ({ ...p, ...updated }))}
              />
            )}
          </div>
        </div>
      </header>

      <div className="layout">
        {sideOpen && !sidePinned && <div className="sidebar-overlay" onClick={() => setSideOpen(false)} />}

        {/* ── SIDEBAR: acordeón por módulo ── */}
        <aside className={`sidenav ${sideOpen ? 'open' : ''} ${sidePinned ? 'pinned' : ''}`}>
          <div className="sidenav-inner">
            <nav className="sidenav-main">
              {visibleModules.map(mod => {
                const isOpen = openModuleId === mod.id
                return (
                  <div key={mod.id} className="module-group">
                    <button
                      className={`module-group-header ${isOpen ? 'open' : ''}`}
                      onClick={() => setExpandedModule(isOpen ? null : mod.id)}
                    >
                      <span className="mat-icon nav-icon">{mod.icon}</span>
                      <span className="module-group-label">{mod.label}</span>
                      <span className="mat-icon module-group-chevron">
                        {isOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="module-group-items">
                        {mod.items.map(item => {
                          const isActive = currentModule?.id === mod.id && currentItemId === item.id
                          return (
                            <button
                              key={item.id}
                              className={`nav-item sub ${isActive ? 'active' : ''}`}
                              onClick={() => goToItem(mod, item)}
                            >
                              <span className="mat-icon nav-icon">{item.icon}</span>
                              <span>{item.label}</span>
                              {item.id === 'projects' && projectCount > 0 &&
                                <span className="nav-badge">{projectCount}</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            {currentModule?.id === 'area_leader' && (
              <div className="sidenav-projects-section">
                <div className="sidenav-divider" />
                <div className="sidenav-section-label">Proyectos activos</div>
                {activeProjects.length === 0
                  ? <div style={{fontSize:11,color:'var(--text-muted)',padding:'4px 10px'}}>Sin proyectos activos</div>
                  : activeProjects.map(p => (
                    <button key={p.id} className="nav-item nav-item-project"
                      onClick={() => { navigate(`/projects-app/projects/${p.id}`, { state: { project: p } }); if (!sidePinned) setSideOpen(false) }}>
                      <span className="project-dot" style={{ background: STATUS_COLOR[p.status] || 'var(--accent)' }} />
                      <span className="nav-item-project-label">{p.name}</span>
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN: una sola superficie de rutas para todos los módulos ── */}
        <main className="main">
          <Routes>
            {/* Raíz: entra directo al dashboard de Proyectos (o al primer módulo visible) */}
            <Route path="/" element={
              <Dashboard
                onNavigate={p => navigate(p === 'projects' ? '/projects-app/projects' : p === 'team' ? '/projects-app/team' : p === 'workload' ? '/projects-app/workload' : '/projects-app/')}
                onExport={() => setExportOpen(true)}
              />
            } />

            {/* Administración de Proyectos */}
            <Route path="/projects-app" element={<Dashboard onNavigate={p=>navigate(p==='projects'?'/projects-app/projects':p==='team'?'/projects-app/team':p==='workload'?'/projects-app/workload':'/projects-app/')} onExport={() => setExportOpen(true)} />} />
            <Route path="/projects-app/wall"       element={<Wall onSelectProject={p => navigate(`/projects-app/projects/${p.id}`, { state: { project: p } })} />} />
            <Route path="/projects-app/projects"   element={<Projects  onSelectProject={p => navigate(`/projects-app/projects/${p.id}`, { state: { project: p } })} />} />
            <Route path="/projects-app/projects/:id" element={<ProjectDetailRoute key={location.pathname} />} />
            <Route path="/projects-app/team"       element={<Team />} />
            <Route path="/projects-app/workload"   element={<Workload />} />
            <Route path="/projects-app/reports"    element={<Reports />} />
            <Route path="/projects-app/settings"   element={<Settings />} />

            {/* Administración de Sistema */}
            <Route path="/system"        element={<SysUsers companyId={companyId} />} />
            <Route path="/system/users"   element={<SysUsers companyId={companyId} />} />
            <Route path="/system/roles"   element={<SysRoles companyId={companyId} />} />
            <Route path="/system/modules" element={<SysModules companyId={companyId} />} />

            <Route path="*" element={<Dashboard onNavigate={p=>navigate(p)} onExport={() => setExportOpen(true)} />} />
          </Routes>
        </main>
      </div>

      {/* ── BOTTOM NAV (mobile): items del módulo activo ── */}
      {currentModule && (
        <nav className="bottom-nav">
          {currentModule.items.slice(0, 5).map(item => {
            const isActive = currentItemId === item.id
            return (
              <button key={item.id}
                className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => goToItem(currentModule, item)}>
                <span className="mat-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}

      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </div>
  )
}

// ── ProjectDetail route wrapper ────────────────────
function ProjectDetailRoute() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const stateProject = location.state?.project?.id === id ? location.state.project : null
  const [fetchedProject, setFetchedProject] = useState(null)
  const [loading, setLoading] = useState(!stateProject)

  const project = stateProject || fetchedProject

  useEffect(() => {
    if (stateProject) return // ya tenemos el dato correcto, no hace falta refetch
    getProjects()
      .then(projects => {
        const found = projects.find(p => p.id === id)
        if (found) setFetchedProject(found)
        else navigate('/projects-app/projects')
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate y stateProject son derivados estables de id; solo debe re-disparar cuando cambia el id de la ruta
  }, [id])

  if (loading) return (
    <div className="screen-content">
      <div style={{padding:32,textAlign:'center',color:'var(--text-muted)'}}>
        <span className="mat-icon spin" style={{fontSize:32}}>refresh</span>
      </div>
    </div>
  )

  return (
    <ProjectDetail
      project={project}
      onBack={() => navigate('/projects-app/projects')}
      onProjectUpdated={() => {
        getProjects().then(projects => {
          const found = projects.find(p => p.id === id)
          if (found) setFetchedProject(found)
        })
      }}
    />
  )
}

// ── Root with BrowserRouter ────────────────────────
export default function App() {
  return (
    <BrowserRouter basename="/Cms">
      <Routes>
        {/* Rutas públicas: nunca pasan por el guard de sesión */}
        <Route path="/share/portfolio/:token" element={<SharePage scope="portfolio" />} />
        <Route path="/share/project/:token"   element={<SharePage scope="project" />} />

        {/* Todo lo demás requiere sesión + empresa activa. AppShell es
            el único shell: su propio <Routes> interno decide qué pintar
            en <main> según la URL, sin recargar topnav/sidebar. */}
        <Route path="/*" element={
          <AuthGate>
            <AppShell />
          </AuthGate>
        } />
      </Routes>
    </BrowserRouter>
  )
}
