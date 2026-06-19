import { useEffect, useState } from 'react'
import {
  listRoles, listPermissions, createRole, updateRolePermissions, deleteRole,
} from '../../lib/company'
import { Skeleton, EmptyState } from '../UI'

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

const MODULE_LABEL = { sys_core: 'Sistema', area_leader: 'Administración de Proyectos' }

export default function Roles({ companyId }) {
  const [loading, setLoading] = useState(true)
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [selectedRole, setSelectedRole] = useState(null)
  const [checkedPerms, setCheckedPerms] = useState(new Set())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    let active = true

    async function loadInitial() {
      setLoading(true)
      try {
        const [r, p] = await Promise.all([listRoles(companyId), listPermissions()])
        if (!active) return
        setRoles(r)
        setPermissions(p)
        if (r.length > 0) selectRole(r[0])
      } catch (e) {
        if (active) showToast(e.message, 'error')
      }
      if (active) setLoading(false)
    }

    loadInitial()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([listRoles(companyId), listPermissions()])
      setRoles(r)
      setPermissions(p)
    } catch (e) {
      showToast(e.message, 'error')
    }
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
  }

  function selectRole(role) {
    setSelectedRole(role)
    setCheckedPerms(new Set(role.permission_ids || []))
    setDirty(false)
  }

  function togglePermission(permId) {
    if (selectedRole?.is_system) return
    setCheckedPerms(prev => {
      const next = new Set(prev)
      if (next.has(permId)) next.delete(permId)
      else next.add(permId)
      return next
    })
    setDirty(true)
  }

  function toggleModule(modulePerms, allChecked) {
    if (selectedRole?.is_system) return
    setCheckedPerms(prev => {
      const next = new Set(prev)
      modulePerms.forEach(p => {
        if (allChecked) next.delete(p.id)
        else next.add(p.id)
      })
      return next
    })
    setDirty(true)
  }

  async function handleSavePermissions() {
    setSaving(true)
    try {
      await updateRolePermissions(companyId, selectedRole.id, Array.from(checkedPerms))
      showToast(`Permisos de "${selectedRole.name}" actualizados.`)
      setDirty(false)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setSaving(false)
  }

  async function handleCreateRole(e) {
    e.preventDefault()
    if (!newRoleName.trim()) return
    try {
      await createRole(companyId, newRoleName.trim())
      showToast(`Rol "${newRoleName.trim()}" creado.`)
      setNewRoleName('')
      setCreating(false)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function handleDeleteRole() {
    const role = confirmDelete
    setConfirmDelete(null)
    try {
      await deleteRole(companyId, role.id)
      showToast(`Rol "${role.name}" eliminado.`)
      if (selectedRole?.id === role.id) setSelectedRole(null)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const permsByModule = permissions.reduce((acc, p) => {
    (acc[p.module_id] ||= []).push(p)
    return acc
  }, {})

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles y permisos</h1>
          <p className="page-sub">{roles.length} rol{roles.length !== 1 ? 'es' : ''} en la empresa</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <span className="mat-icon">add</span>
            <span>Nuevo rol</span>
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton h={300} />
      ) : roles.length === 0 ? (
        <EmptyState icon="shield" title="Sin roles" sub="Crea tu primer rol custom." />
      ) : (
        <div className="sys-roles-layout">
          <div className="sys-roles-list">
            {roles.map(r => (
              <div
                key={r.id}
                className={`sys-role-item ${selectedRole?.id === r.id ? 'active' : ''}`}
                onClick={() => selectRole(r)}
              >
                <div className="sys-role-item-info">
                  <div className="sys-role-item-name">
                    {r.name}
                    {r.is_system && <span className="badge badge-muted" style={{ marginLeft: 6 }}>Sistema</span>}
                  </div>
                  <div className="sys-role-item-meta">{r.member_count} usuario{r.member_count !== 1 ? 's' : ''} · {(r.permission_ids || []).length} permisos</div>
                </div>
                {!r.is_system && (
                  <button
                    className="icon-btn"
                    title="Eliminar rol"
                    onClick={e => { e.stopPropagation(); setConfirmDelete(r) }}
                  >
                    <span className="mat-icon" style={{ fontSize: 16, color: 'var(--error)' }}>delete</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="sys-roles-detail">
            {selectedRole ? (
              <>
                <div className="sys-roles-detail-header">
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700 }}>{selectedRole.name}</h2>
                    {selectedRole.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedRole.description}</p>
                    )}
                  </div>
                  {selectedRole.is_system && (
                    <span className="badge badge-muted">Los roles de sistema no son editables</span>
                  )}
                </div>

                {Object.entries(permsByModule).map(([moduleId, perms]) => {
                  const allChecked = perms.every(p => checkedPerms.has(p.id))
                  const someChecked = perms.some(p => checkedPerms.has(p.id))
                  return (
                    <div key={moduleId} className="sys-perm-group">
                      <div
                        className="sys-perm-group-header"
                        onClick={() => toggleModule(perms, allChecked)}
                        style={{ cursor: selectedRole.is_system ? 'default' : 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={allChecked}
                          readOnly
                          style={{ opacity: someChecked && !allChecked ? 0.5 : 1 }}
                          disabled={selectedRole.is_system}
                        />
                        <span className="sys-perm-group-title">{MODULE_LABEL[moduleId] || moduleId}</span>
                      </div>
                      <div className="sys-perm-list">
                        {perms.map(p => (
                          <label key={p.id} className="sys-perm-item">
                            <input
                              type="checkbox"
                              checked={checkedPerms.has(p.id)}
                              onChange={() => togglePermission(p.id)}
                              disabled={selectedRole.is_system}
                            />
                            <div>
                              <div className="sys-perm-item-name">{p.resource}.{p.action}</div>
                              <div className="sys-perm-item-desc">{p.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {!selectedRole.is_system && (
                  <div className="sys-roles-save-bar">
                    <button
                      className="btn btn-primary"
                      onClick={handleSavePermissions}
                      disabled={!dirty || saving}
                    >
                      {saving ? <><span className="mat-icon spin">refresh</span> Guardando…</> : 'Guardar permisos'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon="touch_app" title="Selecciona un rol" sub="Elige un rol de la lista para ver sus permisos." />
            )}
          </div>
        </div>
      )}

      {creating && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCreating(false) }}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <h2 className="modal-title">Nuevo rol</h2>
              <button className="icon-btn" onClick={() => setCreating(false)}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateRole}>
              <div className="modal-body">
                <div className="lp-field">
                  <label className="lp-label">Nombre del rol</label>
                  <div className="lp-input-wrap">
                    <span className="mat-icon lp-input-icon">badge</span>
                    <input
                      className="lp-input"
                      type="text"
                      value={newRoleName}
                      onChange={e => setNewRoleName(e.target.value)}
                      placeholder="Supervisor"
                      required
                      autoFocus
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Eliminar rol"
          message={`¿Eliminar el rol "${confirmDelete.name}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          confirmClass="btn-danger"
          onConfirm={handleDeleteRole}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
