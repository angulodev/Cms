// Estados de proyecto compartidos entre ProjectModal y Projects.
// Estados finales: una vez en uno de estos, el proyecto no se puede borrar
// (al_delete_project lo archiva en su lugar — ver Settings/backend).
export const FINAL_STATUSES = ['completed', 'cancelled', 'closed']

// Vocabulario de color compartido entre ExportModal y PortfolioWall/SharePage.
export const STATUS_CFG = {
  backlog:    { label: 'Backlog',       color: '#94a3b8' },
  planning:   { label: 'Planificación', color: '#3b82f6' },
  active:     { label: 'En desarrollo', color: '#10b981' },
  'at-risk':  { label: 'En riesgo',     color: '#f59e0b' },
  'on-hold':  { label: 'En pausa',      color: '#8b5cf6' },
  completed:  { label: 'Completado',    color: '#06b6d4' },
  cancelled:  { label: 'Cancelado',     color: '#ef4444' },
  closed:     { label: 'Cerrado',       color: '#64748b' },
}

export const STATUS_GROUP_ORDER = ['at-risk', 'active', 'planning', 'on-hold', 'backlog', 'completed', 'cancelled', 'closed']
