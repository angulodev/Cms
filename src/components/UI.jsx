// Shared tiny UI primitives

export function StatusTag({ status }) {
  const map = {
    'backlog':   { label: 'Backlog',        cls: 'tag-muted'   },
    'planning':  { label: 'Planificación',  cls: 'tag-info'    },
    'active':    { label: 'En desarrollo',  cls: 'tag-success' },
    'at-risk':   { label: 'En riesgo',      cls: 'tag-warning' },
    'on-hold':   { label: 'En pausa',       cls: 'tag-hold'    },
    'completed': { label: 'Completado',     cls: 'tag-done'    },
    'cancelled': { label: 'Cancelado',      cls: 'tag-error'   },
    'closed':    { label: 'Cerrado',        cls: 'tag-muted'   },
    // task statuses
    'todo':        { label: 'Pendiente',    cls: 'tag-muted'   },
    'in-progress': { label: 'En curso',     cls: 'tag-info'    },
    'review':      { label: 'En revisión',  cls: 'tag-warning' },
    'blocked':     { label: 'Bloqueado',    cls: 'tag-error'   },
  }
  const { label, cls } = map[status] || { label: status, cls: 'tag-muted' }
  return <span className={`tag ${cls}`}>{label}</span>
}

export function Avatar({ initials, color, size = 28 }) {
  return (
    <div
      className="avatar-circle"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

export function ProgressBar({ actual, estimated }) {
  return (
    <div className="progress-wrap">
      <div className="progress-track" style={{ marginBottom: 2 }}>
        <div className="progress-fill actual" style={{ width: `${actual}%` }} />
      </div>
      <div className="progress-track ghost">
        <div className="progress-fill est" style={{ width: `${estimated}%` }} />
      </div>
      <div className="progress-labels">
        <span>Real {actual}%</span>
        <span>Est {estimated}%</span>
      </div>
    </div>
  )
}

export function KPICard({ label, value, sub, colorClass, icon, onClick, hint }) {
  const isClickable = !!onClick
  return (
    <div
      className={`kpi-card ${colorClass} ${isClickable ? 'kpi-card-clickable' : ''}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? e => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="kpi-card-top">
        <div className="kpi-icon-wrap">
          <span className="mat-icon">{icon}</span>
        </div>
        {isClickable && (
          <span className="kpi-arrow">
            <span className="mat-icon">chevron_right</span>
          </span>
        )}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {hint && <div className="kpi-hint"><span className="mat-icon">touch_app</span>{hint}</div>}
    </div>
  )
}

export function Skeleton({ h = 16, w = '100%', radius = 4 }) {
  return (
    <div
      className="skeleton"
      style={{ height: h, width: w, borderRadius: radius }}
    />
  )
}

export function EmptyState({ icon, title, sub }) {
  return (
    <div className="empty-state">
      <span className="mat-icon empty-icon">{icon}</span>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  )
}

export function ConfirmModal({ title, message, confirmLabel, confirmClass = 'btn-primary', onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onCancel}>
            <span className="mat-icon">close</span>
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
