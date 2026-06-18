import { useState } from 'react'
import { Avatar } from './UI'

const THEMES = [
  { id: 'default', label: 'Default',    primary: '#1e293b', accent: '#3b82f6', surface: '#f7f9fb' },
  { id: 'ocean',   label: 'Océano',     primary: '#0f4c75', accent: '#0ea5e9', surface: '#f0f9ff' },
  { id: 'forest',  label: 'Bosque',     primary: '#14532d', accent: '#10b981', surface: '#f0fdf4' },
  { id: 'sunset',  label: 'Atardecer',  primary: '#7c2d12', accent: '#f97316', surface: '#fff7ed' },
  { id: 'grape',   label: 'Uva',        primary: '#3b0764', accent: '#8b5cf6', surface: '#faf5ff' },
  { id: 'slate',   label: 'Pizarra',    primary: '#0f172a', accent: '#64748b', surface: '#f8fafc' },
]

const COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b',
  '#ef4444','#06b6d4','#ec4899','#f97316',
]

function applyTheme(theme) {
  const root = document.documentElement
  root.style.setProperty('--primary', theme.primary)
  root.style.setProperty('--accent',  theme.accent)
  root.style.setProperty('--surface', theme.surface)
  // Derive accent-bg from accent
  root.style.setProperty('--accent-bg', theme.accent + '18')
  localStorage.setItem('alp_theme', theme.id)
}

const STORAGE_KEY = 'alp_user_profile'

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {
      name: 'Francisco A.', role: 'Area Leader', initials: 'FA', color: '#1e293b'
    }
  } catch { return { name: 'Francisco A.', role: 'Area Leader', initials: 'FA', color: '#1e293b' } }
}

export default function UserProfile({ onClose, onProfileChange }) {
  const [tab, setTab]         = useState('profile')
  const [profile, setProfile] = useState(loadProfile)
  const [saved, setSaved]     = useState(false)
  const [activeTheme, setActiveTheme] = useState(
    () => localStorage.getItem('alp_theme') || 'default'
  )

  function saveProfile() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    setSaved(true)
    onProfileChange?.(profile)
    setTimeout(() => setSaved(false), 2000)
  }

  function selectTheme(theme) {
    setActiveTheme(theme.id)
    applyTheme(theme)
  }

  const set = (k, v) => setProfile(p => ({ ...p, [k]: v }))

  function autoInitials(name) {
    return name.trim().split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('')
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-profile">
        <div className="modal-header">
          <h2 className="modal-title">Mi perfil</h2>
          <button className="icon-btn" onClick={onClose}>
            <span className="mat-icon">close</span>
          </button>
        </div>

        {/* Profile preview banner */}
        <div className="profile-banner">
          <div className="profile-banner-bg" style={{ background: profile.color }} />
          <div className="profile-banner-content">
            <Avatar initials={profile.initials || 'FA'} color={profile.color} size={56} />
            <div>
              <div className="profile-banner-name">{profile.name || 'Nombre'}</div>
              <div className="profile-banner-role">{profile.role || 'Rol'}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ padding: '0 16px' }}>
          {[
            { id: 'profile', label: 'Perfil',  icon: 'person'   },
            { id: 'theme',   label: 'Apariencia', icon: 'palette' },
          ].map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}>
              <span className="mat-icon" style={{ fontSize: 16, marginRight: 4 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">

          {/* ── Profile tab ── */}
          {tab === 'profile' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input className="form-input" value={profile.name}
                    onChange={e => set('name', e.target.value)}
                    onBlur={e => set('initials', autoInitials(e.target.value))}
                    placeholder="Tu nombre" />
                </div>
                <div className="form-group">
                  <label className="form-label">Iniciales</label>
                  <input className="form-input" value={profile.initials} maxLength={3}
                    onChange={e => set('initials', e.target.value.toUpperCase().slice(0,3))}
                    placeholder="FA" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cargo / Rol</label>
                <input className="form-input" value={profile.role}
                  onChange={e => set('role', e.target.value)}
                  placeholder="ej. Area Leader" />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={profile.email || ''}
                  onChange={e => set('email', e.target.value)}
                  placeholder="tu@email.com" />
              </div>

              <div className="form-group">
                <label className="form-label">Color de avatar</label>
                <div className="color-picker">
                  {COLORS.map(c => (
                    <button key={c} className={`color-swatch ${profile.color === c ? 'selected' : ''}`}
                      style={{ background: c }} onClick={() => set('color', c)} />
                  ))}
                  {/* Dark option */}
                  <button className={`color-swatch ${profile.color === '#1e293b' ? 'selected' : ''}`}
                    style={{ background: '#1e293b' }} onClick={() => set('color', '#1e293b')} />
                </div>
              </div>
            </>
          )}

          {/* ── Theme tab ── */}
          {tab === 'theme' && (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Elige el tema de color de la interfaz. El cambio se aplica inmediatamente y se guarda en este dispositivo.
              </p>
              <div className="theme-grid">
                {THEMES.map(theme => (
                  <button key={theme.id}
                    className={`theme-card ${activeTheme === theme.id ? 'selected' : ''}`}
                    onClick={() => selectTheme(theme)}>
                    {/* Preview */}
                    <div className="theme-preview">
                      <div className="tp-sidebar" style={{ background: theme.primary }} />
                      <div className="tp-content" style={{ background: theme.surface }}>
                        <div className="tp-bar" style={{ background: theme.accent }} />
                        <div className="tp-bar tp-bar-sm" style={{ background: theme.accent + '60' }} />
                        <div className="tp-bar tp-bar-sm" style={{ background: theme.accent + '40' }} />
                      </div>
                    </div>
                    <div className="theme-label">
                      {theme.label}
                      {activeTheme === theme.id && (
                        <span className="mat-icon" style={{ fontSize: 14, color: 'var(--accent)' }}>check</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {tab === 'profile' && (
            <button className="btn btn-primary" onClick={saveProfile}>
              {saved
                ? <><span className="mat-icon">check</span> Guardado</>
                : <><span className="mat-icon">save</span> Guardar perfil</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
