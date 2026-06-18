import { useEffect, useState } from 'react'
import { getAllMembers, upsertMember } from '../lib/supabase'
import { Avatar, Skeleton, EmptyState } from './UI'

const COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b',
  '#ef4444','#06b6d4','#ec4899','#64748b',
]
const EMPTY_FORM = { name: '', initials: '', role: '', color: '#3b82f6', email: '', active: true }

function autoInitials(name) {
  return name.trim().split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('')
}

// ── Toast ──────────────────────────────────────────
function Toast({ msg, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={`toast toast-${type}`}>
      <span className="mat-icon">{type === 'success' ? 'check_circle' : 'error_outline'}</span>
      {msg}
    </div>
  )
}

// ── Confirm modal ──────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmClass = 'btn-primary', onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onCancel}>
            <span className="mat-icon">close</span>
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export default function Team() {
  const [members, setMembers]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [confirm, setConfirm]         = useState(null)  // { member, action }
  const [toast, setToast]             = useState(null)  // { msg, type }

  const load = () => {
    setLoading(true)
    getAllMembers().then(setMembers).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    getAllMembers().then(setMembers).catch(console.error).finally(() => setLoading(false))
  }, [])

  const active   = members.filter(m => m.active !== false)
  const inactive = members.filter(m => m.active === false)
  const visible  = showInactive ? members : active

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
  }

  function openNew() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setShowModal(true)
  }
  function openEdit(m) {
    setEditing(m)
    setForm({ name: m.name, initials: m.initials, role: m.role,
              color: m.color, email: m.email || '', active: m.active !== false })
    setError(''); setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.role.trim()) { setError('Nombre y rol son obligatorios.'); return }

    // Si está cambiando estado, pedir confirmación
    if (editing && form.active !== (editing.active !== false)) {
      setShowModal(false)
      setConfirm({
        member: editing,
        action: form.active ? 'activate' : 'deactivate',
        pendingForm: { ...form },
      })
      return
    }

    await doSave(form)
  }

  async function doSave(formData) {
    setSaving(true); setError('')
    try {
      await upsertMember({ ...formData, id: editing?.id })
      setShowModal(false)
      load()
      showToast(editing ? `${formData.name} actualizado correctamente.` : `${formData.name} agregado al equipo.`)
    } catch(e) { setError(e.message || 'Error al guardar.') }
    finally { setSaving(false) }
  }

  async function handleConfirmAction() {
    const { action, pendingForm, member } = confirm
    setConfirm(null)
    setSaving(true)
    try {
      await upsertMember({ ...pendingForm, id: member.id })
      load()
      showToast(
        action === 'activate'
          ? `${member.name} está activo nuevamente.`
          : `${member.name} fue desactivado.`,
        action === 'activate' ? 'success' : 'warning'
      )
    } catch(e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestión de Equipo</h1>
          <p className="page-sub">
            {active.length} activa{active.length !== 1 ? 's' : ''}
            {inactive.length > 0 && ` · ${inactive.length} inactiva${inactive.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="header-actions">
          {inactive.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowInactive(v => !v)}>
              <span className="mat-icon">{showInactive ? 'visibility_off' : 'visibility'}</span>
              <span>{showInactive ? 'Ocultar' : 'Ver inactivos'}</span>
            </button>
          )}
          <button className="btn btn-primary" onClick={openNew}>
            <span className="mat-icon">person_add</span>
            <span>Agregar</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="team-grid-members">{[1,2,3,4].map(i => <Skeleton key={i} h={160}/>)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon="group_off" title="Sin miembros" sub="Agrega personas a tu equipo." />
      ) : (
        <div className="team-grid-members">
          {visible.map(m => {
            const isInactive = m.active === false
            return (
              <div key={m.id} className={`member-card ${isInactive ? 'member-card-inactive' : ''}`}
                onClick={() => openEdit(m)} style={{ cursor: 'pointer' }}>
                <div className="member-card-top">
                  <div style={{ position: 'relative' }}>
                    <Avatar initials={m.initials} color={isInactive ? '#94a3b8' : m.color} size={52} />
                    {isInactive && (
                      <div className="inactive-badge">
                        <span className="mat-icon">block</span>
                      </div>
                    )}
                  </div>
                  {/* Solo ícono de editar — sin botón de desactivar */}
                  <button className="icon-btn" onClick={e => { e.stopPropagation(); openEdit(m) }} title="Editar">
                    <span className="mat-icon">edit</span>
                  </button>
                </div>
                <div className="member-name" style={{ color: isInactive ? 'var(--text-muted)' : undefined }}>
                  {m.name}
                </div>
                <div className="member-role">{m.role}</div>
                {m.email && (
                  <div className="member-email">
                    <span className="mat-icon" style={{fontSize:12}}>mail_outline</span>
                    {m.email}
                  </div>
                )}
                {isInactive && <div className="inactive-label">Inactivo</div>}
                <div className="member-color-strip" style={{ background: isInactive ? '#e2e8f0' : m.color }} />
              </div>
            )
          })}
          <div className="member-card member-card-add" onClick={openNew}>
            <div className="add-person-icon"><span className="mat-icon">person_add</span></div>
            <div className="member-name muted">Agregar miembro</div>
          </div>
        </div>
      )}

      {/* ── Edit/New Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Editar persona' : 'Nueva persona'}</h2>
              <button className="icon-btn" onClick={() => setShowModal(false)}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="member-preview">
                <Avatar initials={form.initials || '?'} color={form.active ? form.color : '#94a3b8'} size={52} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{form.name || 'Nombre completo'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.role || 'Rol / Cargo'}</div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="form-input" autoFocus value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value, initials: autoInitials(e.target.value) }))}
                  placeholder="ej. María López" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Iniciales</label>
                  <input className="form-input" value={form.initials} maxLength={3}
                    onChange={e => setForm(f => ({ ...f, initials: e.target.value.toUpperCase().slice(0,3) }))}
                    placeholder="ML" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="maria@empresa.com" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Rol / Cargo *</label>
                <input className="form-input" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="ej. Backend Engineer" />
              </div>
              <div className="form-group">
                <label className="form-label">Color de avatar</label>
                <div className="color-picker">
                  {COLORS.map(c => (
                    <button key={c} className={`color-swatch ${form.color === c ? 'selected' : ''}`}
                      style={{ background: c }} onClick={() => setForm(f => ({ ...f, color: c }))} />
                  ))}
                </div>
              </div>

              {/* Estado — solo al editar */}
              {editing && (
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <div className="status-list">
                    {[
                      { value: true,  icon: 'check_circle', label: 'Activo',   desc: 'Aparece en equipo y asignaciones', cls: 'sl-active'   },
                      { value: false, icon: 'block',        label: 'Inactivo', desc: 'Oculto del equipo activo',         cls: 'sl-inactive' },
                    ].map(opt => (
                      <button key={String(opt.value)} type="button"
                        className={`status-list-item ${form.active === opt.value ? opt.cls + ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, active: opt.value }))}>
                        <span className={`mat-icon sl-icon ${opt.cls}`}>{opt.icon}</span>
                        <div className="sl-text">
                          <span className="sl-label">{opt.label}</span>
                          <span className="sl-desc">{opt.desc}</span>
                        </div>
                        {form.active === opt.value && <span className="mat-icon sl-check">radio_button_checked</span>}
                        {form.active !== opt.value && <span className="mat-icon sl-check" style={{opacity:.3}}>radio_button_unchecked</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <div className="form-error"><span className="mat-icon">error_outline</span>{error}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><span className="mat-icon spin">refresh</span> Guardando…</>
                  : <><span className="mat-icon">check</span> {editing ? 'Guardar' : 'Crear'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modal ── */}
      {confirm && (
        <ConfirmModal
          title={confirm.action === 'activate' ? 'Reactivar persona' : 'Desactivar persona'}
          message={
            confirm.action === 'activate'
              ? `¿Confirmas reactivar a ${confirm.member.name}? Volverá a aparecer en el equipo y en las asignaciones.`
              : `¿Confirmas desactivar a ${confirm.member.name}? No aparecerá en el equipo activo ni en nuevas asignaciones. Puedes reactivarlo después.`
          }
          confirmLabel={confirm.action === 'activate' ? 'Sí, reactivar' : 'Sí, desactivar'}
          confirmClass={confirm.action === 'activate' ? 'btn-primary' : 'btn-danger'}
          onConfirm={handleConfirmAction}
          onCancel={() => { setConfirm(null); setShowModal(true) }}
        />
      )}

      {/* ── Toast ── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
