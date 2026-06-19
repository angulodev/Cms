import { useState, useEffect } from 'react'
import { getMyCompanies, createCompany, setActiveCompanyId } from '../lib/company'
import { supabase } from '../lib/supabase'

// Pantalla intermedia: se muestra cuando hay sesión pero no hay empresa
// activa seleccionada. Tres casos:
//  - El usuario no pertenece a ninguna empresa  → solo puede crear una
//    (el alta es por invitación, así que si no tiene ninguna, no hay
//    nadie que lo invite todavía: crea la suya y queda como admin)
//  - El usuario pertenece a 1 empresa            → la selecciona sola
//  - El usuario pertenece a +1 empresa            → elige cuál usar
export default function CompanyGate({ onCompanySelected }) {
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [creating, setCreating] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const list = await getMyCompanies()
        if (!active) return
        setCompanies(list)
        // Si solo tiene una empresa activa, selecciónala automáticamente
        const activeCompanies = list.filter(c => c.status === 'active')
        if (activeCompanies.length === 1) {
          selectCompany(activeCompanies[0].id)
          return
        }
      } catch (e) {
        if (active) setError(e.message)
      }
      if (active) setLoading(false)
    }

    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  function selectCompany(companyId) {
    setActiveCompanyId(companyId)
    onCompanySelected(companyId)
  }

  async function handleCreateCompany(e) {
    e.preventDefault()
    if (!newCompanyName.trim()) return
    setBusy(true)
    setError('')
    try {
      const companyId = await createCompany(newCompanyName.trim())
      selectCompany(companyId)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div className="cg-shell">
        <div className="cg-card">
          <span className="mat-icon spin" style={{ fontSize: 32, color: 'var(--accent)' }}>hub</span>
        </div>
      </div>
    )
  }

  const activeCompanies = companies.filter(c => c.status === 'active')
  const pendingCompanies = companies.filter(c => c.status === 'pending')

  return (
    <div className="cg-shell">
      <div className="cg-card">
        <div className="cg-header">
          <div className="cg-brand-icon"><span className="mat-icon">hub</span></div>
          <h1>Elige tu espacio de trabajo</h1>
          <p>Selecciona una empresa para continuar, o crea una nueva.</p>
        </div>

        {error && (
          <div className="lp-msg lp-msg-err" style={{ marginBottom: 16 }}>
            <span className="mat-icon" style={{ fontSize: 16 }}>error_outline</span>
            {error}
          </div>
        )}

        {pendingCompanies.length > 0 && (
          <div className="cg-pending-note">
            <span className="mat-icon" style={{ fontSize: 16 }}>schedule</span>
            Tienes {pendingCompanies.length} invitación{pendingCompanies.length > 1 ? 'es' : ''} pendiente{pendingCompanies.length > 1 ? 's' : ''} de confirmar desde el correo de invitación.
          </div>
        )}

        {activeCompanies.length > 0 && (
          <div className="cg-company-list">
            {activeCompanies.map(c => (
              <button key={c.id} className="cg-company-item" onClick={() => selectCompany(c.id)}>
                <div className="cg-company-icon"><span className="mat-icon">business</span></div>
                <div className="cg-company-info">
                  <div className="cg-company-name">{c.name}</div>
                  <div className="cg-company-roles">{(c.roles || []).join(', ') || 'Miembro'}</div>
                </div>
                <span className="mat-icon" style={{ color: 'var(--text-muted)' }}>chevron_right</span>
              </button>
            ))}
          </div>
        )}

        <div className="cg-divider"><span>o crea una empresa nueva</span></div>

        {!creating ? (
          <button className="cg-create-btn" onClick={() => setCreating(true)}>
            <span className="mat-icon">add_business</span>
            Crear nueva empresa
          </button>
        ) : (
          <form onSubmit={handleCreateCompany} className="cg-create-form">
            <div className="lp-field">
              <label className="lp-label">Nombre de la empresa</label>
              <div className="lp-input-wrap">
                <span className="mat-icon lp-input-icon">business</span>
                <input
                  className="lp-input"
                  type="text"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="Mi Empresa SpA"
                  required
                  autoFocus
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={() => { setCreating(false); setError('') }} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="lp-submit" disabled={busy} style={{ flex: 1 }}>
                {busy
                  ? <><span className="mat-icon spin">refresh</span> Creando…</>
                  : <><span className="mat-icon">check</span> Crear y entrar</>}
              </button>
            </div>
          </form>
        )}

        <button className="cg-logout-link" onClick={handleLogout}>
          <span className="mat-icon" style={{ fontSize: 14 }}>logout</span> Cerrar sesión
        </button>
      </div>
    </div>
  )
}
