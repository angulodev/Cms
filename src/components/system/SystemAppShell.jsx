import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Users from './Users'
import Roles from './Roles'
import Modules from './Modules'
import { getActiveCompanyId } from '../../lib/activeCompany'

const SYS_NAV = [
  { id: 'users',   path: 'users',   icon: 'group',               label: 'Usuarios' },
  { id: 'roles',   path: 'roles',   icon: 'admin_panel_settings', label: 'Roles y permisos' },
  { id: 'modules', path: 'modules', icon: 'apps',                label: 'Módulos' },
]

export default function SystemAppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const companyId = getActiveCompanyId()

  const activeNav = location.pathname.includes('/roles')   ? 'roles'
    : location.pathname.includes('/modules') ? 'modules'
    : 'users'

  return (
    <div className="app">
      <header className="topnav">
        <button className="icon-btn" onClick={() => navigate('/')} title="Volver al inicio">
          <span className="mat-icon">arrow_back</span>
        </button>
        <div className="brand" onClick={() => navigate('/system/')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon" style={{ background: '#8b5cf6' }}>
            <span className="mat-icon">admin_panel_settings</span>
          </div>
          <span className="brand-name">Administración de Sistema</span>
        </div>
        <div style={{ flex: 1 }} />
      </header>

      <div className="layout">
        <aside className="sidenav open pinned">
          <div className="sidenav-inner">
            <nav className="sidenav-main">
              {SYS_NAV.map(n => (
                <button
                  key={n.id}
                  className={`nav-item ${activeNav === n.id ? 'active' : ''}`}
                  onClick={() => navigate(n.path)}
                >
                  <span className="mat-icon nav-icon">{n.icon}</span>
                  <span>{n.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="main">
          <Routes>
            <Route path="" element={<Users companyId={companyId} />} />
            <Route path="users" element={<Users companyId={companyId} />} />
            <Route path="roles" element={<Roles companyId={companyId} />} />
            <Route path="modules" element={<Modules companyId={companyId} />} />
            <Route path="*" element={<Users companyId={companyId} />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
