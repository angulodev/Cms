import { useEffect, useState } from 'react'
import { getDashboardKPIs, getRisks, getActivity, getProjects, getUserPrefs } from '../lib/supabase'
import { KPICard, Skeleton } from './UI'

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60) return 'Hace un momento'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
  return `Hace ${Math.floor(diff / 86400)}d`
}

const ACTIVITY_ICONS = {
  comment: { icon: 'chat_bubble_outline', cls: 'act-comment' },
  status:  { icon: 'swap_horiz',          cls: 'act-status'  },
  milestone: { icon: 'flag',              cls: 'act-milestone'},
  assignment: { icon: 'person_add',       cls: 'act-assign'  },
}


// ── SVG Bar Chart — works on all screen sizes ──────
function BarChartSVG({ data }) {
  const H = 130, PAD_T = 8, PAD_B = 28, PAD_L = 4, PAD_R = 4
  const chartH = H - PAD_T - PAD_B
  const colW = 100 / data.length
  return (
    <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid lines */}
      {[25,50,75,100].map(v => (
        <line key={v}
          x1={PAD_L} y1={PAD_T + chartH * (1 - v/100)}
          x2={100 - PAD_R} y2={PAD_T + chartH * (1 - v/100)}
          stroke="var(--border)" strokeWidth="0.4" />
      ))}
      {data.map((d, i) => {
        const x = PAD_L + i * colW + colW * 0.1
        const bw = colW * 0.35
        const actualH = (d.actual / 100) * chartH
        const estH    = (d.est    / 100) * chartH
        const actualY = PAD_T + chartH - actualH
        const estY    = PAD_T + chartH - estH
        return (
          <g key={i}>
            {/* Estimated bar */}
            <rect x={x + bw + colW*0.04} y={estY} width={bw} height={estH}
              fill="var(--border)" rx="0.5" opacity="0.7" />
            {/* Actual bar */}
            <rect x={x} y={actualY} width={bw} height={actualH}
              fill="var(--accent)" rx="0.5" />
            {/* Label */}
            <text x={x + bw} y={H - 6} textAnchor="middle"
              fontSize="3.5" fill="var(--text-muted)"
              style={{ fontFamily: 'Inter, sans-serif' }}>
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Dashboard({ onNavigate, onExport }) {
  const prefs = getUserPrefs()
  const [showSplash, setShowSplash] = useState(() => {
    const seen = sessionStorage.getItem('alp_splash_seen')
    return !seen
  })
  const [kpi, setKpi] = useState(null)
  const [risks, setRisks] = useState([])
  const [activity, setActivity] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getDashboardKPIs(), getRisks(), getActivity(5), getProjects()])
      .then(([k, r, a, p]) => { setKpi(k); setRisks(r); setActivity(a); setProjects(p) })
      .finally(() => setLoading(false))
  }, [])

  const chartData = projects.map(p => ({ label: p.name.split(' ')[0], actual: p.progress, est: p.estimated }))

  if (showSplash) {
    return (
      <div className="splash-screen" onClick={() => {
        sessionStorage.setItem('alp_splash_seen', '1')
        setShowSplash(false)
      }}>
        <div className="splash-inner">
          {prefs.splashLogo
            ? <img src={prefs.splashLogo} alt="Logo" className="splash-logo-img"/>
            : (
              <div className="splash-brand-icon">
                <span className="mat-icon">hub</span>
              </div>
            )
          }
          <div className="splash-title">{prefs.splashTitle || 'Area Leader Pro'}</div>
          <div className="splash-subtitle">{prefs.splashSubtitle || 'Plataforma de gestión de proyectos'}</div>
          <div className="splash-user">
            <div className="avatar-circle" style={{width:32,height:32,background:prefs.color||'#1e293b',fontSize:12}}>
              {(prefs.name||'?').trim().split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')}
            </div>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:'white'}}>{prefs.name || 'Bienvenido'}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,.5)'}}>{prefs.role || 'Area Leader'}</div>
            </div>
          </div>
          <div className="splash-cta">Toca para continuar</div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard de Liderazgo</h1>
          <p className="page-sub">Vista ejecutiva · {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={onExport}><span className="mat-icon">picture_as_pdf</span><span>Exportar</span></button>
          <button className="btn btn-primary" onClick={() => onNavigate('projects')}>
            <span className="mat-icon">add</span><span>Nuevo proyecto</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {loading ? <>
          <Skeleton h={96} /><Skeleton h={96} /><Skeleton h={96} /><Skeleton h={96} />
        </> : <>
          <KPICard label="Total proyectos" value={kpi?.totalProjects} sub="Cartera activa" colorClass="blue" icon="folder_open" onClick={() => onNavigate('projects')} hint="Ver proyectos" />
          <KPICard label="Riesgos activos" value={kpi?.activeRisks} sub="Requieren atención" colorClass="amber" icon="warning_amber" onClick={() => onNavigate('projects')} hint="Ver proyectos" />
          <KPICard label="Capacidad equipo" value={`${kpi?.teamSize ? 84 : '—'}%`} sub={`${kpi?.teamSize} personas activas`} colorClass="green" icon="groups" onClick={() => onNavigate('team')} hint="Ver equipo" />
          <KPICard label="Progreso general" value={`${kpi?.avgProgress}%`} sub="+3.2% vs semana pasada" colorClass="purple" icon="trending_up" onClick={() => onNavigate('workload')} hint="Ver carga" />
        </>}
      </div>

      {/* Chart + Risks */}
      <div className="two-col">
        <div className="card">
          <div className="card-title">Progreso vs Estimación</div>
          <div className="chart-legend">
            <span className="legend-dot blue" /> Real
            <span className="legend-dot gray" style={{ marginLeft: 12 }} /> Estimado
          </div>
          {loading ? <Skeleton h={140} /> : chartData.length === 0 ? (
            <div className="empty-chart"><span className="mat-icon">bar_chart</span><span>Sin proyectos aún</span></div>
          ) : (
            <BarChartSVG data={chartData} />
          )}
        </div>

        <div className="card">
          <div className="card-title">Riesgos Críticos</div>
          {loading ? <><Skeleton h={56} /><Skeleton h={56} style={{marginTop:8}} /></> :
            <div className="risk-list">
              {risks.map(r => (
                <div key={r.id} className={`risk-item ${r.severity}`}>
                  <div className="risk-info">
                    <div className="risk-project">{r.project?.name || '—'}</div>
                    <div className="risk-desc">{r.description}</div>
                  </div>
                  <div className="risk-tags">
                    {r.time_delta   && <span className={`badge badge-${r.severity}`}>{r.time_delta}</span>}
                    {r.budget_delta && <span className={`badge badge-${r.severity}`}>{r.budget_delta}</span>}
                  </div>
                </div>
              ))}
              {risks.length === 0 && <p className="empty-sub">Sin riesgos activos</p>}
            </div>
          }
        </div>
      </div>

      {/* Activity */}
      <div className="card">
        <div className="card-title">Actividad Reciente</div>
        {loading ? <Skeleton h={120} /> :
          <div className="activity-list">
            {activity.map(a => {
              const { icon, cls } = ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.comment
              return (
                <div key={a.id} className="activity-item">
                  <div className={`activity-icon ${cls}`}>
                    <span className="mat-icon">{icon}</span>
                  </div>
                  <div className="activity-body">
                    <div className="activity-text">
                      {a.actor && <strong>{a.actor.name} </strong>}
                      {a.content}
                      {a.project && <> · <em>{a.project.name}</em></>}
                    </div>
                    <div className="activity-time">{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        }
      </div>
    </div>
  )
}
