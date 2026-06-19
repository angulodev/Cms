import { useEffect, useState } from 'react'
import {
  listMembers, listRoles, changeMemberRole, revokeMember,
  reactivateMember, inviteMember,
} from '../../lib/company'
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

const STATUS_LABEL = { active: 'Activo', pending: 'Pendiente', suspended: 'Suspendido', revoked: 'Revocado' }
const STATUS_CLASS = { active: 'badge-success', pending: 'badge-warning', suspended: 'badge-muted', revoked: 'badge-error' }

function initialsFrom(name, email) {
  const base = name || email || '?'
  return base.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
}

export default function Users({ companyId }) {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState([])
  const [toast, setToast] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true

    async function loadInitial() {
      setLoading(true)
      try {
        const [m, r] = await Promise.all([listMembers(companyId), listRoles(companyId)])
        if (!active) return
        setMembers(m)
        setRoles(r)
        const memberRole = r.find(x => x.name === 'member')
        setInviteRoleId(memberRole?.id || r[0]?.id || '')
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
      const [m, r] = await Promise.all([listMembers(companyId), listRoles(companyId)])
      setMembers(m)
      setRoles(r)
    } catch (e) {
      showToast(e.message, 'error')
    }
    setLoading(false)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail.trim() || !inviteRoleId) return
    setBusy(true)
    try {
      const roleName = roles.find(r => r.id === inviteRoleId)?.name
      await inviteMember(companyId, inviteEmail.trim(), roleName)
      showToast(`Invitación enviada a ${inviteEmail.trim()}.`)
      setInviteEmail('')
      setInviting(false)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setBusy(false)
  }

  async function handleRoleChange(member, roleId) {
    try {
      await changeMemberRole(companyId, member.user_id, roleId)
      showToast(`Rol actualizado para ${member.full_name || member.email}.`)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function handleRevoke() {
    const member = confirm.member
    setConfirm(null)
    try {
      await revokeMember(companyId, member.user_id)
      showToast(`Acceso revocado a ${member.full_name || member.email}.`, 'warning')
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function handleReactivate(member) {
    try {
      const memberRole = roles.find(r => r.name === 'member')
      await reactivateMember(companyId, member.user_id, memberRole?.id)
      showToast(`Acceso restaurado para ${member.full_name || member.email}.`)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-sub">{members.length} miembro{members.length !== 1 ? 's' : ''} en la empresa</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setInviting(true)}>
            <span className="mat-icon">person_add</span>
            <span>Invitar</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} h={64} />)}
        </div>
      ) : members.length === 0 ? (
        <EmptyState icon="group_off" title="Sin miembros" sub="Invita a alguien para empezar." />
      ) : (
        <div className="sys-user-list">
          {members.map(m => {
            const currentRoleId = m.roles?.[0]?.role_id || ''
            const isRevoked = m.status === 'revoked'
            return (
              <div key={m.member_id} className={`sys-user-row ${isRevoked ? 'sys-user-row-revoked' : ''}`}>
                <Avatar initials={initialsFrom(m.full_name, m.email || m.invited_email)} color="#3b82f6" size={40} />
                <div className="sys-user-info">
                  <div className="sys-user-name">{m.full_name || m.email || m.invited_email || 'Sin nombre'}</div>
                  <div className="sys-user-email">{m.email || m.invited_email}</div>
                </div>
                <span className={`badge ${STATUS_CLASS[m.status] || 'badge-muted'}`}>
                  {STATUS_LABEL[m.status] || m.status}
                </span>
                {!isRevoked ? (
                  <select
                    className="sys-role-select"
                    value={currentRoleId}
                    onChange={e => handleRoleChange(m, e.target.value)}
                    disabled={m.status === 'pending'}
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                )}
                {isRevoked ? (
                  <button className="btn btn-ghost" onClick={() => handleReactivate(m)}>
                    <span className="mat-icon" style={{ fontSize: 16 }}>restore</span> Reactivar
                  </button>
                ) : (
                  <button className="icon-btn" title="Revocar acceso" onClick={() => setConfirm({ member: m })}>
                    <span className="mat-icon" style={{ color: 'var(--error)' }}>person_remove</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {inviting && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setInviting(false) }}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <h2 className="modal-title">Invitar a la empresa</h2>
              <button className="icon-btn" onClick={() => setInviting(false)}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="lp-field">
                  <label className="lp-label">Email</label>
                  <div className="lp-input-wrap">
                    <span className="mat-icon lp-input-icon">mail</span>
                    <input
                      className="lp-input"
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="persona@empresa.com"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div className="lp-field">
                  <label className="lp-label">Rol</label>
                  <select
                    className="sys-role-select"
                    style={{ width: '100%' }}
                    value={inviteRoleId}
                    onChange={e => setInviteRoleId(e.target.value)}
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setInviting(false)} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <><span className="mat-icon spin">refresh</span> Enviando…</> : 'Enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title="Revocar acceso"
          message={`¿Seguro que quieres revocar el acceso de ${confirm.member.full_name || confirm.member.email}? Podrás reactivarlo después.`}
          confirmLabel="Revocar"
          confirmClass="btn-danger"
          onConfirm={handleRevoke}
          onCancel={() => setConfirm(null)}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
