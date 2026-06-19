import { useState, useEffect, useRef } from 'react'
import { supabase, getUserPrefs, saveUserPrefs } from '../lib/supabase'
import { clearActiveCompany } from '../lib/activeCompany'
import { Avatar, ConfirmModal } from './UI'

const AVATAR_COLORS = ['#1e293b','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899']

export default function ProfileDropdown({ onClose, onSaved }) {
  const panelRef = useRef(null)
  const [prefs, setPrefs] = useState(getUserPrefs)
  const [form, setForm]   = useState({
    name:  prefs.name  || 'Francisco A.',
    role:  prefs.role  || 'Area Leader',
    email: prefs.email || '',
    color: prefs.color || '#1e293b',
  })
  const [saved, setSaved] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  // Close on outside click (desactivado mientras se confirma el logout,
  // para que cancelar/cerrar el modal no cierre también el dropdown de perfil)
  useEffect(() => {
    if (confirmLogout) return
    function h(e) { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose, confirmLogout])

  function handleSave() {
    saveUserPrefs(form)
    setPrefs(p => ({ ...p, ...form }))
    setSaved(true)
    onSaved?.(form)
    setTimeout(() => setSaved(false), 2000)
  }

  const initials = form.name.trim().split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('')

  function handleSwitchCompany() {
    clearActiveCompany()
    window.location.reload() // fuerza a AuthGate a re-evaluar companyId desde cero
  }

  return (
    <div className="user-panel" ref={panelRef}>

      {/* Header */}
      <div className="user-panel-header">
        <div className="user-panel-identity">
          <Avatar initials={initials} color={form.color} size={44} />
          <div>
            <div className="user-panel-name">{form.name}</div>
            <div className="user-panel-role">{form.role}</div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <span className="mat-icon">close</span>
        </button>
      </div>

      <div className="user-panel-body">
        <div className="user-section">
          <div className="form-group">
            <label className="form-label">Nombre mostrado</label>
            <input className="form-input" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Tu nombre" />
          </div>
          <div className="form-group">
            <label className="form-label">Cargo / Rol</label>
            <input className="form-input" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="ej. Area Leader" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="tu@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Color de avatar</label>
            <div className="color-picker">
              {AVATAR_COLORS.map(c => (
                <button key={c} className={`color-swatch ${form.color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm(f => ({ ...f, color: c }))} />
              ))}
            </div>
          </div>

          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
            onClick={handleSave}>
            {saved
              ? <><span className="mat-icon">check_circle</span> Guardado</>
              : <><span className="mat-icon">save</span> Guardar perfil</>}
          </button>

          <div className="pref-divider" />

          <button
            className="btn btn-ghost"
            style={{ width:'100%', justifyContent:'center' }}
            onClick={handleSwitchCompany}
          >
            <span className="mat-icon">swap_horiz</span>
            Cambiar empresa
          </button>

          <div className="pref-divider" />

          <button
            className="btn btn-danger"
            style={{ width:'100%', justifyContent:'center' }}
            onClick={() => setConfirmLogout(true)}
          >
            <span className="mat-icon">logout</span>
            Cerrar sesión
          </button>
        </div>
      </div>

      {confirmLogout && (
        <ConfirmModal
          title="Cerrar sesión"
          message="¿Seguro que quieres cerrar sesión? Tendrás que volver a iniciar sesión para acceder a tus proyectos."
          confirmLabel="Cerrar sesión"
          confirmClass="btn-danger"
          onConfirm={async () => { await supabase.auth.signOut() }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  )
}
