import { useEffect, useState } from 'react'
import { createShareLink, listShareLinks, revokeShareLink } from '../lib/supabase'

const EXPIRY_OPTIONS = [
  { value: '', label: 'Sin expiración' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
]

function buildShareUrl(scope, token) {
  // window.location.origin no incluye el subpath de GitHub Pages (/Cms/),
  // así que se usa el BASE_URL configurado en vite.config.js para no hardcodearlo.
  const base = window.location.origin + import.meta.env.BASE_URL
  return scope === 'project' ? `${base}share/project/${token}` : `${base}share/portfolio/${token}`
}

export default function ShareModal({ scope, projectId, projectName, onClose }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [expiry, setExpiry] = useState('30')
  const [copiedId, setCopiedId] = useState(null)
  const [revoking, setRevoking] = useState(null)

  const load = () => {
    setLoading(true)
    listShareLinks(scope === 'project' ? projectId : null)
      .then(all => setLinks(all.filter(l => l.scope === scope)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    listShareLinks(scope === 'project' ? projectId : null)
      .then(all => setLinks(all.filter(l => l.scope === scope)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única al montar; recargas posteriores usan load()
  }, [])

  async function handleCreate() {
    setCreating(true)
    try {
      await createShareLink({
        scope,
        projectId: scope === 'project' ? projectId : null,
        label: label.trim() || null,
        expiresInDays: expiry ? Number(expiry) : null,
      })
      setLabel('')
      load()
    } catch (err) {
      alert('Error al crear el link: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id) {
    setRevoking(id)
    try {
      await revokeShareLink(id)
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setRevoking(null)
    }
  }

  function handleCopy(link) {
    const url = buildShareUrl(scope, link.token)
    navigator.clipboard.writeText(url)
    setCopiedId(link.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const activeLinks = links.filter(l => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()))
  const inactiveLinks = links.filter(l => l.revoked_at || (l.expires_at && new Date(l.expires_at) <= new Date()))

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {scope === 'project' ? `Compartir "${projectName}"` : 'Compartir portfolio completo'}
          </h2>
          <button className="icon-btn" onClick={onClose}><span className="mat-icon">close</span></button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            {scope === 'project'
              ? 'Cualquier persona con este link podrá ver el detalle de este proyecto, sin necesidad de iniciar sesión.'
              : 'Cualquier persona con este link podrá ver todos tus proyectos activos, sin necesidad de iniciar sesión.'}
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            <input
              className="filter-input"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="Nombre (opcional, ej: Para el cliente X)"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
            <select className="filter-select" value={expiry} onChange={e => setExpiry(e.target.value)}>
              {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="btn btn-primary" disabled={creating} onClick={handleCreate}>
              <span className="mat-icon">add_link</span>
              <span>{creating ? 'Creando…' : 'Crear link'}</span>
            </button>
          </div>

          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando…</div>
          ) : activeLinks.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '12px 0' }}>
              No hay links activos todavía.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeLinks.map(link => (
                <div key={link.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--surface)',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{link.label || 'Sin nombre'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {link.expires_at
                        ? `Vence ${new Date(link.expires_at).toLocaleDateString('es-CL')}`
                        : 'Sin expiración'}
                      {' · '}{link.view_count || 0} vista{link.view_count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(link)}>
                      <span className="mat-icon">{copiedId === link.id ? 'check' : 'content_copy'}</span>
                      <span>{copiedId === link.id ? 'Copiado' : 'Copiar'}</span>
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      title="Revocar"
                      disabled={revoking === link.id}
                      onClick={() => handleRevoke(link.id)}
                    >
                      <span className="mat-icon">{revoking === link.id ? 'hourglass_empty' : 'link_off'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {inactiveLinks.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                {inactiveLinks.length} link{inactiveLinks.length === 1 ? '' : 's'} inactivo{inactiveLinks.length === 1 ? '' : 's'}
              </summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {inactiveLinks.map(link => (
                  <div key={link.id} style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '4px 0' }}>
                    {link.label || 'Sin nombre'} — {link.revoked_at ? 'revocado' : 'vencido'}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
