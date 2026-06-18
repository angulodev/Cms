import { useEffect, useState } from 'react'
import {
  getReportSummary, getReportProgress,
  getReportActivity, getReportTeamLoad
} from '../lib/supabase'
import { Avatar, Skeleton } from './UI'

// ── Mini bar chart (pure CSS) ──────────────────────
function BarChart({ data, height = 100 }) {
  if (!data?.length) return <EmptyChart />
  const max = Math.max(...data.map(d => Math.max(d.actual, d.estimated)), 1)
  return (
    <div className="bar-chart-report">
      {data.map((d, i) => (
        <div key={i} className="bcr-col">
          <div className="bcr-bars" style={{ height }}>
            <div className="bcr-bar bcr-actual" style={{ height: `${(d.actual / max) * 100}%` }}
              title={`Real: ${d.actual}%`} />
            <div className="bcr-bar bcr-est" style={{ height: `${(d.estimated / max) * 100}%` }}
              title={`Est: ${d.estimated}%`} />
          </div>
          <div className="bcr-label" title={d.name}>{d.name}</div>
        </div>
      ))}
    </div>
  )
}

// ── Donut chart (SVG) ─────────────────────────────
function DonutChart({ segments, size = 120 }) {
  if (!segments?.length || segments.every(s => s.value === 0)) return <EmptyChart />
  const total = segments.reduce((a, s) => a + s.value, 0)
  const r = 40, cx = 60, cy = 60, stroke = 18
  const circ = 2 * Math.PI * r

  // Offset acumulado de cada segmento, calculado sin mutar nada durante el render.
  const offsets = segments.reduce((acc, s) => {
    const prev = acc.length ? acc[acc.length - 1] : 0
    acc.push(prev + s.value / total)
    return acc
  }, [])

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const pct    = s.value / total
          const dash   = pct * circ
          const offset = i === 0 ? 0 : offsets[i - 1]
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ + circ / 4}
              style={{ transition: 'stroke-dasharray .4s ease' }}
            />
          )
        })}
        <text x={cx} y={cy + 5} textAnchor="middle"
          fontSize="18" fontWeight="700" fill="var(--text-primary)">{total}</text>
      </svg>
      <div className="donut-legend">
        {segments.map((s, i) => (
          <div key={i} className="donut-leg-item">
            <span className="donut-leg-dot" style={{ background: s.color }} />
            <span className="donut-leg-label">{s.label}</span>
            <span className="donut-leg-val">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Activity sparkline ────────────────────────────
function ActivityLine({ data }) {
  if (!data?.length) return <EmptyChart msg="Sin actividad en los últimos 14 días" />
  const max  = Math.max(...data.map(d => d.events), 1)
  const W = 280, H = 60, pad = 8
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2)
    const y = H - pad - ((d.events / max) * (H - pad * 2))
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="sparkline-wrap">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".25"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon
          points={`${pad},${H} ${points} ${W - pad},${H}`}
          fill="url(#sg)"
        />
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round"/>
        {data.map((d, i) => {
          const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2)
          const y = H - pad - ((d.events / max) * (H - pad * 2))
          return <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" />
        })}
      </svg>
      <div className="sparkline-labels">
        <span>{data[0]?.day ? new Date(data[0].day).toLocaleDateString('es-CL',{day:'numeric',month:'short'}) : ''}</span>
        <span>{data[data.length-1]?.day ? new Date(data[data.length-1].day).toLocaleDateString('es-CL',{day:'numeric',month:'short'}) : ''}</span>
      </div>
    </div>
  )
}

function EmptyChart({ msg = 'Sin datos suficientes aún' }) {
  return (
    <div className="empty-chart">
      <span className="mat-icon">insert_chart</span>
      <span>{msg}</span>
    </div>
  )
}

// ── Status config ─────────────────────────────────
const STATUS_CFG = {
  backlog:   { label: 'Backlog',        color: '#94a3b8' },
  planning:  { label: 'Planificación',  color: '#3b82f6' },
  active:    { label: 'En desarrollo',  color: '#10b981' },
  'at-risk': { label: 'En riesgo',      color: '#f59e0b' },
  'on-hold': { label: 'En pausa',       color: '#8b5cf6' },
  completed: { label: 'Completado',     color: '#06b6d4' },
}
const TASK_CFG = {
  todo:        { label: 'Pendiente',   color: '#94a3b8' },
  'in-progress':{ label: 'En curso',  color: '#3b82f6' },
  review:      { label: 'En revisión',color: '#f59e0b' },
  blocked:     { label: 'Bloqueado',  color: '#ef4444' },
  completed:   { label: 'Completado', color: '#10b981' },
}

// ── Stat card ─────────────────────────────────────
function Stat({ label, value, sub, color = 'var(--accent)', icon }) {
  return (
    <div className="report-stat">
      <div className="report-stat-icon" style={{ background: color + '20', color }}>
        <span className="mat-icon">{icon}</span>
      </div>
      <div className="report-stat-val" style={{ color }}>{value ?? '—'}</div>
      <div className="report-stat-label">{label}</div>
      {sub && <div className="report-stat-sub">{sub}</div>}
    </div>
  )
}

// ── Deviation bar ────────────────────────────────
function DeviationBar({ actual, estimated, name }) {
  const dev = actual - estimated
  return (
    <div className="dev-row">
      <div className="dev-name" title={name}>{name}</div>
      <div className="dev-bars">
        <div className="dev-track">
          <div className="dev-fill-actual" style={{ width: `${actual}%` }} />
        </div>
        <div className="dev-track" style={{ opacity: .45 }}>
          <div className="dev-fill-est" style={{ width: `${estimated}%` }} />
        </div>
      </div>
      <div className={`dev-badge ${dev > 0 ? 'ahead' : dev < 0 ? 'behind' : 'equal'}`}>
        {dev > 0 ? `+${dev}%` : dev < 0 ? `${dev}%` : '='}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
export default function Reports() {
  const [summary,  setSummary]  = useState(null)
  const [progress, setProgress] = useState([])
  const [activity, setActivity] = useState([])
  const [teamLoad, setTeamLoad] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [period,   setPeriod]   = useState(14)

  const load = () => {
    Promise.resolve()
      .then(() => setLoading(true))
      .then(() => Promise.all([
        getReportSummary(),
        getReportProgress(),
        getReportActivity(period),
        getReportTeamLoad(),
      ]))
      .then(([s, p, a, t]) => {
        setSummary(s)
        setProgress(p || [])
        setActivity(a || [])
        setTeamLoad(t || [])
      }).catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [period]) // eslint-disable-line react-hooks/exhaustive-deps -- load depende de period, redefinirla cada render es intencional

  // Derived data
  const projectStatusSegments = summary?.by_status
    ? summary.by_status.map(s => ({
        label: STATUS_CFG[s.status]?.label || s.status,
        value: parseInt(s.count),
        color: STATUS_CFG[s.status]?.color || '#94a3b8',
      }))
    : []

  const taskStatusSegments = summary?.tasks_by_status
    ? summary.tasks_by_status.map(s => ({
        label: TASK_CFG[s.status]?.label || s.status,
        value: parseInt(s.count),
        color: TASK_CFG[s.status]?.color || '#94a3b8',
      }))
    : []

  const barData = progress.map(p => ({
    name:      p.name.split(' ')[0],
    actual:    p.progress,
    estimated: p.estimated,
  }))

  const completionRate = summary?.total_tasks > 0
    ? Math.round((summary.completed_tasks / summary.total_tasks) * 100) : 0

  const totalActivityEvents = activity.reduce((a, d) => a + d.events, 0)

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes</h1>
          <p className="page-sub">Vista analítica del área · Actualizado ahora</p>
        </div>
        <div className="header-actions">
          <select className="filter-select" value={period} onChange={e => setPeriod(+e.target.value)}>
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
          <button className="btn btn-ghost" onClick={load}>
            <span className="mat-icon">refresh</span>
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* ── 1. KPI strip ── */}
      {loading ? (
        <div className="report-stats-grid"><Skeleton h={90}/><Skeleton h={90}/><Skeleton h={90}/><Skeleton h={90}/></div>
      ) : (
        <div className="report-stats-grid">
          <Stat icon="folder_open"  label="Proyectos totales"   value={summary?.total_projects}   color="var(--accent)"   sub={`${summary?.overdue_projects || 0} vencidos`} />
          <Stat icon="task_alt"     label="Tasa de completitud" value={`${completionRate}%`}       color="var(--success)"  sub={`${summary?.completed_tasks || 0} de ${summary?.total_tasks || 0} tareas`} />
          <Stat icon="warning_amber"label="Tareas bloqueadas"   value={summary?.blocked_tasks}    color="var(--error)"    sub="Requieren atención" />
          <Stat icon="groups"       label="Equipo activo"       value={summary?.total_members}    color="var(--purple)"   sub={`${totalActivityEvents} eventos en ${period}d`} />
        </div>
      )}

      {/* ── 2. Progreso vs Estimación ── */}
      <div className="two-col">
        <div className="card">
          <div className="card-title">Progreso Real vs Estimado</div>
          <div className="chart-legend" style={{marginBottom:10}}>
            <span className="legend-dot blue" /> Real
            <span className="legend-dot gray" style={{marginLeft:12}} /> Estimado
          </div>
          {loading ? <Skeleton h={120}/> : (
            progress.length === 0
              ? <EmptyChart />
              : <>
                  <BarChart data={barData} height={110} />
                  <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:6}}>
                    {progress.map(p => (
                      <DeviationBar key={p.id} name={p.name} actual={p.progress} estimated={p.estimated} />
                    ))}
                  </div>
                </>
          )}
        </div>

        {/* ── 3. Distribución estados ── */}
        <div className="card">
          <div className="card-title">Estado de Proyectos</div>
          {loading ? <Skeleton h={120}/> : (
            <DonutChart segments={projectStatusSegments} size={130} />
          )}
          <div className="card-title" style={{marginTop:16}}>Estado de Tareas</div>
          {loading ? <Skeleton h={80}/> : (
            <DonutChart segments={taskStatusSegments} size={110} />
          )}
        </div>
      </div>

      {/* ── 4. Actividad ── */}
      <div className="card">
        <div className="card-title">Actividad del Equipo — Últimos {period} días</div>
        {loading ? <Skeleton h={80}/> : (
          <>
            <ActivityLine data={[...activity].reverse()} />
            {activity.length > 0 && (
              <div className="activity-summary-row">
                <div className="act-sum-item">
                  <span className="mat-icon" style={{color:'var(--accent)',fontSize:16}}>chat_bubble_outline</span>
                  <span>{activity.reduce((a,d)=>a+d.comments,0)} comentarios</span>
                </div>
                <div className="act-sum-item">
                  <span className="mat-icon" style={{color:'var(--success)',fontSize:16}}>swap_horiz</span>
                  <span>{activity.reduce((a,d)=>a+d.status_changes,0)} cambios de estado</span>
                </div>
                <div className="act-sum-item">
                  <span className="mat-icon" style={{color:'var(--purple)',fontSize:16}}>flag</span>
                  <span>{activity.reduce((a,d)=>a+d.milestones,0)} hitos</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 5. Carga del equipo ── */}
      <div className="card">
        <div className="card-title">Carga del Equipo</div>
        {loading ? <Skeleton h={120}/> : (
          teamLoad.length === 0
            ? <EmptyChart msg="Agrega personas al equipo para ver su carga" />
            : (
              <div className="team-load-list">
                {teamLoad.map(m => {
                  const maxP = Math.max(...teamLoad.map(x => x.projects_count), 1)
                  const pct  = Math.round((m.projects_count / maxP) * 100)
                  return (
                    <div key={m.id} className="team-load-row">
                      <Avatar initials={m.initials} color={m.color} size={32} />
                      <div className="tl-info">
                        <div className="tl-name">{m.name}</div>
                        <div className="tl-role">{m.role}</div>
                      </div>
                      <div className="tl-bars">
                        <div className="tl-track">
                          <div className="tl-fill" style={{ width: `${pct}%`, background: m.color }} />
                        </div>
                        <div className="tl-stats">
                          <span>{m.projects_count} proyecto{m.projects_count !== 1 ? 's' : ''}</span>
                          <span>{m.tasks_count} tarea{m.tasks_count !== 1 ? 's' : ''}</span>
                          {m.blocked_tasks > 0 && (
                            <span className="tl-blocked">
                              <span className="mat-icon" style={{fontSize:12}}>block</span>
                              {m.blocked_tasks} bloqueada{m.blocked_tasks !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
        )}
      </div>

    </div>
  )
}
