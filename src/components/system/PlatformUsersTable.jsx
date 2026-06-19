import { useEffect, useState } from 'react'
import { listAllUsers, getUserDetail, setUserActive, adminRemoveUserFromCompany } from '../../lib/company'
import { Avatar, Skeleton, EmptyState } from '../UI'

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

const MEMBER_STATUS_LABEL = { active: 'Activo', pending: 'Pendiente', suspended: 'Suspendido', revoked: 'Revocado' }
const MEMBER_STATUS_CLASS = { active: 'badge-success', pending: 'badge-warning', suspended: 'badge-muted', revoked: 'badge-error' }

function initialsFrom(name, email) {
  const base = name || email || '?'
  return base.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PlatformUsersTable() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)

  useEffect(() => {
    let active = true
    async function loadInitial() {
      setLoading(true)
      try {
        const data = await listAllUsers()
        if (active) setUsers(data)
      } catch (e) {
        if (active) showToast(e.message, 'error')
      }
      if (active) setLoading(false)
    }
    loadInitial()
    return () => { active = false }
  }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
  }

  async function reload() {
    try {
      const data = await listAllUsers()
      setUsers(data)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function openDetail(userId) {
    setSelectedUserId(userId)
    setDetailLoading(true)
    try {
      const data = await getUserDetail(userId)
      setDetail(data)
    } catch (e) {
      showToast(e.message, 'error')
    }
    setDetailLoading(false)
  }

  function closeDetail() {
    setSelectedUserId(null)
    setDetail(null)
  }

  async function handleToggleActive(user) {
    try {
      await setUserActive(user.id, !user.profile_active)
      showToast(`${user.full_name || user.email} ${!user.profile_active ? 'activado' : 'desactivado'}.`)
      reload()
      if (selectedUserId === user.id) openDetail(user.id)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function handleRemoveFromCompany() {
    const { userId, companyId, companyName } = confirmRemove
    setConfirmRemove(null)
    try {
      await adminRemoveUserFromCompany(userId, companyId)
      showToast(`Usuario removido de ${companyName}.`, 'warning')
      openDetail(userId)
      reload()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const filtered = users.filter(u => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  })

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-sub">{users.length} usuario{users.length !== 1 ? 's' : ''} registrados en la plataforma</p>
        </div>
      </div>

      <div className="sys-table-search">
        <span className="mat-icon" style={{ fontSize: 18, color: 'var(--text-muted)' }}>search</span>
        <input
          type="text"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} h={48} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="group_off" title="Sin usuarios" sub="Nadie se ha registrado todavía." />
      ) : (
        <div className="sys-table-wrap">
          <table className="sys-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Empresas</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th>Registrado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr
                  key={u.id}
                  className={selectedUserId === u.id ? 'sys-table-row-active' : ''}
                  onClick={() => openDetail(u.id)}
                >
                  <td>
                    <div className="sys-table-user-cell">
                      <Avatar initials={initialsFrom(u.full_name, u.email)} color="#3b82f6" size={28} />
                      <span>{u.full_name || '—'}</span>
                      {u.is_platform_admin && <span className="badge badge-warning">Super-admin</span>}
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.company_count}</td>
                  <td>
                    <span className={`badge ${u.profile_active === false ? 'badge-error' : 'badge-success'}`}>
                      {u.profile_active === false ? 'Inactivo' : 'Activo'}
                    </span>
                  </td>
                  <td>{formatDateTime(u.last_sign_in_at)}</td>
                  <td>{formatDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Panel de detalle: el "registro" abierto + related list ── */}
      {selectedUserId && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeDetail() }}>
          <div className="modal modal-xl">
            <div className="modal-header">
              <h2 className="modal-title">Detalle de usuario</h2>
              <button className="icon-btn" onClick={closeDetail}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <div className="modal-body">
              {detailLoading || !detail ? (
                <Skeleton h={200} />
              ) : (
                <>
                  <div className="sys-user-detail-header">
                    <Avatar initials={initialsFrom(detail.user.full_name, detail.user.email)} color="#3b82f6" size={56} />
                    <div style={{ flex: 1 }}>
                      <div className="sys-user-detail-name">
                        {detail.user.full_name || 'Sin nombre'}
                        {detail.user.is_platform_admin && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Super-admin</span>}
                      </div>
                      <div className="sys-user-detail-email">{detail.user.email}</div>
                    </div>
                    <button
                      className={`btn ${detail.user.profile_active === false ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => handleToggleActive({ id: detail.user.id, full_name: detail.user.full_name, email: detail.user.email, profile_active: detail.user.profile_active })}
                    >
                      <span className="mat-icon" style={{ fontSize: 16 }}>
                        {detail.user.profile_active === false ? 'check_circle' : 'block'}
                      </span>
                      {detail.user.profile_active === false ? 'Activar' : 'Desactivar'}
                    </button>
                  </div>

                  <div className="sys-user-detail-fields">
                    <div className="sys-detail-field">
                      <span className="sys-detail-field-label">Registrado</span>
                      <span>{formatDateTime(detail.user.created_at)}</span>
                    </div>
                    <div className="sys-detail-field">
                      <span className="sys-detail-field-label">Último acceso</span>
                      <span>{formatDateTime(detail.user.last_sign_in_at)}</span>
                    </div>
                    <div className="sys-detail-field">
                      <span className="sys-detail-field-label">Email confirmado</span>
                      <span>{detail.user.email_confirmed ? 'Sí' : 'No'}</span>
                    </div>
                    <div className="sys-detail-field">
                      <span className="sys-detail-field-label">Teléfono</span>
                      <span>{detail.user.phone || '—'}</span>
                    </div>
                  </div>

                  {/* ── Related list: empresas ── */}
                  <div className="sys-related-list">
                    <div className="sys-related-list-header">
                      <span className="mat-icon" style={{ fontSize: 16 }}>business</span>
                      Empresas ({detail.companies.length})
                    </div>
                    {detail.companies.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                        No pertenece a ninguna empresa.
                      </div>
                    ) : (
                      <table className="sys-table sys-table-nested">
                        <thead>
                          <tr>
                            <th>Empresa</th>
                            <th>Rol(es)</th>
                            <th>Estado</th>
                            <th>Desde</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.companies.map(c => (
                            <tr key={c.company_id}>
                              <td>{c.company_name}</td>
                              <td style={{ textTransform: 'capitalize' }}>{(c.roles || []).join(', ') || '—'}</td>
                              <td>
                                <span className={`badge ${MEMBER_STATUS_CLASS[c.member_status] || 'badge-muted'}`}>
                                  {MEMBER_STATUS_LABEL[c.member_status] || c.member_status}
                                </span>
                              </td>
                              <td>{c.joined_at ? formatDateTime(c.joined_at) : '—'}</td>
                              <td>
                                {c.member_status !== 'revoked' && (
                                  <button
                                    className="icon-btn"
                                    title="Quitar de la empresa"
                                    onClick={() => setConfirmRemove({ userId: detail.user.id, companyId: c.company_id, companyName: c.company_name })}
                                  >
                                    <span className="mat-icon" style={{ fontSize: 16, color: 'var(--error)' }}>person_remove</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeDetail}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Quitar de la empresa"
          message={`¿Quitar a este usuario de "${confirmRemove.companyName}"? Podrá ser invitado de nuevo después.`}
          confirmLabel="Quitar"
          confirmClass="btn-danger"
          onConfirm={handleRemoveFromCompany}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
