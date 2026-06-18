import { useEffect, useState } from 'react'
import { getProjects, getTasksByProject, getRisksByProject, getProjectMembers } from '../lib/supabase'
import { Skeleton } from './UI'
import { getClientStyles, saveClientStyle, deleteClientStyle, generateStyleId, DEFAULT_STYLE } from '../lib/clientStyles'

// ── Config ────────────────────────────────────────
const STATUS_CFG = {
  backlog:   { label: 'Backlog',       color: '#94a3b8', emoji: '⚪', health: 0 },
  planning:  { label: 'Planificación', color: '#3b82f6', emoji: '🔵', health: 60 },
  active:    { label: 'En desarrollo', color: '#10b981', emoji: '🟢', health: 80 },
  'at-risk': { label: 'En riesgo',     color: '#f59e0b', emoji: '🟡', health: 40 },
  'on-hold': { label: 'En pausa',      color: '#8b5cf6', emoji: '🟣', health: 30 },
  completed: { label: 'Completado',    color: '#06b6d4', emoji: '✅', health: 100 },
}
const SEV = {
  high:   { label: 'Alto',  color: '#ef4444', bg: '#fee2e2' },
  medium: { label: 'Medio', color: '#f59e0b', bg: '#fef3c7' },
  low:    { label: 'Bajo',  color: '#10b981', bg: '#d1fae5' },
}
const TASK_S = {
  todo:          { label: 'Pendiente',   color: '#94a3b8' },
  'in-progress': { label: 'En curso',    color: '#3b82f6' },
  review:        { label: 'Revisión',    color: '#f59e0b' },
  blocked:       { label: 'Bloqueado',   color: '#ef4444' },
  completed:     { label: 'Completado',  color: '#10b981' },
}

const fmt     = iso => iso ? new Date(iso).toLocaleDateString('es-CL', { day:'numeric', month:'long',  year:'numeric' }) : '—'
const fmtShort= iso => iso ? new Date(iso).toLocaleDateString('es-CL', { day:'numeric', month:'short', year:'numeric' }) : '—'
const now     = () => new Date().toISOString()

// ── Portfolio health score ────────────────────────
function portfolioHealth(projects) {
  if (!projects.length) return 0
  // Weighted: 60% real progress, 40% status factor
  const statusFactor = { backlog: 0, planning: 30, active: 70, 'at-risk': 40, 'on-hold': 20, completed: 100 }
  const score = projects.reduce((a, p) => {
    const prog   = p.progress || 0
    const status = statusFactor[p.status] ?? 50
    return a + (prog * 0.6 + status * 0.4)
  }, 0) / projects.length
  return Math.round(score)
}
function healthLabel(score) {
  if (score >= 70) return { label: 'Saludable',   color: '#10b981', bg: '#d1fae5' }
  if (score >= 40) return { label: 'Moderado',    color: '#f59e0b', bg: '#fef3c7' }
  return               { label: 'En atención',  color: '#ef4444', bg: '#fee2e2' }
}

// ── Upcoming milestones (tasks due in next 30 days) ──
function upcomingMilestones(detailData, projects) {
  const horizon = new Date(); horizon.setDate(horizon.getDate() + 30)
  const today   = new Date()
  const items = []
  projects.forEach(p => {
    const tasks = detailData[p.id]?.tasks || []
    tasks.forEach(t => {
      if (t.due_date && t.status !== 'completed') {
        const d = new Date(t.due_date)
        if (d >= today && d <= horizon) items.push({ ...t, projectName: p.name })
      }
    })
  })
  return items.sort((a,b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 10)
}

// ── Planner ejecutivo (Gantt + cronología) para el detalle de proyecto ──
function parsePlannerDate(d) {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  return isNaN(dt) ? null : dt
}
function addPlannerDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }

function buildPlannerHTML(project, tasks) {
  const tasksWithDates = tasks.filter(t => t.start_date || t.due_date)
  if (!project.start_date && !project.due_date && tasksWithDates.length === 0) return ''

  const allStarts = [project.start_date, ...tasksWithDates.map(t => t.start_date || t.due_date)]
    .map(parsePlannerDate).filter(Boolean)
  const allEnds = [project.due_date, ...tasksWithDates.map(t => t.due_date || t.start_date)]
    .map(parsePlannerDate).filter(Boolean)
  if (!allStarts.length || !allEnds.length) return ''

  let rangeStart = new Date(Math.min(...allStarts))
  let rangeEnd   = new Date(Math.max(...allEnds))
  if (rangeEnd <= rangeStart) rangeEnd = addPlannerDays(rangeStart, 7)
  rangeStart = addPlannerDays(rangeStart, -2)
  rangeEnd   = addPlannerDays(rangeEnd, 2)
  const totalMs = rangeEnd - rangeStart
  const pct = d => Math.max(0, Math.min(100, ((d - rangeStart) / totalMs) * 100))

  // Marcas mensuales (suficiente detalle para una página impresa)
  const ticks = []
  let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  while (cur <= rangeEnd) {
    ticks.push(new Date(cur))
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const groups = {}
  for (const t of tasksWithDates) {
    const key = t.group_name?.trim() || 'Sin fase'
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }

  const ganttRows = Object.entries(groups).map(([group, items]) => `
    <div class="gantt-phase">${group}</div>
    ${items.map(t => {
      const start = parsePlannerDate(t.start_date || t.due_date)
      const end   = parsePlannerDate(t.due_date || t.start_date)
      const left  = pct(start)
      const width = Math.max(pct(end) - left, 1)
      const tc = TASK_S[t.status] || TASK_S.todo
      return `
        <div class="gantt-row">
          <div class="gantt-label">${t.title}</div>
          <div class="gantt-track">
            <div class="gantt-bar" style="left:${left}%;width:${width}%;background:${tc.color}"></div>
          </div>
        </div>`
    }).join('')}
  `).join('')

  const ganttBlock = `
    <div class="gantt-wrap">
      <div class="gantt-row gantt-project-row">
        <div class="gantt-label"><strong>Proyecto</strong></div>
        <div class="gantt-track">
          ${project.start_date && project.due_date ? `
            <div class="gantt-bar gantt-bar-project" style="left:${pct(parsePlannerDate(project.start_date))}%;width:${Math.max(pct(parsePlannerDate(project.due_date))-pct(parsePlannerDate(project.start_date)),1)}%"></div>
          ` : ''}
        </div>
      </div>
      <div class="gantt-row gantt-grid-row">
        <div class="gantt-label"></div>
        <div class="gantt-track gantt-track-grid">
          ${ticks.map(m => `<div class="gantt-tick" style="left:${pct(m)}%">${m.toLocaleDateString('es-CL',{month:'short',year:'2-digit'})}</div>`).join('')}
        </div>
      </div>
      ${ganttRows}
    </div>
  `

  // Cronología: todos los hitos ordenados por fecha
  const events = []
  if (project.start_date) events.push({ date: parsePlannerDate(project.start_date), label: 'Inicio del proyecto', kind: 'project' })
  for (const t of tasksWithDates) {
    if (t.start_date) events.push({ date: parsePlannerDate(t.start_date), label: `Inicio: ${t.title}`, kind: 'task', color: (TASK_S[t.status]||TASK_S.todo).color })
    if (t.due_date)   events.push({ date: parsePlannerDate(t.due_date),   label: `Entrega: ${t.title}`, kind: 'task', color: (TASK_S[t.status]||TASK_S.todo).color })
  }
  if (project.due_date) events.push({ date: parsePlannerDate(project.due_date), label: 'Entrega del proyecto', kind: 'project' })
  events.sort((a, b) => a.date - b.date)

  const timelineBlock = events.length ? `
    <h3 style="margin-top:18px">Cronología</h3>
    <div class="exec-timeline">
      ${events.map(e => `
        <div class="exec-timeline-item">
          <div class="exec-timeline-dot" style="background:${e.kind==='project'?'#1e293b':(e.color||'#3b82f6')}"></div>
          <div class="exec-timeline-date">${fmtShort(e.date.toISOString())}</div>
          <div class="exec-timeline-label">${e.label}</div>
        </div>
      `).join('')}
    </div>
  ` : ''

  return `
    <h3 style="margin-top:18px">Línea de Tiempo</h3>
    ${ganttBlock}
    ${timelineBlock}
  `
}

// ══════════════════════════════════════════════════
// HTML REPORT BUILDER
// ══════════════════════════════════════════════════
function buildHTML({ projects, detailData, reportType, style, generatedAt }) {
  const sc     = s => STATUS_CFG[s] || STATUS_CFG.planning
  const health = portfolioHealth(projects)
  const hl     = healthLabel(health)
  const milestones = style.showMilestones ? upcomingMilestones(detailData, projects) : []
  const allRisks   = style.showRiskSummary ? projects.flatMap(p =>
    (detailData[p.id]?.risks || []).map(r => ({ ...r, projectName: p.name }))
  ).sort((a,b) => ['high','medium','low'].indexOf(a.severity) - ['high','medium','low'].indexOf(b.severity)) : []

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'${style.fontFamily}','Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;line-height:1.5;background:#fff}
    h1{font-size:24px;font-weight:800;letter-spacing:-.5px}
    h2{font-size:15px;font-weight:700;color:#1e293b;margin:22px 0 10px;padding-bottom:5px;border-bottom:2px solid ${style.accentColor}20}
    h3{font-size:11px;font-weight:700;color:${style.secondaryColor};margin:10px 0 6px;text-transform:uppercase;letter-spacing:.6px;border-top:1px solid #f1f5f9;padding-top:10px}
    .page{padding:28px 32px;max-width:900px;margin:0 auto}
    .sub{color:#64748b;font-size:10px}
    .center{text-align:center}
    .overdue{color:#ef4444;font-weight:700}
    .empty-note{color:#94a3b8;font-style:italic;font-size:10px;padding:6px 0}
    /* Cover */
    .cover{background:${style.primaryColor};color:white;padding:60px 40px;min-height:260px;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
    .cover-logo{font-size:36px;font-weight:900;letter-spacing:-1px;opacity:.25;margin-bottom:8px}
    .cover-client{font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:.6;margin-bottom:12px}
    .cover-title{font-size:32px;font-weight:800;line-height:1.2;margin-bottom:8px}
    .cover-subtitle{font-size:14px;opacity:.7}
    .cover-meta{display:flex;gap:32px;margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,.2)}
    .cover-meta-item label{font-size:9px;text-transform:uppercase;letter-spacing:1px;opacity:.5;display:block}
    .cover-meta-item span{font-size:14px;font-weight:700}
    /* Health score */
    .health-block{display:flex;align-items:center;gap:20px;background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:16px;border:1px solid #e2e8f0}
    .health-score{font-size:40px;font-weight:800;letter-spacing:-2px}
    .health-bar-wrap{flex:1;height:10px;background:#e2e8f0;border-radius:5px;overflow:hidden}
    .health-bar-fill{height:100%;border-radius:5px}
    /* Summary table */
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px}
    thead th{background:${style.primaryColor};color:white;padding:8px 9px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
    tbody td{padding:6px 9px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
    tbody tr:nth-child(even) td{background:#f8fafc}
    /* KPIs */
    .kpi-row{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}
    .kpi-box{flex:1;min-width:70px;border:1px solid #e2e8f0;border-radius:8px;padding:12px 10px;text-align:center;background:#f8fafc;border-top:3px solid ${style.accentColor}}
    .kpi-val{font-size:22px;font-weight:800;letter-spacing:-1px;color:#1e293b}
    .kpi-lbl{font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:.4px}
    /* Badge */
    .badge{display:inline-block;padding:3px 8px;border-radius:99px;font-size:10px;font-weight:700;white-space:nowrap}
    .badge.lg{padding:5px 12px;font-size:12px}
    .badge.sm{padding:2px 6px;font-size:9px}
    /* Progress */
    .progress-cell{display:flex;align-items:center;gap:7px}
    .pb-wrap{flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden}
    .pb-wrap.big{height:9px;border-radius:5px}
    .pb-fill{height:100%;border-radius:3px}
    .progress-section{margin:8px 0;background:#f8fafc;padding:10px 14px;border-radius:8px}
    .progress-row{display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px}
    /* Project detail */
    .proj-header{padding:12px 16px;border-radius:10px;margin-bottom:10px;border-left:5px solid ${style.accentColor};background:#f8fafc}
    .proj-header-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
    .proj-meta-row{display:flex;gap:18px;font-size:11px;color:#64748b;flex-wrap:wrap;margin-top:6px}
    .description{margin-top:10px;font-size:11px;color:#475569;line-height:1.7;padding:10px 12px;background:white;border-radius:6px;border:1px solid #e2e8f0}
    /* Team pills */
    .team-pills{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}
    .team-pill{display:flex;align-items:center;gap:5px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:99px;padding:3px 10px;font-size:10px}
    .av-dot{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:white;font-size:8px;font-weight:700;flex-shrink:0}
    /* Semaforo */
    .semaforo{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle;margin-right:4px}
    /* Risk summary */
    .risk-row{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:6px;margin-bottom:5px;border-left:3px solid transparent}
    .risk-row.high{background:#fff5f5;border-left-color:#ef4444}
    .risk-row.medium{background:#fffbeb;border-left-color:#f59e0b}
    .risk-row.low{background:#f0fdf4;border-left-color:#10b981}
    /* Milestones */
    .milestone-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid #f1f5f9}
    .milestone-date{font-weight:700;color:${style.accentColor};min-width:80px;font-size:11px}
    /* Section */
    .section{margin-bottom:16px}
    .page-break{page-break-before:always;padding-top:0}
    /* Project separator banner */
    .proj-banner{
      background:${style.primaryColor};
      color:white;
      padding:14px 20px;
      margin:-1px 0 0 0;
      display:flex;
      align-items:center;
      justify-content:space-between;
      page-break-before:always;
    }
    .proj-banner-num{font-size:10px;opacity:.5;text-transform:uppercase;letter-spacing:1px;font-weight:600}
    .proj-banner-title{font-size:18px;font-weight:800;letter-spacing:-.3px;flex:1;margin:0 16px}
    .proj-banner-status{font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;white-space:nowrap}
    /* Gantt / planner ejecutivo */
    .gantt-wrap{margin-bottom:14px}
    .gantt-row{display:flex;align-items:center;gap:8px;min-height:20px;margin-bottom:2px}
    .gantt-label{width:130px;flex-shrink:0;font-size:9px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .gantt-track{position:relative;flex:1;height:12px;background:#f1f5f9;border-radius:3px}
    .gantt-track-grid{background:none;height:14px}
    .gantt-bar{position:absolute;top:1px;height:10px;border-radius:3px;background:${style.accentColor};min-width:4px}
    .gantt-bar-project{background:${style.primaryColor};height:6px;top:3px;opacity:.85}
    .gantt-grid-row{margin-bottom:6px}
    .gantt-tick{position:absolute;top:0;font-size:8px;color:#94a3b8;border-left:1px dashed #e2e8f0;padding-left:3px;white-space:nowrap}
    .gantt-phase{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:8px 0 3px 134px}
    /* Cronología ejecutiva */
    .exec-timeline{margin-top:6px}
    .exec-timeline-item{display:flex;align-items:baseline;gap:8px;padding:3px 0;border-bottom:1px solid #f8fafc;font-size:10px}
    .exec-timeline-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .exec-timeline-date{font-weight:700;color:#475569;min-width:74px;flex-shrink:0}
    .exec-timeline-label{color:#1e293b}
    /* Footer */
    .report-footer{margin-top:32px;padding-top:12px;border-top:2px solid ${style.accentColor}20;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
    @media print{
      body{font-size:10px}
      .page-break{page-break-before:always}
      .no-print{display:none!important}
      thead th,.badge,.pb-fill,.health-bar-fill,.cover,.semaforo,.kpi-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
  `

  // ── Cover page ──
  const cover = style.showCoverPage ? `
    <div class="cover">
      <div>
        <div class="cover-logo">${style.logoText}</div>
        <div class="cover-client">${style.clientName}</div>
        <div class="cover-title">Reporte de Gestión<br/>de Proyectos</div>
        <div class="cover-subtitle">Estado y seguimiento del portafolio de proyectos</div>
      </div>
      <div class="cover-meta">
        <div class="cover-meta-item">
          <label>Generado</label>
          <span>${fmt(generatedAt)}</span>
        </div>
        <div class="cover-meta-item">
          <label>Proyectos</label>
          <span>${projects.length}</span>
        </div>
        <div class="cover-meta-item">
          <label>Salud portafolio</label>
          <span>${hl.label} ${health}%</span>
        </div>
        <div class="cover-meta-item">
          <label>Preparado por</label>
          <span>${style.authorName || 'Area Leader'}</span>
        </div>
      </div>
    </div>
  ` : ''

  // ── Portfolio health ──
  const healthBlock = `
    <div class="health-block">
      <div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Salud del portafolio</div>
        <div class="health-score" style="color:${hl.color}">${health}%</div>
        <span class="badge" style="background:${hl.bg};color:${hl.color}">${hl.label}</span>
      </div>
      <div style="flex:1">
        <div class="health-bar-wrap">
          <div class="health-bar-fill" style="width:${health}%;background:${hl.color}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:9px;color:#94a3b8">
          <span>En atención</span><span>Moderado</span><span>Saludable</span>
        </div>
        <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;font-size:10px">
          ${Object.entries(STATUS_CFG).map(([k, v]) => {
            const n = projects.filter(p => p.status === k).length
            return n > 0 ? `<span><span class="semaforo" style="background:${v.color}"></span>${v.label}: <strong>${n}</strong></span>` : ''
          }).join('')}
        </div>
      </div>
    </div>
  `

  // ── Global summary table ──
  const summaryTable = `
    <div class="section">
      <h2>Resumen Ejecutivo · ${fmt(generatedAt)}</h2>
      ${healthBlock}
      <div class="kpi-row">
        <div class="kpi-box"><div class="kpi-val">${projects.length}</div><div class="kpi-lbl">Proyectos</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:#10b981">${projects.filter(p=>p.status==='active').length}</div><div class="kpi-lbl">En desarrollo</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:#f59e0b">${projects.filter(p=>p.status==='at-risk').length}</div><div class="kpi-lbl">En riesgo</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:#ef4444">${projects.filter(p=>new Date(p.due_date)<new Date()&&p.status!=='completed').length}</div><div class="kpi-lbl">Vencidos</div></div>
        <div class="kpi-box"><div class="kpi-val">${projects.length>0?Math.round(projects.reduce((a,p)=>a+p.progress,0)/projects.length):0}%</div><div class="kpi-lbl">Progreso prom.</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:#06b6d4">${projects.filter(p=>p.status==='completed').length}</div><div class="kpi-lbl">Completados</div></div>
      </div>

      <table>
        <thead>
          <tr><th>Proyecto</th><th>Estado</th><th>Progreso</th><th>vs Estimado</th><th>Líder</th><th>Entrega</th><th>Riesgos</th></tr>
        </thead>
        <tbody>
          ${projects.map(p => {
            const s = sc(p.status)
            const dev = p.progress - p.estimated
            const risks = detailData[p.id]?.risks || []
            const highRisks = risks.filter(r=>r.severity==='high').length
            const overdue = p.due_date && new Date(p.due_date)<new Date() && p.status!=='completed'
            return `<tr>
              <td><strong>${p.name}</strong>${p.client?`<br/><span class="sub">${p.client}</span>`:''}</td>
              <td><span class="semaforo" style="background:${s.color}"></span><span class="badge" style="background:${s.color}18;color:${s.color}">${s.label}</span></td>
              <td>
                <div class="progress-cell">
                  <div class="pb-wrap"><div class="pb-fill" style="width:${p.progress}%;background:${s.color}"></div></div>
                  <strong>${p.progress}%</strong>
                </div>
              </td>
              <td class="center"><span style="color:${dev>=0?'#10b981':'#ef4444'};font-weight:700">${dev>=0?'+':''}${dev}%</span></td>
              <td>${p.leader_name||'—'}</td>
              <td class="${overdue?'overdue':''}">${fmtShort(p.due_date)}</td>
              <td class="center">${highRisks>0?`<span class="badge sm" style="background:#fee2e2;color:#ef4444">${highRisks} alto${highRisks>1?'s':''}</span>`:risks.length?`<span class="sub">${risks.length}</span>`:'<span class="sub">—</span>'}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  `

  // ── Risk summary ──
  const riskSummary = style.showRiskSummary && allRisks.length > 0 ? `
    <div class="section">
      <h2>Riesgos Consolidados del Portafolio</h2>
      ${allRisks.map(r => {
        const rc = SEV[r.severity] || SEV.medium
        return `<div class="risk-row ${r.severity}">
          <span class="badge sm" style="background:${rc.bg};color:${rc.color};flex-shrink:0">${rc.label}</span>
          <div style="flex:1">
            <strong>${r.title}</strong> <span class="sub">· ${r.projectName}</span>
            ${r.description?`<br/><span class="sub">${r.description}</span>`:''}
          </div>
          <div style="text-align:right;flex-shrink:0;font-size:10px">
            ${r.time_delta?`<div style="color:#f59e0b;font-weight:600">${r.time_delta}</div>`:''}
            ${r.budget_delta?`<div style="color:#ef4444;font-weight:600">${r.budget_delta}</div>`:''}
          </div>
        </div>`
      }).join('')}
    </div>
  ` : ''

  // ── Upcoming milestones ──
  const milestonesBlock = milestones.length > 0 ? `
    <div class="section">
      <h2>Próximos Hitos — 30 días</h2>
      ${milestones.map(m => {
        const tc = TASK_S[m.status] || TASK_S.todo
        return `<div class="milestone-row">
          <div class="milestone-date">${fmtShort(m.due_date)}</div>
          <div style="flex:1">
            <strong>${m.title}</strong>
            <span class="sub"> · ${m.projectName}</span>
            ${m.assigned_name?`<span class="sub"> · ${m.assigned_name}</span>`:''}
          </div>
          <span class="badge sm" style="background:${tc.color}18;color:${tc.color}">${tc.label}</span>
        </div>`
      }).join('')}
    </div>
  ` : ''

  // ── Project detail pages ──
  const details = reportType === 'full' ? projects.map((p, idx) => {
    const dd = detailData[p.id] || {}
    const s  = sc(p.status)
    const tasks   = dd.tasks   || []
    const risks   = dd.risks   || []
    const members = dd.members || []
    const done    = tasks.filter(t=>t.status==='completed').length

    return `
      <div class="page-break">
        <!-- Project banner — acts as visual separator and title -->
        <div class="proj-banner">
          <div class="proj-banner-num">Proyecto ${String(idx+1).padStart(2,'0')} de ${projects.length}</div>
          <div class="proj-banner-title">${p.name}</div>
          <span class="proj-banner-status" style="background:rgba(255,255,255,0.15);color:white;border:1.5px solid rgba(255,255,255,0.3)">
            <span class="semaforo" style="background:${s.color};width:8px;height:8px"></span> ${s.label}
          </span>
        </div>
        <!-- Project meta -->
        <div class="proj-header" style="border-radius:0 0 8px 8px;margin-bottom:10px">
          <div class="proj-meta-row" style="margin-bottom:0">
            ${p.client?`<span><strong>Cliente:</strong> ${p.client}</span>`:''}
            <span><strong>Líder:</strong> ${p.leader_name||'—'}</span>
            <span><strong>Entrega:</strong> ${fmt(p.due_date)}</span>
            <span><strong>Progreso:</strong> ${p.progress}% <span style="color:#94a3b8">(est. ${p.estimated}%)</span></span>
          </div>
          ${p.description?`<div class="description" style="margin-top:8px">${p.description}</div>`:''}
        </div>

        <!-- Progress -->
        <div class="progress-section">
          <div class="progress-row"><span>Progreso real</span><strong style="color:${s.color}">${p.progress}%</strong></div>
          <div class="pb-wrap big"><div class="pb-fill" style="width:${p.progress}%;background:${s.color}"></div></div>
          <div class="progress-row" style="margin-top:7px;opacity:.6"><span>Estimado</span><span>${p.estimated}%</span></div>
          <div class="pb-wrap big" style="opacity:.4"><div class="pb-fill" style="width:${p.estimated}%;background:#94a3b8"></div></div>
        </div>

        <!-- KPIs -->
        <div class="kpi-row">
          <div class="kpi-box"><div class="kpi-val">${tasks.length}</div><div class="kpi-lbl">Tareas</div></div>
          <div class="kpi-box"><div class="kpi-val" style="color:#10b981">${done}</div><div class="kpi-lbl">Completadas</div></div>
          <div class="kpi-box"><div class="kpi-val" style="color:#3b82f6">${tasks.filter(t=>t.status==='in-progress').length}</div><div class="kpi-lbl">En curso</div></div>
          <div class="kpi-box"><div class="kpi-val" style="color:#ef4444">${tasks.filter(t=>t.status==='blocked').length}</div><div class="kpi-lbl">Bloqueadas</div></div>
          <div class="kpi-box"><div class="kpi-val" style="color:#f59e0b">${risks.filter(r=>r.severity==='high').length}</div><div class="kpi-lbl">Riesgos altos</div></div>
          <div class="kpi-box"><div class="kpi-val">${members.length}</div><div class="kpi-lbl">Equipo</div></div>
        </div>

        <!-- Team -->
        ${members.length>0?`
          <h3>Equipo asignado</h3>
          <div class="team-pills">
            ${members.map(m=>`<span class="team-pill"><span class="av-dot" style="background:${m.color}">${m.initials}</span>${m.name} <span class="sub">&nbsp;${m.role}</span></span>`).join('')}
          </div>`:''}

        <!-- Tasks -->
        ${tasks.length>0?`
          <h3>Tareas (${tasks.length})</h3>
          <table>
            <thead><tr><th>Tarea</th><th>Grupo</th><th>Asignado</th><th>Estado</th><th>Vence</th></tr></thead>
            <tbody>
              ${tasks.map(t=>{
                const tc=TASK_S[t.status]||TASK_S.todo
                const od=t.due_date&&new Date(t.due_date)<new Date()&&t.status!=='completed'
                return `<tr>
                  <td>${t.title}</td>
                  <td class="sub">${t.group_name||'—'}</td>
                  <td>${t.assigned_name||'—'}</td>
                  <td><span class="badge sm" style="background:${tc.color}18;color:${tc.color}">${tc.label}</span></td>
                  <td class="${od?'overdue':'sub'}">${fmtShort(t.due_date)}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>`:'<p class="empty-note">Sin tareas registradas.</p>'}

        <!-- Risks -->
        ${risks.length>0?`
          <h3>Riesgos (${risks.length})</h3>
          <table>
            <thead><tr><th>Riesgo</th><th>Severidad</th><th>Impacto tiempo</th><th>Impacto costo</th><th>Fecha</th></tr></thead>
            <tbody>
              ${risks.map(r=>{
                const rc=SEV[r.severity]||SEV.medium
                return `<tr>
                  <td><strong>${r.title}</strong>${r.description?`<br/><span class="sub">${r.description}</span>`:''}</td>
                  <td><span class="badge sm" style="background:${rc.bg};color:${rc.color}">${rc.label}</span></td>
                  <td class="center">${r.time_delta||'—'}</td>
                  <td class="center">${r.budget_delta||'—'}</td>
                  <td class="sub">${fmtShort(r.created_at)}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>`:'<p class="empty-note">Sin riesgos registrados.</p>'}

        <!-- Planner / línea de tiempo -->
        ${style.showPlanner ? buildPlannerHTML(p, tasks) : ''}
      </div>
    `
  }).join('') : ''

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>${style.clientName} · Reporte ${fmt(generatedAt)}</title>
<style>${css}</style></head>
<body>
  <div class="page">
    ${cover}
    ${summaryTable}
    ${riskSummary}
    ${milestonesBlock}
    ${details}
    <div class="report-footer">
      <span>${style.footerText}</span>
      <span>${fmt(generatedAt)}</span>
    </div>
  </div>
</body></html>`
}

// ══════════════════════════════════════════════════
// STYLE EDITOR
// ══════════════════════════════════════════════════
const FONTS = ['Segoe UI','Arial','Georgia','Helvetica','Trebuchet MS','Calibri']
const EMPTY_STYLE = {
  name: '', clientName: '', authorName: '',
  primaryColor: '#1e293b', accentColor: '#3b82f6', secondaryColor: '#64748b',
  fontFamily: 'Segoe UI', logoText: '',
  footerText: 'Generado con Area Leader Pro',
  showCoverPage: true, showRiskSummary: true, showMilestones: true, showPlanner: true,
}

function StyleEditor({ style: initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_STYLE, ...initial })
  const set = (k,v) => setForm(f => ({...f, [k]: v}))

  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onCancel()}}>
      <div className="modal modal-lg" style={{maxWidth:500}}>
        <div className="modal-header">
          <h2 className="modal-title">
            <span className="mat-icon" style={{fontSize:18,marginRight:6,verticalAlign:'middle'}}>palette</span>
            {initial.id ? 'Editar estilo' : 'Nuevo estilo'}
          </h2>
          <button className="icon-btn" onClick={onCancel}><span className="mat-icon">close</span></button>
        </div>
        <div className="modal-body" style={{gap:12}}>

          {/* Preview strip */}
          <div className="style-preview-strip" style={{background:form.primaryColor}}>
            <div className="spv-logo">{form.logoText||'LOGO'}</div>
            <div className="spv-name">{form.clientName||'Nombre del cliente'}</div>
            <div className="spv-accent" style={{background:form.accentColor}}/>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre del estilo *</label>
              <input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="ej. Cliente ABC"/>
            </div>
            <div className="form-group">
              <label className="form-label">Texto logo / Sigla</label>
              <input className="form-input" value={form.logoText} onChange={e=>set('logoText',e.target.value.slice(0,6))} placeholder="ALP"/>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre del cliente</label>
              <input className="form-input" value={form.clientName} onChange={e=>set('clientName',e.target.value)} placeholder="Empresa XYZ"/>
            </div>
            <div className="form-group">
              <label className="form-label">Preparado por</label>
              <input className="form-input" value={form.authorName} onChange={e=>set('authorName',e.target.value)} placeholder="Francisco A."/>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Colores de marca</label>
            <div className="color-row">
              <div className="color-field">
                <input type="color" value={form.primaryColor} onChange={e=>set('primaryColor',e.target.value)} className="color-input"/>
                <span className="color-label">Principal</span>
              </div>
              <div className="color-field">
                <input type="color" value={form.accentColor} onChange={e=>set('accentColor',e.target.value)} className="color-input"/>
                <span className="color-label">Acento</span>
              </div>
              <div className="color-field">
                <input type="color" value={form.secondaryColor} onChange={e=>set('secondaryColor',e.target.value)} className="color-input"/>
                <span className="color-label">Secundario</span>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipografía</label>
              <select className="form-input" value={form.fontFamily} onChange={e=>set('fontFamily',e.target.value)}>
                {FONTS.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Pie de página</label>
              <input className="form-input" value={form.footerText} onChange={e=>set('footerText',e.target.value)}/>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Secciones del reporte</label>
            <div className="toggle-options">
              {[
                {k:'showCoverPage',    label:'Portada ejecutiva',           icon:'front_hand'},
                {k:'showRiskSummary', label:'Riesgos consolidados',         icon:'warning_amber'},
                {k:'showMilestones',  label:'Próximos hitos (30 días)',     icon:'flag'},
                {k:'showPlanner',     label:'Línea de tiempo (planner)',    icon:'timeline'},
              ].map(o=>(
                <div key={o.k} className="toggle-option" onClick={()=>set(o.k,!form[o.k])}>
                  <span className="mat-icon" style={{fontSize:17,color:'var(--accent)'}}>{o.icon}</span>
                  <span className="toggle-option-label">{o.label}</span>
                  <div className={`pref-toggle ${form[o.k]?'on':''}`} style={{pointerEvents:'none'}}>
                    <span className="pref-toggle-thumb"/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>onSave(form)} disabled={!form.name.trim()}>
            <span className="mat-icon">check</span> Guardar estilo
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// MAIN EXPORT MODAL
// ══════════════════════════════════════════════════
export default function ExportModal({ onClose }) {
  const [projects, setProjects]     = useState([])
  const [selected, setSelected]     = useState(new Set())
  const [reportType, setReportType] = useState('full')
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [styles, setStyles]         = useState(getClientStyles)
  const [activeStyle, setActiveStyle] = useState(() => getClientStyles()[0])
  const [styleEditor, setStyleEditor] = useState(null) // null | style obj | 'new'

  useEffect(() => {
    getProjects().then(p => {
      setProjects(p)
      setSelected(new Set(p.map(x=>x.id)))
    }).finally(()=>setLoading(false))
  }, [])

  const sc = s => STATUS_CFG[s] || STATUS_CFG.planning

  function toggleAll() {
    setSelected(selected.size===projects.length ? new Set() : new Set(projects.map(p=>p.id)))
  }
  function toggle(id) {
    setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  }

  function handleSaveStyle(form) {
    const toSave = {
      ...form,
      id: styleEditor?.id || generateStyleId(),
      createdAt: styleEditor?.createdAt || now(),
    }
    const updated = saveClientStyle(toSave)
    setStyles([DEFAULT_STYLE, ...updated.filter(s=>s.id!=='default')])
    setActiveStyle(toSave)
    setStyleEditor(null)
  }

  function handleDeleteStyle(id) {
    if (activeStyle.id === id) setActiveStyle(styles[0])
    setStyles(deleteClientStyle(id))
  }

  async function handleExport() {
    if (!selected.size) return
    setGenerating(true)
    try {
      const selectedProjects = projects.filter(p=>selected.has(p.id))
      const detailData = {}
      await Promise.all(selectedProjects.map(async p => {
        const [tasks, risks, members] = await Promise.all([
          getTasksByProject(p.id),
          getRisksByProject(p.id),
          getProjectMembers(p.id),
        ])
        detailData[p.id] = { tasks, risks, members }
      }))
      const html = buildHTML({ projects: selectedProjects, detailData, reportType, style: activeStyle, generatedAt: now() })
      const win = window.open('', '_blank', 'width=960,height=720')
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(()=>win.print(), 600)
      onClose()
    } catch(e) { alert('Error: '+e.message) }
    finally { setGenerating(false) }
  }

  return (
    <>
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal modal-export">
        <div className="modal-header">
          <h2 className="modal-title">
            <span className="mat-icon" style={{fontSize:18,marginRight:6,verticalAlign:'middle'}}>picture_as_pdf</span>
            Exportar reporte
          </h2>
          <button className="icon-btn" onClick={onClose}><span className="mat-icon">close</span></button>
        </div>

        <div className="export-body">
          {/* LEFT COL */}
          <div className="export-left">

            {/* Report type */}
            <div className="form-group">
              <label className="form-label">Tipo de reporte</label>
              <div className="status-list">
                {[
                  {v:'summary', icon:'table_chart', label:'Vista global',
                   desc:'Portada · Semáforo de salud · Tabla resumen · Riesgos consolidados · Próximos hitos'},
                  {v:'full',    icon:'description', label:'Reporte completo',
                   desc:'Todo lo anterior + una página de detalle por cada proyecto (tareas, riesgos, equipo y línea de tiempo)'},
                ].map(o=>(
                  <button key={o.v} type="button"
                    className={`status-list-item ${reportType===o.v?'sl-active selected':''}`}
                    onClick={()=>setReportType(o.v)}>
                    <span className="mat-icon sl-icon" style={{color:reportType===o.v?'var(--accent)':'var(--text-muted)'}}>{o.icon}</span>
                    <div className="sl-text"><span className="sl-label">{o.label}</span><span className="sl-desc">{o.desc}</span></div>
                    <span className="mat-icon sl-check" style={{opacity:reportType===o.v?1:.25}}>
                      {reportType===o.v?'radio_button_checked':'radio_button_unchecked'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Projects */}
            <div className="form-group">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <label className="form-label">Proyectos ({selected.size}/{projects.length})</label>
                <button className="link-btn" onClick={toggleAll}>
                  {selected.size===projects.length?'Quitar todos':'Todos'}
                </button>
              </div>
              {loading ? <Skeleton h={120}/> : (
                <div className="export-project-list">
                  {projects.length===0
                    ? <p className="empty-sub">Sin proyectos.</p>
                    : projects.map(p=>{
                      const s=sc(p.status); const sel=selected.has(p.id)
                      return (
                        <div key={p.id} className={`export-project-item ${sel?'selected':''}`} onClick={()=>toggle(p.id)}>
                          <div className={`export-checkbox ${sel?'checked':''}`}>
                            {sel&&<span className="mat-icon" style={{fontSize:14,color:'white'}}>check</span>}
                          </div>
                          <div className="export-project-dot" style={{background:s.color}}/>
                          <div className="export-project-info">
                            <div className="export-project-name">{p.name}</div>
                            <div className="export-project-meta">
                              <span style={{color:s.color,fontSize:10,fontWeight:600}}>{s.label}</span>
                              {p.client&&<span className="sub"> · {p.client}</span>}
                            </div>
                          </div>
                          <strong style={{fontSize:12,color:'var(--text-primary)',flexShrink:0}}>{p.progress}%</strong>
                        </div>
                      )
                    })
                  }
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COL — Style selector */}
          <div className="export-right">
            <div className="form-group" style={{flex:1,display:'flex',flexDirection:'column'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <label className="form-label">Estilo del cliente</label>
                <button className="link-btn" onClick={()=>setStyleEditor('new')}>
                  <span className="mat-icon" style={{fontSize:13}}>add</span> Nuevo
                </button>
              </div>
              <div className="style-list">
                {styles.map(s=>(
                  <div key={s.id}
                    className={`style-card ${activeStyle.id===s.id?'selected':''}`}
                    onClick={()=>setActiveStyle(s)}>
                    <div className="style-card-preview" style={{background:s.primaryColor}}>
                      <div style={{width:16,height:4,background:s.accentColor,borderRadius:2,margin:'4px auto 0'}}/>
                    </div>
                    <div className="style-card-info">
                      <div className="style-card-name">{s.name}</div>
                      <div className="style-card-client">{s.clientName}</div>
                    </div>
                    {activeStyle.id===s.id && <span className="mat-icon" style={{fontSize:16,color:'var(--accent)',flexShrink:0}}>check_circle</span>}
                    {!s.isDefault && (
                      <div className="style-card-actions" onClick={e=>e.stopPropagation()}>
                        <button className="icon-btn" style={{width:26,height:26}} onClick={()=>setStyleEditor(s)}>
                          <span className="mat-icon" style={{fontSize:14}}>edit</span>
                        </button>
                        <button className="icon-btn icon-btn-danger" style={{width:26,height:26}} onClick={()=>handleDeleteStyle(s.id)}>
                          <span className="mat-icon" style={{fontSize:14}}>delete_outline</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Active style preview */}
              {activeStyle && (
                <div className="active-style-preview" style={{background:activeStyle.primaryColor}}>
                  <div style={{color:'white',opacity:.7,fontSize:10,textTransform:'uppercase',letterSpacing:1}}>{activeStyle.clientName}</div>
                  <div style={{color:'white',fontSize:14,fontWeight:700,marginTop:2}}>Reporte de Gestión</div>
                  <div style={{display:'flex',gap:6,marginTop:8}}>
                    {[activeStyle.primaryColor,activeStyle.accentColor,activeStyle.secondaryColor].map((c,i)=>(
                      <div key={i} style={{width:20,height:20,borderRadius:4,background:c,border:'2px solid rgba(255,255,255,.3)'}}/>
                    ))}
                    <span style={{color:'rgba(255,255,255,.6)',fontSize:10,marginLeft:4,alignSelf:'center'}}>{activeStyle.fontFamily}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{justifyContent:'space-between'}}>
          <span style={{fontSize:11,color:'var(--text-muted)'}}>
            {selected.size>0 ? `${selected.size} proyecto${selected.size!==1?'s':''} · estilo "${activeStyle.name}"` : 'Selecciona al menos un proyecto'}
          </span>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleExport} disabled={generating||!selected.size}>
              {generating
                ? <><span className="mat-icon spin">refresh</span> Generando…</>
                : <><span className="mat-icon">picture_as_pdf</span> Exportar PDF</>}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Style editor sub-modal */}
    {styleEditor && (
      <StyleEditor
        style={styleEditor==='new' ? EMPTY_STYLE : styleEditor}
        onSave={handleSaveStyle}
        onCancel={()=>setStyleEditor(null)}
      />
    )}
    </>
  )
}
