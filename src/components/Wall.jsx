import { useEffect, useState } from 'react'
import { getProjects } from '../lib/supabase'
import PortfolioWall from './PortfolioWall'

export default function Wall({ onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    getProjects().then(setProjects).finally(() => setLoading(false))
  }, [])

  const active = projects.filter(p => !p.archived_at)

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vista general</h1>
          <p className="page-sub">{active.length} proyectos · agrupados por estado</p>
        </div>
      </div>
      <PortfolioWall projects={active} loading={loading} onSelectProject={onSelectProject} />
    </div>
  )
}
