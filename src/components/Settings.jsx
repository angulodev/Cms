import { useEffect, useState } from 'react'
import { getUserPrefs, saveUserPrefs, getPlanStatus, requestUpgrade, cancelPlan, undoCancelPlan } from '../lib/supabase'
import { THEMES, applyTheme } from '../lib/theme'

function formatCLP(value) {
  return !value ? 'Gratis' : `$${value.toLocaleString('es-CL')}/mes`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Settings() {
  const [tab, setTab] = useState('splash')
  const [prefs, setPrefs] = useState(getUserPrefs)
  const [form, setForm] = useState({
    splashTitle:    prefs.splashTitle    || '',
    splashSubtitle: prefs.splashSubtitle || '',
    splashLogo:     prefs.splashLogo     || '',
  })
  const [saved, setSaved] = useState(false)

  // Plan
  const [planStatus, setPlanStatus] = useState(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeRequested, setUpgradeRequested] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [planError, setPlanError] = useState('')

  useEffect(() => {
    Promise.resolve()
      .then(() => setPlanLoading(true))
      .then(() => getPlanStatus())
      .then(setPlanStatus)
      .catch(() => setPlanStatus(null))
      .finally(() => setPlanLoading(false))
  }, [])

  // Apply saved theme on mount
  useEffect(() => {
    if (prefs.themeId) {
      const t = THEMES.find(t => t.id === prefs.themeId)
      if (t) applyTheme(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr al montar
  }, [])

  function handleSaveSplash() {
    saveUserPrefs(form)
    setPrefs(p => ({ ...p, ...form }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleTheme(theme) {
    applyTheme(theme)
    saveUserPrefs({ themeId: theme.id })
    setPrefs(p => ({ ...p, themeId: theme.id }))
  }

  async function handleUpgrade() {
    if (!planStatus?.next_plan) return
    setUpgrading(true); setPlanError('')
    try {
      await requestUpgrade(planStatus.next_plan.id)
      setUpgradeRequested(true)
    } catch (e) {
      setPlanError(e.message || 'No pudimos registrar tu solicitud. Intenta de nuevo.')
    } finally {
      setUpgrading(false)
    }
  }

  async function handleConfirmCancel() {
    setCancelling(true); setPlanError('')
    try {
      const result = await cancelPlan()
      setPlanStatus(p => ({ ...p, cancel_at_period_end: true, expires_at: result.expires_at }))
      setConfirmCancel(false)
    } catch (e) {
      setPlanError(e.message || 'No pudimos procesar la cancelación. Intenta de nuevo.')
    } finally {
      setCancelling(false)
    }
  }

  async function handleUndoCancel() {
    setCancelling(true); setPlanError('')
    try {
      await undoCancelPlan()
      setPlanStatus(p => ({ ...p, cancel_at_period_end: false }))
    } catch (e) {
      setPlanError(e.message || 'No pudimos revertir la cancelación. Intenta de nuevo.')
    } finally {
      setCancelling(false)
    }
  }

  const currentTheme = THEMES.find(t => t.id === (prefs.themeId || 'default')) || THEMES[0]

  return (
    <div className="screen-content">
      <div className="page-header">
        <h1 className="page-title">Configuración</h1>
      </div>

      <div className="card card-flush">
        <div className="tabs">
          {[
            { id: 'splash', label: 'Pantalla de presentación' },
            { id: 'theme',  label: 'Tema'    },
            { id: 'plan',   label: 'Plan'    },
            { id: 'prefs',  label: 'Ajustes' },
          ].map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="tab-body">

          {/* ── SPLASH ── */}
          {tab === 'splash' && (
            <div className="settings-section">
              <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>
                Personaliza la pantalla de carga inicial de la app (título, subtítulo y logo).
              </p>

              <div className="form-group">
                <label className="form-label">Título principal</label>
                <input className="form-input" value={form.splashTitle}
                  onChange={e => setForm(f => ({ ...f, splashTitle: e.target.value }))}
                  placeholder="ej. Gestión de Proyectos 2026"/>
              </div>
              <div className="form-group">
                <label className="form-label">Subtítulo</label>
                <input className="form-input" value={form.splashSubtitle}
                  onChange={e => setForm(f => ({ ...f, splashSubtitle: e.target.value }))}
                  placeholder="ej. Empresa ABC · Q3 2026"/>
              </div>
              <div className="form-group">
                <label className="form-label">Logo (URL de imagen)</label>
                <input className="form-input" value={form.splashLogo}
                  onChange={e => setForm(f => ({ ...f, splashLogo: e.target.value }))}
                  placeholder="https://empresa.cl/logo.png"/>
                {form.splashLogo && (
                  <div style={{marginTop:8,padding:12,background:'var(--surface)',borderRadius:'var(--radius)',textAlign:'center'}}>
                    <img src={form.splashLogo} alt="preview" style={{maxHeight:48,maxWidth:'100%',objectFit:'contain'}}
                      onError={e=>e.target.style.display='none'}/>
                  </div>
                )}
              </div>

              <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
                onClick={handleSaveSplash}>
                {saved
                  ? <><span className="mat-icon">check_circle</span> Guardado</>
                  : <><span className="mat-icon">save</span> Guardar</>}
              </button>
            </div>
          )}

          {/* ── THEME ── */}
          {tab === 'theme' && (
            <div className="settings-section">
              <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
                El tema se aplica inmediatamente y se guarda para tu próxima visita.
              </p>
              <div className="theme-grid">
                {THEMES.map(t => (
                  <button key={t.id}
                    className={`theme-card ${currentTheme.id === t.id ? 'selected' : ''}`}
                    onClick={() => handleTheme(t)}>
                    <div className="theme-preview" style={{ background: t.surface }}>
                      <div className="theme-preview-bar" style={{ background: t.primary }} />
                      <div className="theme-preview-accent" style={{ background: t.accent }} />
                      <div className="theme-preview-dots">
                        <span style={{ background: t.success }} />
                        <span style={{ background: t.warning }} />
                        <span style={{ background: '#ef4444' }} />
                      </div>
                    </div>
                    <div className="theme-name">{t.name}</div>
                    <div className="theme-desc">{t.desc}</div>
                    {currentTheme.id === t.id && (
                      <span className="mat-icon theme-check">check_circle</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── PLAN ── */}
          {tab === 'plan' && (
            <div className="settings-section">
              {planLoading ? (
                <div style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
                  <span className="mat-icon spin">refresh</span>
                </div>
              ) : !planStatus ? (
                <div className="form-error"><span className="mat-icon">error_outline</span>No pudimos cargar tu plan. Intenta recargar la página.</div>
              ) : (
                <>
                  <div className="upgrade-suggestion" style={{ marginTop: 0 }}>
                    <span className="upgrade-label">Plan actual</span>
                    <strong>{planStatus.plan_name}</strong>
                    <span>{formatCLP(planStatus.price_clp)} · {planStatus.current_projects} de {planStatus.max_projects} proyectos usados</span>
                  </div>

                  {planStatus.cancel_at_period_end && (
                    <div className="plan-banner plan-banner--warning" style={{ marginTop: 16 }}>
                      <span>
                        Tu plan se cancelará el <strong>{formatDate(planStatus.expires_at)}</strong>.
                        Después de esa fecha pasarás al plan Básico.
                      </span>
                      <button onClick={handleUndoCancel} disabled={cancelling}>
                        {cancelling ? 'Procesando…' : 'Deshacer'}
                      </button>
                    </div>
                  )}

                  {planError && <div className="form-error" style={{ marginTop: 12 }}><span className="mat-icon">error_outline</span>{planError}</div>}

                  <div className="user-section-divider">Subir de plan</div>

                  {upgradeRequested ? (
                    <div className="form-success">
                      <span className="mat-icon">check_circle</span>
                      Registramos tu solicitud para subir a <strong>{planStatus.next_plan?.name}</strong>. Te contactaremos para activar el pago.
                    </div>
                  ) : planStatus.next_plan ? (
                    <>
                      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:12 }}>
                        Te recomendamos <strong>{planStatus.next_plan.name}</strong> — {planStatus.next_plan.max_projects} proyectos por {formatCLP(planStatus.next_plan.price_clp)}.
                      </p>
                      <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
                        onClick={handleUpgrade} disabled={upgrading}>
                        {upgrading
                          ? <><span className="mat-icon spin">refresh</span> Enviando…</>
                          : <>Quiero subir a {planStatus.next_plan.name}</>}
                      </button>
                    </>
                  ) : (
                    <p style={{ fontSize:13, color:'var(--text-muted)' }}>
                      Ya estás en el plan más alto disponible. Si necesitas más proyectos, hablemos de un plan Enterprise a medida.
                    </p>
                  )}

                  {planStatus.plan_id !== 'basic' && !planStatus.cancel_at_period_end && (
                    <>
                      <div className="user-section-divider">Cancelar plan</div>
                      {!confirmCancel ? (
                        <button className="btn btn-ghost" style={{ color:'var(--error)' }}
                          onClick={() => setConfirmCancel(true)}>
                          <span className="mat-icon">cancel</span> Cancelar mi plan
                        </button>
                      ) : (
                        <div className="card" style={{ padding:16, background:'var(--error-bg)', border:'1px solid var(--error)' }}>
                          <p style={{ fontSize:13, marginBottom:12 }}>
                            Tu plan <strong>{planStatus.plan_name}</strong> seguirá activo hasta el final del período actual.
                            Después pasarás automáticamente al plan Básico (1 proyecto). ¿Confirmas?
                          </p>
                          <div style={{ display:'flex', gap:8 }}>
                            <button className="btn btn-danger" onClick={handleConfirmCancel} disabled={cancelling}>
                              {cancelling ? 'Procesando…' : 'Sí, cancelar'}
                            </button>
                            <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
                              No, mantener plan
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── PREFS ── */}
          {tab === 'prefs' && (
            <div className="settings-section">
              <div className="pref-row">
                <div className="pref-info">
                  <div className="pref-label">Compactar tablas</div>
                  <div className="pref-desc">Reduce el padding en filas de tablas</div>
                </div>
                <button
                  className={`pref-toggle ${prefs.compact ? 'on' : ''}`}
                  onClick={() => {
                    const v = !prefs.compact
                    saveUserPrefs({ compact: v })
                    setPrefs(p => ({ ...p, compact: v }))
                    document.documentElement.classList.toggle('compact', v)
                  }}>
                  <span className="pref-toggle-thumb" />
                </button>
              </div>

              <div className="pref-row">
                <div className="pref-info">
                  <div className="pref-label">Sidebar abierto por defecto</div>
                  <div className="pref-desc">Al cargar la app en desktop</div>
                </div>
                <button
                  className={`pref-toggle ${prefs.sidebarOpen !== false ? 'on' : ''}`}
                  onClick={() => {
                    const v = prefs.sidebarOpen === false ? true : false
                    saveUserPrefs({ sidebarOpen: v })
                    setPrefs(p => ({ ...p, sidebarOpen: v }))
                  }}>
                  <span className="pref-toggle-thumb" />
                </button>
              </div>

              <div className="pref-divider" />

              <div className="pref-row">
                <div className="pref-info">
                  <div className="pref-label" style={{ color:'var(--error)' }}>Limpiar preferencias</div>
                  <div className="pref-desc">Restaura tema y ajustes por defecto</div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color:'var(--error)' }}
                  onClick={() => {
                    localStorage.removeItem('alp_user_prefs')
                    localStorage.removeItem('alp_read')
                    setPrefs({})
                    setForm({ splashTitle:'', splashSubtitle:'', splashLogo:'' })
                    applyTheme(THEMES[0])
                  }}>
                  <span className="mat-icon">restart_alt</span>
                </button>
              </div>

              <div className="pref-divider" />
              <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.6 }}>
                <strong>Area Leader Pro</strong> v1.0.0<br/>
                React 18 + Vite + Supabase
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
