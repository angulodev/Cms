import { useEffect, useState } from 'react'
import {
  getTasksByProject, getActivity, addComment,
  createTask, deleteTask,
  getTeamMembers, getProjectMembers, toggleProjectMember,
  getRisksByProject, upsertRisk, deleteRisk
} from '../lib/supabase'
import { StatusTag, Avatar, Skeleton, EmptyState } from './UI'
import ProjectModal from './ProjectModal'
import ProjectPlanner from './ProjectPlanner'
import ShareModal from './ShareModal'


const RISK_STATUS = {
  active:     { label: 'Activo',        icon: 'radio_button_checked', color: '#ef4444', bg: '#fee2e2' },
  mitigating: { label: 'En mitigación', icon: 'pending',              color: '#f59e0b', bg: '#fef3c7' },
  mitigated:  { label: 'Mitigado',      icon: 'check_circle',         color: '#10b981', bg: '#d1fae5' },
  closed:     { label: 'Cerrado',       icon: 'cancel',               color: '#64748b', bg: '#f1f5f9' },
  accepted:   { label: 'Aceptado',      icon: 'thumb_up',             color: '#8b5cf6', bg: '#ede9fe' },
}

const STATUSES = [
  { value: 'todo',        label: '📋 Pendiente'   },
  { value: 'in-progress', label: '🚀 En curso'    },
  { value: 'review',      label: '👁 En revisión' },
  { value: 'blocked',     label: '🚫 Bloqueado'   },
  { value: 'completed',   label: '✅ Completado'  },
]

function formatDateTime(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const diff = (Date.now() - d) / 1000
  const rel = diff < 60 ? 'Ahora'
    : diff < 3600  ? `Hace ${Math.floor(diff/60)}min`
    : diff < 86400 ? `Hace ${Math.floor(diff/3600)}h`
    : null
  return rel ? `${rel} · ${date} ${time}` : `${date} · ${time}`
}

const EMPTY_TASK = { title: '', group_name: '', status: 'todo', assigned_to: '', start_date: '', due_date: '' }

export default function ProjectDetail({ project: initialProject, onBack, onProjectUpdated }) {
  const [project, setProject]       = useState(initialProject)
  const [tab, setTab]               = useState('overview')
  const [risks, setRisks]             = useState([])
  const [tasks, setTasks]           = useState([])
  const [activity, setActivity]     = useState([])
  const [members, setMembers]       = useState([])       // all team members
  const [projMembers, setProjMembers] = useState([])     // assigned to this project
  const [loading, setLoading]       = useState(true)
  const [comment, setComment]       = useState('')
  const [sending, setSending]       = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [shareOpen, setShareOpen]   = useState(false)
  // Task modal
  const [taskModal, setTaskModal]   = useState(null)     // null | 'new' | task obj
  const [taskForm, setTaskForm]     = useState(EMPTY_TASK)
  const [savingTask, setSavingTask] = useState(false)
  const [deletingTask, setDeletingTask] = useState(null)
  const [taskConfirm, setTaskConfirm]   = useState(null)
  const [taskSort, setTaskSort]         = useState({ col: 'title', dir: 'asc' })
  const [taskSearch, setTaskSearch]     = useState('')
  const [riskFilter, setRiskFilter]     = useState('')
  const [riskConfirm, setRiskConfirm]   = useState(null)
  const [toast, setToast]               = useState(null)
  // Risk modal
  const [riskModal, setRiskModal]     = useState(null)
  const [riskForm, setRiskForm]       = useState({ title:'', description:'', severity:'medium', time_delta:'', budget_delta:'' })
  const [savingRisk, setSavingRisk]   = useState(false)
  const [deletingRisk, setDeletingRisk] = useState(null)
  // Team toggle
  const [togglingMember, setTogglingMember] = useState(null)

  const loadAll = () => {
    if (!project) return
    Promise.resolve()
      .then(() => setLoading(true))
      .then(() => Promise.all([
        getTasksByProject(project.id),
        getActivity(20),
        getTeamMembers(),
        getProjectMembers(project.id),
        getRisksByProject(project.id),
      ]))
      .then(([t, a, m, pm, r]) => {
        setTasks(t)
        setActivity(a.filter(x => x.project_id === project.id))
        setMembers(m)
        setProjMembers(pm)
        setRisks(r)
      }).finally(() => setLoading(false))
  }

  useEffect(() => {
    Promise.resolve().then(() => setProject(initialProject))
  }, [initialProject])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll depende de project, redefinirla cada render es intencional
  useEffect(() => { loadAll() }, [project?.id])

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  if (!project) return null

  // ── Comment ──
  const handleComment = async () => {
    if (!comment.trim()) return
    setSending(true)
    try {
      await addComment(project.id, null, comment.trim())
      setActivity(prev => [{
        id: Date.now(), type: 'comment', content: comment.trim(),
        actor_name: null, project_name: project.name, created_at: new Date().toISOString()
      }, ...prev])
      setComment('')
    } finally { setSending(false) }
  }

  // ── Task modal ──
  function openNewTask() {
    setTaskForm(EMPTY_TASK)
    setTaskModal('new')
  }
  function openEditTask(t) {
    setTaskForm({
      title:       t.title,
      group_name:  t.group_name || '',
      status:      t.status,
      assigned_to: t.assigned_to || '',
      start_date:  t.start_date || '',
      due_date:    t.due_date || '',
    })
    setTaskModal(t)
  }
  async function handleSaveTask() {
    if (!taskForm.title.trim()) return
    setSavingTask(true)
    try {
      await createTask({
        ...taskForm,
        id:          taskModal !== 'new' ? taskModal.id : null,
        project_id:  project.id,
        assigned_to: taskForm.assigned_to || null,
        due_date:    taskForm.due_date || null,
      })
      setTaskModal(null)
      loadAll()
    } catch(e) { alert(e.message) }
    finally { setSavingTask(false) }
  }
  function handleDeleteTask(task, e) {
    e.stopPropagation()
    // If already in 'todo' (draft) state, show confirm to delete permanently
    // Otherwise, ask: complete or move to draft first
    setTaskConfirm(task)
  }

  async function confirmDeleteTask() {
    const task = taskConfirm
    setTaskConfirm(null)
    if (task.status !== 'todo') {
      // Move to todo (draft) first instead of deleting
      setDeletingTask(task.id)
      try {
        await createTask({ ...task, id: task.id, project_id: task.project_id,
          assigned_to: task.assigned_to || null, status: 'todo' })
        loadAll()
        setToast({ msg: `"${task.title}" movida a Pendiente. Elimínala desde ese estado.`, type: 'info' })
      } catch(e) { alert(e.message) }
      finally { setDeletingTask(null) }
    } else {
      // Already in draft/todo — delete permanently
      setDeletingTask(task.id)
      try { await deleteTask(task.id); loadAll()
        setToast({ msg: `Tarea eliminada permanentemente.`, type: 'success' })
      }
      catch(e) { alert(e.message) }
      finally { setDeletingTask(null) }
    }
  }

  async function confirmCompleteTask(task) {
    setTaskConfirm(null)
    setDeletingTask(task.id)
    try {
      await createTask({ ...task, id: task.id, project_id: task.project_id,
        assigned_to: task.assigned_to || null, status: 'completed' })
      loadAll()
      setToast({ msg: `"${task.title}" marcada como completada. ✅`, type: 'success' })
    } catch(e) { alert(e.message) }
    finally { setDeletingTask(null) }
  }

  // ── Risk handlers ──
  function openNewRisk() {
    setRiskForm({ title:'', description:'', severity:'medium', time_delta:'', budget_delta:'', status:'active' })
    setRiskModal('new')
  }
  function openEditRisk(r) {
    setRiskForm({ title:r.title, description:r.description||'', severity:r.severity, time_delta:r.time_delta||'', budget_delta:r.budget_delta||'', status:r.status||'active' })
    setRiskModal(r)
  }
  async function handleSaveRisk() {
    if (!riskForm.title.trim()) return
    setSavingRisk(true)
    try {
      await upsertRisk({ ...riskForm, id: riskModal !== 'new' ? riskModal.id : null, project_id: project.id, status: riskForm.status || 'active' })
      setRiskModal(null)
      loadAll()
    } catch(e) { alert(e.message) }
    finally { setSavingRisk(false) }
  }
  function handleDeleteRisk(risk, e) {
    e.stopPropagation()
    setRiskConfirm(risk)
  }

  async function confirmDeleteRisk() {
    const risk = riskConfirm
    setRiskConfirm(null)
    setDeletingRisk(risk.id)
    try { await deleteRisk(risk.id); loadAll()
      setToast({ msg: `Riesgo "${risk.title}" eliminado.`, type: 'success' })
    }
    catch(e) { alert(e.message) }
    finally { setDeletingRisk(null) }
  }

  // ── Team toggle ──
  async function handleToggleMember(memberId) {
    const isAssigned = projMembers.some(pm => pm.member_id === memberId)
    setTogglingMember(memberId)
    try {
      await toggleProjectMember(project.id, memberId, !isAssigned)
      loadAll()
    } catch(e) { alert(e.message) }
    finally { setTogglingMember(null) }
  }

  const completedTasks = tasks.filter(t => t.status === 'completed').length

  return (
    <div className="screen-content">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <button className="btn btn-ghost btn-sm" onClick={onBack}>
              <span className="mat-icon">arrow_back</span>
            </button>
            <StatusTag status={project.status} />
          </div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-sub">
            {project.leader_name && `Líder: ${project.leader_name} · `}
            {project.due_date && `Entrega ${new Date(project.due_date).toLocaleDateString('es-CL')}`}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => setShareOpen(true)}>
            <span className="mat-icon">ios_share</span>
            <span>Compartir</span>
          </button>
          <button className="btn btn-primary" onClick={() => setShowEditProject(true)}>
            <span className="mat-icon">edit</span>
            <span>Editar</span>
          </button>
        </div>
      </div>

      {shareOpen && (
        <ShareModal
          scope="project"
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* ── KPIs ── */}
      <div className="kpi-grid">
        <div className="kpi-card blue">
          <div className="kpi-card-top"><div className="kpi-icon-wrap"><span className="mat-icon">donut_large</span></div></div>
          <div className="kpi-label">Progreso</div>
          <div className="kpi-value">{project.progress}%</div>
          <div className="kpi-sub">Estimado: {project.estimated}%</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-card-top"><div className="kpi-icon-wrap"><span className="mat-icon">task_alt</span></div></div>
          <div className="kpi-label">Tareas</div>
          <div className="kpi-value">{tasks.length}</div>
          <div className="kpi-sub">{completedTasks} completadas</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-card-top"><div className="kpi-icon-wrap"><span className="mat-icon">schedule</span></div></div>
          <div className="kpi-label">Entrega</div>
          <div className="kpi-value" style={{fontSize:15}}>
            {project.due_date ? new Date(project.due_date).toLocaleDateString('es-CL') : '—'}
          </div>
          <div className="kpi-sub">{project.status === 'completed' ? 'Finalizado' : 'Fecha límite'}</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-card-top"><div className="kpi-icon-wrap"><span className="mat-icon">groups</span></div></div>
          <div className="kpi-label">Equipo</div>
          <div className="kpi-value">{projMembers.length || '—'}</div>
          <div className="kpi-sub">Personas asignadas</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="card card-flush">
        <div className="tabs">
          {['overview','tasks','planner','risks','team'].map(t => (
            <button key={t} className={`tab-btn ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
              {t==='overview'?'Overview':t==='tasks'?`Tareas (${tasks.length})`:t==='planner'?'Planner':t==='risks'?`Riesgos${risks.length>0?' ('+risks.length+')':''}`:'Equipo'}
            </button>
          ))}
        </div>

        <div className="tab-body">

          {/* ════ OVERVIEW ════ */}
          {tab === 'overview' && (
            <div className="overview-layout">
              {/* Left: desc + progress */}
              <div className="overview-main">
                {project.description
                  ? <p className="project-desc">{project.description}</p>
                  : <p className="project-desc" style={{color:'var(--text-muted)',fontStyle:'italic'}}>
                      Sin descripción. <button className="link-btn" onClick={() => setShowEditProject(true)}>Agregar descripción →</button>
                    </p>
                }

                {/* Progress visual */}
                <div className="overview-progress-block">
                  <div className="overview-progress-row">
                    <span className="overview-progress-label">Progreso real</span>
                    <span className="overview-progress-val" style={{color:'var(--accent)'}}>{project.progress}%</span>
                  </div>
                  <div className="progress-track" style={{height:8}}>
                    <div className="progress-fill actual" style={{width:`${project.progress}%`, height:'100%'}}/>
                  </div>
                  <div className="overview-progress-row" style={{marginTop:8}}>
                    <span className="overview-progress-label">Estimado</span>
                    <span className="overview-progress-val" style={{color:'var(--text-muted)'}}>{project.estimated}%</span>
                  </div>
                  <div className="progress-track" style={{height:6,opacity:.5}}>
                    <div className="progress-fill est" style={{width:`${project.estimated}%`, height:'100%'}}/>
                  </div>
                </div>

                {/* Quick task summary */}
                {tasks.length > 0 && (
                  <div className="overview-tasks-mini">
                    <div className="card-title" style={{marginBottom:8}}>Tareas recientes</div>
                    {tasks.slice(0,3).map(t => (
                      <div key={t.id} className="mini-task">
                        <span className={`mini-task-dot ${t.status}`}/>
                        <span className="mini-task-name">{t.title}</span>
                        <StatusTag status={t.status}/>
                      </div>
                    ))}
                    {tasks.length > 3 && (
                      <button className="link-btn" style={{marginTop:6}} onClick={()=>setTab('tasks')}>
                        Ver todas las tareas ({tasks.length}) →
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right: activity */}
              <div className="overview-side">
                <div className="card-title">Actividad</div>
                <div className="activity-list compact">
                  {loading ? <Skeleton h={60}/> : activity.length === 0
                    ? <p className="empty-sub">Sin actividad aún.</p>
                    : activity.map(a => (
                      <div key={a.id} className="activity-item">
                        <div className="activity-icon act-comment">
                          <span className="mat-icon">chat_bubble_outline</span>
                        </div>
                        <div className="activity-body">
                          <div className="activity-text">
                            {a.actor_name && <strong>{a.actor_name}: </strong>}
                            {a.content}
                          </div>
                          <div className="activity-time">{formatDateTime(a.created_at)}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
                <div className="comment-row">
                  <textarea className="comment-input" rows={2}
                    placeholder="Escribe un comentario… (Ctrl+Enter)"
                    value={comment} onChange={e=>setComment(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey)handleComment()}}/>
                  <button className="btn btn-primary btn-sm" onClick={handleComment} disabled={sending}>
                    <span className="mat-icon">send</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ TASKS ════ */}
          {tab === 'tasks' && (() => {
            // Sort + filter logic
            const sortedTasks = [...tasks]
              .filter(t => !taskSearch || t.title.toLowerCase().includes(taskSearch.toLowerCase()) || (t.group_name||'').toLowerCase().includes(taskSearch.toLowerCase()))
              .sort((a,b) => {
                let av = a[taskSort.col] || '', bv = b[taskSort.col] || ''
                if (taskSort.col === 'due_date') { av = av||'9999'; bv = bv||'9999' }
                const r = av < bv ? -1 : av > bv ? 1 : 0
                return taskSort.dir === 'asc' ? r : -r
              })
            const sortIcon = col => taskSort.col !== col ? 'unfold_more' : taskSort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'
            const setSort  = col => setTaskSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))
            return (
              <div>
                <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
                  <div className="search-wrap" style={{flex:1,minWidth:180}}>
                    <span className="mat-icon search-icon">search</span>
                    <input className="filter-input" placeholder="Buscar tareas…"
                      value={taskSearch} onChange={e=>setTaskSearch(e.target.value)}/>
                  </div>
                  <button className="btn btn-primary" onClick={openNewTask}>
                    <span className="mat-icon">add</span><span>Nueva tarea</span>
                  </button>
                </div>
                {loading ? <Skeleton h={150}/> : tasks.length === 0
                  ? <EmptyState icon="task_alt" title="Sin tareas" sub="Crea la primera tarea de este proyecto."/>
                  : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {[
                              {col:'title',     label:'Tarea'},
                              {col:'group_name',label:'Grupo'},
                              {col:'assigned_name', label:'Asignado'},
                              {col:'status',    label:'Estado'},
                              {col:'due_date',  label:'Vence'},
                            ].map(h => (
                              <th key={h.col} className="th-sortable" onClick={()=>setSort(h.col)}>
                                <span className="th-inner">
                                  {h.label}
                                  <span className="mat-icon th-sort-icon">{sortIcon(h.col)}</span>
                                </span>
                              </th>
                            ))}
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTasks.length === 0
                            ? <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'var(--text-muted)',fontSize:12}}>Sin resultados para "{taskSearch}"</td></tr>
                            : sortedTasks.map(t => (
                              <tr key={t.id} className="row-hover" onClick={()=>openEditTask(t)}>
                                <td>
                                  <div className="td-name">{t.title}</div>
                                </td>
                                <td><span style={{fontSize:11,color:'var(--text-muted)'}}>{t.group_name||'—'}</span></td>
                                <td>
                                  {t.assigned
                                    ? <div className="td-leader">
                                        <Avatar initials={t.assigned.initials} color={t.assigned.color} size={22}/>
                                        <span style={{fontSize:11}}>{t.assigned.name.split(' ')[0]}</span>
                                      </div>
                                    : <span style={{color:'var(--text-muted)',fontSize:11}}>—</span>
                                  }
                                </td>
                                <td><StatusTag status={t.status}/></td>
                                <td>
                                  <span className={`due-date ${t.due_date&&new Date(t.due_date)<new Date()&&t.status!=='completed'?'overdue':''}`}>
                                    {t.due_date?new Date(t.due_date).toLocaleDateString('es-CL'):'—'}
                                  </span>
                                </td>
                                <td onClick={e=>e.stopPropagation()}>
                                  <button className="icon-btn icon-btn-danger"
                                    disabled={deletingTask===t.id}
                                    onClick={e=>handleDeleteTask(t,e)}>
                                    <span className="mat-icon">{deletingTask===t.id?'hourglass_empty':'delete_outline'}</span>
                                  </button>
                                </td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </div>
            )
          })()}

          {/* ════ PLANNER ════ */}
          {tab === 'planner' && (
            <ProjectPlanner project={project} tasks={tasks} />
          )}

          {/* ════ RISKS ════ */}
          {tab === 'risks' && (
            <div>
              <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
                <select className="filter-select" value={riskFilter} onChange={e=>setRiskFilter(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {Object.entries(RISK_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div style={{marginLeft:'auto'}}>
                  <button className="btn btn-primary" onClick={openNewRisk}>
                    <span className="mat-icon">add</span><span>Nuevo riesgo</span>
                  </button>
                </div>
              </div>
              {loading ? <Skeleton h={120}/> : risks.length === 0
                ? <EmptyState icon="shield" title="Sin riesgos registrados" sub="Agrega un riesgo si identificas algo que pueda afectar el proyecto."/>
                : (() => {
                    const filtered = riskFilter ? risks.filter(r => r.status === riskFilter) : risks
                    return filtered.length === 0
                      ? <p className="empty-sub">Sin riesgos con ese estado.</p>
                      : (
                        <div className="risks-list">
                          {filtered.map(r => {
                            const rs = RISK_STATUS[r.status] || RISK_STATUS.active
                            return (
                              <div key={r.id} className={`risk-card risk-${r.severity}`} onClick={() => openEditRisk(r)}>
                                <div className="risk-card-left">
                                  <div className={`risk-sev-badge sev-${r.severity}`}>
                                    {r.severity === 'high' ? '🔴 Alto' : r.severity === 'medium' ? '🟡 Medio' : '🟢 Bajo'}
                                  </div>
                                  <div className="risk-card-body">
                                    <div className="risk-card-title-row">
                                      <span className="risk-card-title">{r.title}</span>
                                      <span className="risk-status-tag" style={{background:rs.bg,color:rs.color}}>
                                        <span className="mat-icon" style={{fontSize:12}}>{rs.icon}</span>
                                        {rs.label}
                                      </span>
                                    </div>
                                    {r.description && <div className="risk-card-desc">{r.description}</div>}
                                    <div className="risk-card-meta">
                                      {r.time_delta   && <span className="risk-meta-tag"><span className="mat-icon">schedule</span>{r.time_delta}</span>}
                                      {r.budget_delta && <span className="risk-meta-tag"><span className="mat-icon">payments</span>{r.budget_delta}</span>}
                                      <span className="risk-meta-date">{new Date(r.created_at).toLocaleDateString('es-CL',{day:'numeric',month:'short'})}</span>
                                    </div>
                                  </div>
                                </div>
                                <button className="icon-btn icon-btn-danger"
                                  disabled={deletingRisk===r.id}
                                  onClick={e=>handleDeleteRisk(r,e)}>
                                  <span className="mat-icon">{deletingRisk===r.id?'hourglass_empty':'delete_outline'}</span>
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )
                  })()
              }
            </div>
          )}

          {/* ════ TEAM ════ */}
          {tab === 'team' && (
            <div>
              <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:14}}>
                Toca una persona para asignarla o quitarla del proyecto.
              </p>
              {loading ? <Skeleton h={120}/> : members.length === 0
                ? <EmptyState icon="group_off" title="Sin miembros de equipo" sub="Agrega personas en la sección Equipo primero."/>
                : (
                  <div className="team-assign-grid">
                    {members.map(m => {
                      const assigned = projMembers.some(pm => pm.member_id === m.id)
                      const busy = togglingMember === m.id
                      return (
                        <button key={m.id}
                          className={`team-assign-card ${assigned?'assigned':''}`}
                          onClick={()=>handleToggleMember(m.id)}
                          disabled={busy}
                        >
                          <div style={{position:'relative'}}>
                            <Avatar initials={m.initials} color={assigned?m.color:'#94a3b8'} size={44}/>
                            {assigned && (
                              <div className="assigned-check">
                                <span className="mat-icon">check</span>
                              </div>
                            )}
                            {busy && (
                              <div className="assigned-check" style={{background:'var(--secondary)'}}>
                                <span className="mat-icon spin" style={{fontSize:12}}>refresh</span>
                              </div>
                            )}
                          </div>
                          <div className="team-assign-name">{m.name.split(' ')[0]}</div>
                          <div className="team-assign-role">{m.role.split(' ')[0]}</div>
                          <div className={`team-assign-badge ${assigned?'badge-assigned':'badge-unassigned'}`}>
                            {assigned?'Asignado':'+ Asignar'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              }
            </div>
          )}

        </div>
      </div>

      {/* ── Edit project modal ── */}
      {showEditProject && (
        <ProjectModal
          project={project}
          onClose={() => setShowEditProject(false)}
          onSaved={() => {
            setShowEditProject(false)
            // Reload project data
            if (onProjectUpdated) onProjectUpdated()
          }}
        />
      )}

      {/* ── Task modal ── */}
      {taskModal && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setTaskModal(null)}}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{taskModal==='new'?'Nueva tarea':'Editar tarea'}</h2>
              <button className="icon-btn" onClick={()=>setTaskModal(null)}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Título *</label>
                <input className="form-input" autoFocus value={taskForm.title}
                  onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))}
                  placeholder="ej. Configurar base de datos"/>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Grupo / Fase</label>
                  <input className="form-input" value={taskForm.group_name}
                    onChange={e=>setTaskForm(f=>({...f,group_name:e.target.value}))}
                    placeholder="ej. Backend"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-input" value={taskForm.status}
                    onChange={e=>setTaskForm(f=>({...f,status:e.target.value}))}>
                    {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Asignar a</label>
                  <select className="form-input" value={taskForm.assigned_to}
                    onChange={e=>setTaskForm(f=>({...f,assigned_to:e.target.value}))}>
                    <option value="">Sin asignar</option>
                    {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Fecha de inicio</label>
                  <input className="form-input" type="date" value={taskForm.start_date}
                    onChange={e=>setTaskForm(f=>({...f,start_date:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha límite</label>
                  <input className="form-input" type="date" value={taskForm.due_date}
                    onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))}/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setTaskModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveTask} disabled={savingTask||!taskForm.title.trim()}>
                {savingTask
                  ? <><span className="mat-icon spin">refresh</span> Guardando…</>
                  : <><span className="mat-icon">check</span> {taskModal==='new'?'Crear tarea':'Guardar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Risk Modal ── */}
      {riskModal && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setRiskModal(null)}}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{riskModal==='new'?'Nuevo riesgo':'Editar riesgo'}</h2>
              <button className="icon-btn" onClick={()=>setRiskModal(null)}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Título del riesgo *</label>
                <input className="form-input" autoFocus value={riskForm.title}
                  onChange={e=>setRiskForm(f=>({...f,title:e.target.value}))}
                  placeholder="ej. Retraso en entrega de proveedor"/>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={3} value={riskForm.description}
                  onChange={e=>setRiskForm(f=>({...f,description:e.target.value}))}
                  placeholder="Describe el impacto potencial…" style={{resize:'vertical'}}/>
              </div>
              <div className="form-group">
                <label className="form-label">Severidad</label>
                <div className="severity-list">
                  {[
                    { value:'high',   icon:'🔴', label:'Alto',  desc:'Impacto crítico, requiere acción inmediata' },
                    { value:'medium', icon:'🟡', label:'Medio', desc:'Impacto moderado, monitorear de cerca'      },
                    { value:'low',    icon:'🟢', label:'Bajo',  desc:'Impacto menor, registrado por precaución'  },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      className={`status-list-item ${riskForm.severity===opt.value?'sl-sev-'+opt.value+' selected':''}`}
                      onClick={()=>setRiskForm(f=>({...f,severity:opt.value}))}>
                      <span style={{fontSize:20,flexShrink:0}}>{opt.icon}</span>
                      <div className="sl-text">
                        <span className="sl-label">{opt.label}</span>
                        <span className="sl-desc">{opt.desc}</span>
                      </div>
                      <span className="mat-icon sl-check" style={{opacity: riskForm.severity===opt.value ? 1 : .25}}>
                        {riskForm.severity===opt.value ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Estado del riesgo</label>
                <div className="status-list">
                  {Object.entries(RISK_STATUS).map(([k,v]) => (
                    <button key={k} type="button"
                      className={`status-list-item ${riskForm.status===k?'selected':''}`}
                      style={riskForm.status===k?{borderColor:v.color,background:v.bg}:{}}
                      onClick={()=>setRiskForm(f=>({...f,status:k}))}>
                      <span className="mat-icon sl-icon" style={{color:v.color,fontSize:18}}>{v.icon}</span>
                      <div className="sl-text">
                        <span className="sl-label">{v.label}</span>
                      </div>
                      <span className="mat-icon sl-check" style={{opacity:riskForm.status===k?1:.25}}>
                        {riskForm.status===k?'radio_button_checked':'radio_button_unchecked'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Impacto en tiempo</label>
                  <input className="form-input" value={riskForm.time_delta}
                    onChange={e=>setRiskForm(f=>({...f,time_delta:e.target.value}))}
                    placeholder="ej. +5 días"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Impacto en costo</label>
                  <input className="form-input" value={riskForm.budget_delta}
                    onChange={e=>setRiskForm(f=>({...f,budget_delta:e.target.value}))}
                    placeholder="ej. +10%"/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setRiskModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveRisk} disabled={savingRisk||!riskForm.title.trim()}>
                {savingRisk
                  ? <><span className="mat-icon spin">refresh</span> Guardando…</>
                  : <><span className="mat-icon">check</span> {riskModal==='new'?'Crear riesgo':'Guardar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Risk confirm delete ── */}
      {riskConfirm && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setRiskConfirm(null)}}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <h2 className="modal-title">Eliminar riesgo</h2>
              <button className="icon-btn" onClick={()=>setRiskConfirm(null)}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:4}}>
                ¿Confirmas eliminar el riesgo <strong>"{riskConfirm.title}"</strong>?
              </p>
              <p style={{fontSize:12,color:'var(--text-muted)'}}>Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setRiskConfirm(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDeleteRisk}>
                <span className="mat-icon">delete_forever</span> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task confirm modal ── */}
      {taskConfirm && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setTaskConfirm(null)}}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <h2 className="modal-title">¿Qué deseas hacer?</h2>
              <button className="icon-btn" onClick={()=>setTaskConfirm(null)}>
                <span className="mat-icon">close</span>
              </button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:4}}>
                <strong>"{taskConfirm.title}"</strong>
              </p>
              <p style={{fontSize:12,color:'var(--text-muted)'}}>
                Estado actual: <strong>{taskConfirm.status}</strong>
              </p>
            </div>
            <div className="modal-footer" style={{flexDirection:'column',gap:8}}>
              {taskConfirm.status !== 'completed' && (
                <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}}
                  onClick={()=>confirmCompleteTask(taskConfirm)}>
                  <span className="mat-icon">check_circle</span> Marcar como completada
                </button>
              )}
              {taskConfirm.status !== 'todo' ? (
                <button className="btn btn-ghost" style={{width:'100%',justifyContent:'center'}}
                  onClick={()=>confirmDeleteTask()}>
                  <span className="mat-icon">archive</span> Mover a Pendiente (borrador)
                </button>
              ) : (
                <button className="btn btn-danger" style={{width:'100%',justifyContent:'center'}}
                  onClick={()=>confirmDeleteTask()}>
                  <span className="mat-icon">delete_forever</span> Eliminar permanentemente
                </button>
              )}
              <button className="btn btn-ghost" style={{width:'100%',justifyContent:'center'}}
                onClick={()=>setTaskConfirm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="mat-icon">
            {toast.type==='success'?'check_circle':toast.type==='info'?'info':'error_outline'}
          </span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
