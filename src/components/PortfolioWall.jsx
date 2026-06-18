import { useMemo, useState } from 'react'
import { Avatar, EmptyState, Skeleton } from './UI'
import { FINAL_STATUSES, STATUS_CFG, STATUS_GROUP_ORDER } from '../lib/projectStatus'

function isOverdue(p) {
  return p.due_date && new Date(p.due_date) < new Date() && !FINAL_STATUSES.includes(p.status)
}

function WallCard({ project: p, onClick, readOnly }) {
  const cfg = STATUS_CFG[p.status] || STATUS_CFG.backlog
  const leader = p.leader_name
    ? { name: p.leader_name, initials: p.leader_initials, color: p.leader_color }
    : (p.leader || null)
  return (
    <div
      className="wall-card"
      style={{ '--card-accent': cfg.color }}
      onClick={() => onClick?.(p)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: cfg.color }} />
      <div className="wall-card-top">
        <div>
          <div className="wall-card-name">{p.name}</div>
          {p.client && <div className="wall-card-client">{p.client}</div>}
        </div>
        <span className="wall-semaphore" style={{ background: cfg.color, color: cfg.color }} title={cfg.label} />
      </div>

      <div className="wall-card-progress">
        <div className="wall-card-progress-track">
          <div className="wall-card-progress-fill" style={{ width: `${p.progress || 0}%`, background: cfg.color }} />
        </div>
        <div className="wall-card-progress-label">
          <span>{cfg.label}</span>
          <span>{p.progress || 0}%</span>
        </div>
      </div>

      <div className="wall-card-bottom">
        {leader ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Avatar initials={leader.initials} color={leader.color} size={20} />
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{leader.name.split(' ')[0]}</span>
          </div>
        ) : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{readOnly ? '' : 'Sin líder'}</span>}

        {p.due_date && (
          <span className={`wall-card-due ${isOverdue(p) ? 'overdue' : ''}`}>
            <span className="mat-icon">event</span>
            {new Date(p.due_date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Vista "Wall Street": proyectos agrupados por estado, con semáforo de color,
 * buscador y click-to-detail. Funciona tanto dentro de la app autenticada
 * como en modo público (readOnly): recibe los proyectos ya resueltos,
 * no le importa de dónde vinieron.
 */
export default function PortfolioWall({ projects = [], loading = false, onSelectProject, readOnly = false }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      (p.client || '').toLowerCase().includes(q) ||
      (p.leader_name || p.leader?.name || '').toLowerCase().includes(q)
    )
  }, [projects, search])

  const groups = useMemo(() => {
    const byStatus = {}
    filtered.forEach(p => {
      const s = p.status || 'backlog'
      if (!byStatus[s]) byStatus[s] = []
      byStatus[s].push(p)
    })
    return STATUS_GROUP_ORDER
      .filter(s => byStatus[s]?.length)
      .map(s => ({ status: s, cfg: STATUS_CFG[s], items: byStatus[s] }))
  }, [filtered])

  return (
    <div>
      <div className="filters-bar" style={{ marginBottom: 18 }}>
        <div className="search-wrap">
          <span className="mat-icon search-icon">search</span>
          <input
            className="filter-input"
            placeholder="Buscar por proyecto, cliente o líder…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="wall-grid">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={110} radius={10} />)}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="folder_off"
          title="Sin proyectos"
          sub={search ? 'No hay proyectos que coincidan con tu búsqueda.' : 'Todavía no hay proyectos para mostrar.'}
        />
      ) : (
        groups.map(g => (
          <div className="wall-group" key={g.status}>
            <div className="wall-group-header">
              <span className="wall-group-dot" style={{ background: g.cfg.color }} />
              <span className="wall-group-title">{g.cfg.label}</span>
              <span className="wall-group-count">{g.items.length}</span>
            </div>
            <div className="wall-grid">
              {g.items.map(p => (
                <WallCard key={p.id} project={p} onClick={onSelectProject} readOnly={readOnly} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
