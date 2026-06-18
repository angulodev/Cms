import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [tab,      setTab]      = useState('login') // 'login' | 'register'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess('')
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } }
        })
        if (error) throw error
        setSuccess('Cuenta creada. Revisa tu email para confirmar.')
      }
    } catch(e) {
      setError(
        e.message === 'Invalid login credentials'     ? 'Email o contraseña incorrectos.' :
        e.message === 'User already registered'       ? 'Este email ya tiene una cuenta.' :
        e.message === 'Password should be at least 6 characters' ? 'La contraseña debe tener al menos 6 caracteres.' :
        e.message
      )
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/Cms/` }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  function fillDemo() { setEmail('admin@admin.cl'); setPassword('admin1234'); setTab('login') }

  return (
    <div className="lp-shell">
      {/* Left panel — branding */}
      <div className="lp-left">
        <div className="lp-left-inner">
          <div className="lp-brand">
            <div className="lp-brand-icon"><span className="mat-icon">hub</span></div>
            <div>
              <div className="lp-brand-name">Area Leader Pro</div>
              <div className="lp-brand-tagline">Gestión de proyectos para líderes</div>
            </div>
          </div>

          <div className="lp-hero-text">
            <h1>Tu portafolio,<br/>bajo control.</h1>
            <p>Gestiona proyectos, equipo y riesgos en una sola plataforma. Genera reportes ejecutivos en segundos.</p>
          </div>

          <div className="lp-features">
            {[
              { icon: 'dashboard',      text: 'Dashboard ejecutivo en tiempo real' },
              { icon: 'warning_amber',  text: 'Gestión de riesgos con ciclo de vida' },
              { icon: 'picture_as_pdf', text: 'Reportes PDF con marca del cliente' },
              { icon: 'lock',           text: 'Datos completamente aislados por usuario' },
            ].map(f => (
              <div key={f.icon} className="lp-feature-item">
                <span className="mat-icon lp-feat-icon">{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>

          <div className="lp-plans-preview">
            <div className="lp-plan-tag">Gratis · $5.990 · $10.990 · $29.990 · $45.990 · $89.990</div>
            <div className="lp-plan-sub">6 planes disponibles — empieza gratis</div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="lp-right">
        <div className="lp-form-card">

          {/* Tabs */}
          <div className="lp-tabs">
            <button className={`lp-tab ${tab==='login'?'active':''}`} onClick={()=>{setTab('login');setError('');setSuccess('')}}>
              Iniciar sesión
            </button>
            <button className={`lp-tab ${tab==='register'?'active':''}`} onClick={()=>{setTab('register');setError('');setSuccess('')}}>
              Crear cuenta
            </button>
          </div>

          <div className="lp-form-body">
            {/* Google */}
            <button className="lp-google-btn" onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.3l-6.5 5C9.5 40.2 16.3 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.7 5.8l6.2 5.2C40.7 35.3 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
              </svg>
              Continuar con Google
            </button>

            <div className="lp-divider"><span>o con email</span></div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
              {tab === 'register' && (
                <div className="lp-field">
                  <label className="lp-label">Nombre completo</label>
                  <div className="lp-input-wrap">
                    <span className="mat-icon lp-input-icon">person</span>
                    <input className="lp-input" type="text" value={name}
                      onChange={e=>setName(e.target.value)}
                      placeholder="Francisco Angulo" required autoFocus />
                  </div>
                </div>
              )}
              <div className="lp-field">
                <label className="lp-label">Email</label>
                <div className="lp-input-wrap">
                  <span className="mat-icon lp-input-icon">mail</span>
                  <input className="lp-input" type="email" value={email}
                    onChange={e=>setEmail(e.target.value)}
                    placeholder="tu@empresa.com" required autoFocus={tab==='login'} />
                </div>
              </div>
              <div className="lp-field">
                <label className="lp-label">Contraseña</label>
                <div className="lp-input-wrap">
                  <span className="mat-icon lp-input-icon">lock</span>
                  <input className="lp-input" type="password" value={password}
                    onChange={e=>setPassword(e.target.value)}
                    placeholder="••••••••" required minLength={6} />
                </div>
              </div>

              {error   && <div className="lp-msg lp-msg-err"><span className="mat-icon" style={{fontSize:16}}>error_outline</span>{error}</div>}
              {success && <div className="lp-msg lp-msg-ok"><span className="mat-icon" style={{fontSize:16}}>check_circle</span>{success}</div>}

              <button className="lp-submit" type="submit" disabled={loading}>
                {loading
                  ? <><span className="mat-icon spin">refresh</span> Procesando…</>
                  : tab === 'login' ? <><span className="mat-icon">login</span> Iniciar sesión</> : <><span className="mat-icon">person_add</span> Crear cuenta</>}
              </button>
            </form>

            {/* Demo */}
            <div className="lp-demo-bar">
              <span className="mat-icon" style={{fontSize:14,color:'var(--accent)'}}>science</span>
              <span>Demo disponible:</span>
              <button onClick={fillDemo}>admin@admin.cl</button>
              <span style={{color:'var(--text-muted)'}}>/</span>
              <button onClick={fillDemo}>admin1234</button>
            </div>
          </div>

          <div className="lp-form-footer">
            <a href="../../marketing/index.html" style={{color:'var(--accent)',fontSize:12,textDecoration:'none'}}>
              <span className="mat-icon" style={{fontSize:14}}>arrow_back</span> Ver planes y precios
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
