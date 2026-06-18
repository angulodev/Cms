import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Team Members ──────────────────────────────────
export async function getTeamMembers() {
  const { data, error } = await supabase
    .from('al_team_members')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function upsertMember(member) {
  const { data, error } = await supabase.rpc('al_upsert_member', {
    p_id:       member.id || null,
    p_name:     member.name,
    p_initials: member.initials,
    p_role:     member.role,
    p_color:    member.color || '#3b82f6',
    p_email:    member.email || null,
    p_active:   member.active !== undefined ? member.active : true,
  })
  if (error) throw error
  return data
}

export async function deactivateMember(id) {
  const { error } = await supabase.rpc('al_deactivate_member', { p_id: id })
  if (error) throw error
}

export async function activateMember(id) {
  const { error } = await supabase.rpc('al_activate_member', { p_id: id })
  if (error) throw error
}

export async function getAllMembers() {
  const { data, error } = await supabase
    .from('al_team_members_all')
    .select('*')
    .order('active', { ascending: false })
    .order('name')
  if (error) throw error
  return data
}

// ── Proyectos CRUD ────────────────────────────────
export async function upsertProject(project) {
  const { data, error } = await supabase.rpc('al_upsert_project', {
    p_id:          project.id || null,
    p_name:        project.name,
    p_client:      project.client || null,
    p_status:      project.status || 'planning',
    p_progress:    project.progress || 0,
    p_estimated:   project.estimated || 0,
    p_leader_id:   project.leader_id || null,
    p_due_date:    project.due_date || null,
    p_description: project.description || null,
    p_start_date:  project.start_date || null,
  })

  if (error) {
    if (error.message?.includes('project_limit_reached')) {
      let planStatus = null
      try {
        planStatus = await getPlanStatus()
      } catch {
        // si falla la consulta de plan, igual avisamos el límite sin detalle
      }
      const limitError = new Error('project_limit_reached')
      limitError.code = 'PLAN_LIMIT_REACHED'
      limitError.planStatus = planStatus
      throw limitError
    }
    throw error
  }
  return data
}

// ── Planes y límites ──────────────────────────────
export async function getPlanStatus() {
  const { data, error } = await supabase.rpc('al_plan_status')
  if (error) throw error
  return data
}

export async function requestUpgrade(planId) {
  const { data, error } = await supabase.rpc('al_request_upgrade', { p_plan_id: planId })
  if (error) throw error
  return data
}

export async function cancelPlan() {
  const { data, error } = await supabase.rpc('al_cancel_plan')
  if (error) throw error
  return data
}

export async function undoCancelPlan() {
  const { data, error } = await supabase.rpc('al_undo_cancel_plan')
  if (error) throw error
  return data
}

export async function deleteProject(id) {
  const { error } = await supabase.rpc('al_delete_project', { p_id: id })
  if (error) throw error
}

// ── Proyectos ──────────────────────────────────────
export async function getProjects() {
  const { data, error } = await supabase
    .from('al_projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  // Reshape leader into nested object for compatibility
  return (data || []).map(p => ({
    ...p,
    leader: p.leader_name ? {
      name: p.leader_name, initials: p.leader_initials, color: p.leader_color
    } : null
  }))
}

// ── Riesgos ───────────────────────────────────────
export async function getRisks() {
  const { data, error } = await supabase
    .from('al_risks')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(r => ({ ...r, project: { name: r.project_name } }))
}

// ── Actividad ─────────────────────────────────────
export async function getActivity(limit = 10) {
  const { data, error } = await supabase
    .from('al_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map(a => ({
    ...a,
    actor:   a.actor_name ? { name: a.actor_name, initials: a.actor_initials, color: a.actor_color } : null,
    project: a.project_name ? { name: a.project_name } : null,
  }))
}

export async function addComment(projectId, actorId, content) {
  const { error } = await supabase.rpc('al_add_activity', {
    p_project_id: projectId,
    p_actor_id:   actorId || null,
    p_type:       'comment',
    p_content:    content,
  })
  if (error) throw error
}

// ── Tareas ────────────────────────────────────────
export async function getTasksByProject(projectId) {
  const { data, error } = await supabase
    .from('al_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw error
  return (data || []).map(t => ({
    ...t,
    assigned: t.assigned_name ? { name: t.assigned_name, initials: t.assigned_initials, color: t.assigned_color } : null
  }))
}

// ── Workload ──────────────────────────────────────
export async function getWorkload(weekStart) {
  const { data, error } = await supabase
    .from('al_workload')
    .select('*')
    .eq('week_start', weekStart)
    .order('day_of_week')
  if (error) throw error
  return (data || []).map(w => ({
    ...w,
    member:  w.member_name ? { id: w.member_id, name: w.member_name, initials: w.member_initials, color: w.member_color } : null,
    project: w.project_name ? { name: w.project_name } : null,
  }))
}

export async function getWorkloadAuto(weekStart) {
  const { data, error } = await supabase.rpc('al_get_workload_auto', { p_week_start: weekStart })
  if (error) throw error
  return (data || []).map(w => ({
    member_id: w.member_id, day_of_week: w.day_of_week, hours: Number(w.hours), task_label: w.task_label,
    member:  { id: w.member_id, name: w.member_name, initials: w.member_initials, color: w.member_color },
    project: w.project_name ? { name: w.project_name } : null,
  }))
}

// ── KPI Dashboard ─────────────────────────────────
export async function getDashboardKPIs() {
  const [pRes, rRes, mRes] = await Promise.all([
    supabase.from('al_projects').select('status,progress,estimated'),
    supabase.from('al_risks').select('severity'),
    supabase.from('al_team_members').select('id'),
  ])
  const p = pRes.data || []
  const r = rRes.data || []
  const m = mRes.data || []
  const avgProgress = p.length ? (p.reduce((a, b) => a + b.progress, 0) / p.length).toFixed(1) : 0
  return {
    totalProjects: p.length,
    activeRisks:   r.length,
    avgProgress,
    teamSize:      m.length,
  }
}

// ── Tasks CRUD ────────────────────────────────────
export async function createTask(task) {
  const { data, error } = await supabase.rpc('al_upsert_task', {
    p_id:          task.id || null,
    p_project_id:  task.project_id,
    p_assigned_to: task.assigned_to || null,
    p_title:       task.title,
    p_group_name:  task.group_name || null,
    p_status:      task.status || 'planning',
    p_due_date:    task.due_date || null,
    p_start_date:  task.start_date || null,
  })
  if (error) throw error
  return data
}

export async function deleteTask(id) {
  const { error } = await supabase.rpc('al_delete_task', { p_id: id })
  if (error) throw error
}

// ── Project members assignment ────────────────────
export async function getProjectMembers(projectId) {
  const { data, error } = await supabase
    .from('al_project_members')
    .select('*')
    .eq('project_id', projectId)
  if (error) throw error
  return data || []
}

export async function toggleProjectMember(projectId, memberId, add) {
  if (add) {
    const { error } = await supabase.rpc('al_add_project_member', {
      p_project_id: projectId, p_member_id: memberId
    })
    if (error) throw error
  } else {
    const { error } = await supabase.rpc('al_remove_project_member', {
      p_project_id: projectId, p_member_id: memberId
    })
    if (error) throw error
  }
}

// ── Reports ───────────────────────────────────────
export async function getReportSummary() {
  const { data, error } = await supabase.rpc('al_report_summary')
  if (error) throw error
  return data
}
export async function getReportProgress() {
  const { data, error } = await supabase.rpc('al_report_progress')
  if (error) throw error
  return data || []
}
export async function getReportActivity(days = 14) {
  const { data, error } = await supabase.rpc('al_report_activity', { p_days: days })
  if (error) throw error
  return data || []
}
export async function getReportTeamLoad() {
  const { data, error } = await supabase.rpc('al_report_team_load')
  if (error) throw error
  return data || []
}

// ── Risks CRUD ────────────────────────────────────
export async function getRisksByProject(projectId) {
  const { data, error } = await supabase
    .from('al_risks_by_project')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function upsertRisk(risk) {
  const { data, error } = await supabase.rpc('al_upsert_risk', {
    p_id:           risk.id || null,
    p_project_id:   risk.project_id,
    p_title:        risk.title,
    p_description:  risk.description || null,
    p_severity:     risk.severity || 'medium',
    p_time_delta:   risk.time_delta || null,
    p_budget_delta: risk.budget_delta || null,
    p_status:       risk.status || 'active',
  })
  if (error) throw error
  return data
}

export async function deleteRisk(id) {
  const { error } = await supabase.rpc('al_delete_risk', { p_id: id })
  if (error) throw error
}

// ── Active projects for sidebar ───────────────────
export async function getActiveProjects() {
  const { data, error } = await supabase
    .from('al_projects')
    .select('id, name, status, leader_color')
    .in('status', ['active', 'at-risk', 'planning'])
    .order('updated_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return data || []
}

// ── Share links (compartir portfolio o proyecto) ──
export async function createShareLink({ scope, projectId = null, label = null, expiresInDays = null }) {
  const { data, error } = await supabase.rpc('al_create_share_link', {
    p_scope: scope,
    p_project_id: projectId,
    p_label: label,
    p_expires_in_days: expiresInDays,
  })
  if (error) throw error
  return data
}

export async function listShareLinks(projectId = null) {
  const { data, error } = await supabase.rpc('al_list_share_links', { p_project_id: projectId })
  if (error) throw error
  return data || []
}

export async function revokeShareLink(id) {
  const { error } = await supabase.rpc('al_revoke_share_link', { p_id: id })
  if (error) throw error
}

// Lectura pública por token — usa el cliente normal de supabase-js,
// pero estas RPCs no requieren sesión (auth.uid() es NULL y no se usa).
export async function getSharedPortfolio(token) {
  const { data, error } = await supabase.rpc('al_get_shared_portfolio', { p_token: token })
  if (error) throw error
  return data
}

export async function getSharedProject(token) {
  const { data, error } = await supabase.rpc('al_get_shared_project', { p_token: token })
  if (error) throw error
  return data
}

export async function getSharedPortfolioProject(token, projectId) {
  const { data, error } = await supabase.rpc('al_get_shared_portfolio_project', {
    p_token: token, p_project_id: projectId,
  })
  if (error) throw error
  return data
}

// ── User preferences (localStorage) ──────────────
const PREFS_KEY = 'alp_user_prefs'
export function getUserPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } catch { return {} }
}
export function saveUserPrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getUserPrefs(), ...prefs }))
}
