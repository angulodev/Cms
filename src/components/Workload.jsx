import { useEffect, useState, useCallback } from 'react'
import { getWorkloadAuto, getTeamMembers } from '../lib/supabase'
import { Skeleton } from './UI'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']

// Get week start (Monday) from a Date
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function weekStartToISO(date) {
  return date.toISOString().split('T')[0]
}

function addWeeks(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n * 7)
  return d
}

function weekLabel(date) {
  const end = new Date(date); end.setDate(end.getDate() + 4)
  const fmt = d => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  // week number
  const start = new Date(date.getFullYear(), 0, 1)
  const wn = Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7)
  return { label: `Semana ${wn}`, range: `${fmt(date)} – ${fmt(end)} ${end.getFullYear()}` }
}

function dayDates(weekStart) {
  return [0,1,2,3,4].map(i => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i)
    return d.toLocaleDateString('es-CL', { day: 'numeric' })
  })
}

function heatClass(hours) {
  if (!hours) return 'heat-empty'
  if (hours <= 4) return 'heat-low'
  if (hours <= 7) return 'heat-medium'
  if (hours <= 8) return 'heat-high'
  return 'heat-over'
}
function utilClass(pct) {
  if (pct <= 80) return 'ok'
  if (pct <= 100) return 'warn'
  return 'crit'
}

export default function Workload() {
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()))
  const [members,  setMembers]  = useState([])
  const [workload, setWorkload] = useState([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback((weekDate) => {
    const iso = weekStartToISO(weekDate)
    Promise.resolve()
      .then(() => setLoading(true))
      .then(() => Promise.all([getTeamMembers(), getWorkloadAuto(iso)]))
      .then(([m, w]) => { setMembers(m); setWorkload(w) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(currentWeek) }, [currentWeek, load])

  function prevWeek() { setCurrentWeek(w => addWeeks(w, -1)) }
  function nextWeek() { setCurrentWeek(w => addWeeks(w, +1)) }

  // Build heat map: member_id → day_of_week → { hours, label }
  const heatMap = {}
  workload.forEach(w => {
    if (!heatMap[w.member_id]) heatMap[w.member_id] = {}
    const ex = heatMap[w.member_id][w.day_of_week]
    if (ex) { ex.hours += w.hours; ex.label = ex.label + '/' + w.task_label }
    else heatMap[w.member_id][w.day_of_week] = { hours: w.hours, label: w.task_label }
  })

  // Utilization per member
  const utilization = {}
  members.forEach(m => {
    const total = [1,2,3,4,5].reduce((s,d) => s + (heatMap[m.id]?.[d]?.hours || 0), 0)
    utilization[m.id] = Math.round((total / 40) * 100)
  })

  // Distribution by project — fix: group correctly
  const projectHours = {}
  const projectNames = {}
  workload.forEach(w => {
    if (!w.project_id) return
    projectHours[w.project_id] = (projectHours[w.project_id] || 0) + w.hours
    if (w.project_name) projectNames[w.project_id] = w.project_name
  })
  const totalHrs = Object.values(projectHours).reduce((a,b) => a+b, 0)
  const projectDist = Object.entries(projectHours)
    .sort((a,b) => b[1]-a[1])
    .map(([id, hrs]) => ({
      id,
      name: projectNames[id] || 'Proyecto',
      hrs,
      pct: totalHrs > 0 ? Math.round((hrs / totalHrs) * 100) : 0,
    }))

  const overloaded = members.filter(m => utilization[m.id] > 100)
  const { label: wLabel, range: wRange } = weekLabel(currentWeek)
  const dayNums = dayDates(currentWeek)
  const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4']

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestión de Carga de Trabajo</h1>
          <p className="page-sub">{wLabel} · {wRange} · {members.length} personas activas · estimado desde tareas asignadas</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={prevWeek}>
            <span className="mat-icon">chevron_left</span>
          </button>
          <span className="week-label">{wLabel}</span>
          <button className="btn btn-ghost" onClick={nextWeek}>
            <span className="mat-icon">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Overload alerts */}
      {overloaded.length > 0 && (
        <div className="alerts-row">
          {overloaded.map(m => (
            <div key={m.id} className="alert alert-error">
              <span className="mat-icon">warning</span>
              <span><strong>{m.name}</strong> sobrecargado al {utilization[m.id]}% esta semana</span>
            </div>
          ))}
        </div>
      )}

      {/* Heat map */}
      <div className="card">
        <div className="card-title">Mapa de Calor Semanal</div>
        {loading ? <Skeleton h={200} /> : (
          <div className="heat-grid">
            <div className="heat-row heat-header-row">
              <div className="heat-person-col" />
              {DAYS.map((d, i) => (
                <div key={d} className="heat-day-header">{d} {dayNums[i]}</div>
              ))}
            </div>
            {members.map(m => (
              <div key={m.id} className="heat-row">
                <div className="heat-person-col">
                  <div className="avatar-circle" style={{ width:24, height:24, background:m.color, fontSize:9, flexShrink:0 }}>
                    {m.initials}
                  </div>
                  <span className="heat-name">{m.name.split(' ')[0]}</span>
                </div>
                {[1,2,3,4,5].map(d => {
                  const cell = heatMap[m.id]?.[d]
                  return (
                    <div key={d} className={`heat-cell ${heatClass(cell?.hours)}`}>
                      {cell ? <>
                        <span className="heat-hours">{cell.hours}h</span>
                        <span className="heat-task">{cell.label?.split('/')[0]?.split(' ')[0]}</span>
                      </> : <span className="heat-empty-dot">—</span>}
                    </div>
                  )
                })}
              </div>
            ))}
            {members.length === 0 && !loading && (
              <div style={{ padding:'24px', textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>
                Sin personas activas en el equipo
              </div>
            )}
          </div>
        )}
        <div className="heat-legend">
          <span className="hl hl-low">Bajo (&lt;5h)</span>
          <span className="hl hl-medium">Normal (5–7h)</span>
          <span className="hl hl-high">Alto (8h)</span>
          <span className="hl hl-over">Sobrecarga (&gt;8h)</span>
        </div>
      </div>

      {/* Utilization + Distribution */}
      <div className="two-col">

        {/* Utilization */}
        <div className="card">
          <div className="card-title">Utilización por persona</div>
          {loading ? <Skeleton h={140} /> : members.length === 0 ? (
            <p className="empty-sub">Sin datos esta semana.</p>
          ) : (
            <div className="util-list">
              {members.map(m => {
                const pct = utilization[m.id] || 0
                const cls = utilClass(pct)
                return (
                  <div key={m.id} className="util-row">
                    <div className="avatar-circle" style={{ width:22, height:22, background:m.color, fontSize:9, flexShrink:0 }}>{m.initials}</div>
                    <div className="util-name">{m.name.split(' ')[0]}</div>
                    <div className="util-track">
                      <div className={`util-fill util-${cls}`} style={{ width:`${Math.min(pct,100)}%` }} />
                    </div>
                    <div className={`util-pct util-pct-${cls}`}>{pct}%</div>
                    {pct > 100 && <span className="overload-badge">OVL</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Distribution by project */}
        <div className="card">
          <div className="card-title">Distribución por proyecto</div>
          {loading ? <Skeleton h={140} /> : projectDist.length === 0 ? (
            <p className="empty-sub" style={{ marginTop:8 }}>
              Sin horas registradas para esta semana.
            </p>
          ) : (
            <>
              <p style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12 }}>
                {totalHrs}h totales · {projectDist.length} proyecto{projectDist.length!==1?'s':''}
              </p>
              <div className="util-list">
                {projectDist.map((p, i) => (
                  <div key={p.id} className="util-row">
                    <div className="util-name" style={{ color:'var(--text-primary)', fontWeight:500 }}>
                      {p.name.split(' ')[0]}
                    </div>
                    <div className="util-track">
                      <div className="util-fill" style={{ width:`${p.pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                    <div className="util-pct" style={{ color:'var(--text-secondary)' }}>{p.pct}%</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', width:28, flexShrink:0, textAlign:'right' }}>{p.hrs}h</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="btn btn-primary" style={{ width:'100%', marginTop:16, justifyContent:'center' }}
            onClick={() => alert('Funcionalidad de redistribución automática próximamente.')}>
            <span className="mat-icon">swap_horiz</span> Redistribuir carga
          </button>
        </div>
      </div>
    </div>
  )
}
