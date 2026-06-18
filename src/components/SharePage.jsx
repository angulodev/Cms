import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSharedPortfolio, getSharedProject, getSharedPortfolioProject } from '../lib/supabase'
import PortfolioWall from './PortfolioWall'
import { STATUS_CFG } from '../lib/projectStatus'
import { Avatar, EmptyState, StatusTag } from './UI'

const ERROR_MSG = {
  link_not_found: { title: 'Link no encontrado', sub: 'Revisa que copiaste la URL completa.' },
  link_revoked:   { title: 'Este link fue desactivado', sub: 'Pide a quien lo compartió que genere uno nuevo.' },
  link_expired:   { title: 'Este link venció', sub: 'Pide a quien lo compartió que genere uno nuevo.' },
}

function PublicHeader({ label }) {
  return (
    <div className="wall-public-header">
      <div className="wall-public-brand">
        <span className="mat-icon" style={{ color: 'var(--accent)' }}>dashboard</span>
        Area Leader Pro
      </div>
      {label && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>}
    </div>
  )
}

function PublicProjectDetail({ data, onBack }) {
  const { project: p, tasks, risks } = data
  const cfg = STATUS_CFG[p.status] || STATUS_CFG.backlog
  const grouped = {}
  tasks.forEach(t => {
    const g = t.group_name || 'General'
    if (!grouped[g]) grouped[g] = []
    grouped[g].push(t)
  })

  return (
    <div>
      {onBack && (
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={onBack}>
          <span className="mat-icon">arrow_back</span>
          <span>Volver al portfolio</span>
        </button>
      )}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 20 }}>{p.name}</h1>
            {p.client && <p className="page-sub">{p.client}</p>}
          </div>
          <span className="wall-semaphore" style={{ background: cfg.color, color: cfg.color, marginTop: 4 }} title={cfg.label} />
        </div>
        {p.description && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{p.description}</p>}

        <div className="wall-card-progress" style={{ marginTop: 16 }}>
          <div className="wall-card-progress-track" style={{ height: 7 }}>
            <div className="wall-card-progress-fill" style={{ width: `${p.progress || 0}%`, background: cfg.color }} />
          </div>
          <div className="wall-card-progress-label">
            <span>{cfg.label}</span>
            <span>{p.progress || 0}% completado</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
          {p.leader_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Avatar initials={p.leader_initials} color={p.leader_color} size={24} />
              <span style={{ fontSize: 12.5 }}>{p.leader_name}</span>
            </div>
          )}
          {p.due_date && (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="mat-icon" style={{ fontSize: 15 }}>event</span>
              Entrega: {new Date(p.due_date).toLocaleDateString('es-CL')}
            </div>
          )}
        </div>
      </div>

      {Object.keys(grouped).length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Tareas</h2>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{group}</div>
              {items.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13 }}>{t.title}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {t.assigned_name && <Avatar initials={t.assigned_initials} color={t.assigned_color} size={18} />}
                    <StatusTag status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {risks.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Riesgos</h2>
          {risks.map(r => (
            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.severity === 'high' ? 'var(--error)' : r.severity === 'medium' ? 'var(--warning)' : 'var(--success)' }}>
                  {r.severity === 'high' ? 'Alto' : r.severity === 'medium' ? 'Medio' : 'Bajo'}
                </span>
              </div>
              {r.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{r.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SharePage({ scope }) {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Selección de proyecto dentro de un portfolio compartido (navegación interna,
  // sin cambiar de URL — reusa el mismo token de portfolio para pedir el detalle).
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [projectDetail, setProjectDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme')
    const fetcher = scope === 'project' ? getSharedProject : getSharedPortfolio
    fetcher(token)
      .then(setData)
      .catch(err => setError(err.message || 'unknown'))
      .finally(() => setLoading(false))
  }, [token, scope])

  function handleSelectProject(project) {
    setSelectedProjectId(project.id)
    setDetailLoading(true)
    setDetailError(null)
    getSharedPortfolioProject(token, project.id)
      .then(setProjectDetail)
      .catch(err => setDetailError(err.message || 'unknown'))
      .finally(() => setDetailLoading(false))
  }

  function handleBackToPortfolio() {
    setSelectedProjectId(null)
    setProjectDetail(null)
    setDetailError(null)
  }

  if (loading) {
    return (
      <div className="wall-public-wrap">
        <PublicHeader />
        <div className="wall-public-body">
          <div className="wall-error-state">
            <span className="mat-icon">progress_activity</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    const msg = ERROR_MSG[error] || { title: 'No pudimos cargar este link', sub: 'Intenta de nuevo más tarde.' }
    return (
      <div className="wall-public-wrap">
        <PublicHeader />
        <div className="wall-public-body">
          <EmptyState icon="link_off" title={msg.title} sub={msg.sub} />
        </div>
      </div>
    )
  }

  return (
    <div className="wall-public-wrap">
      <PublicHeader label={data.label} />
      <div className="wall-public-body">
        {scope === 'project' ? (
          <PublicProjectDetail data={data} />
        ) : selectedProjectId ? (
          detailLoading ? (
            <div className="wall-error-state">
              <span className="mat-icon">progress_activity</span>
            </div>
          ) : detailError ? (
            <div>
              <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={handleBackToPortfolio}>
                <span className="mat-icon">arrow_back</span>
                <span>Volver al portfolio</span>
              </button>
              <EmptyState icon="error_outline" title="No se pudo cargar el proyecto" sub="Intenta volver al portfolio y entrar de nuevo." />
            </div>
          ) : (
            <PublicProjectDetail data={projectDetail} onBack={handleBackToPortfolio} />
          )
        ) : (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">{data.label || 'Cartera de proyectos'}</h1>
                <p className="page-sub">{data.projects.length} proyectos · vista de solo lectura</p>
              </div>
            </div>
            <PortfolioWall projects={data.projects} readOnly onSelectProject={handleSelectProject} />
          </>
        )}
      </div>
      <div className="wall-public-footer">
        Generado con Area Leader Pro · vista de solo lectura
      </div>
    </div>
  )
}
