import { useEffect, useState } from 'react'
import { listCompanyModules, setCompanyModule } from '../../lib/company'
import { Skeleton } from '../UI'

function Toast({ msg, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={`toast toast-${type}`}>
      <span className="mat-icon">{type === 'success' ? 'check_circle' : 'error_outline'}</span>
      {msg}
    </div>
  )
}

const MODULE_ICON = { sys_core: 'admin_panel_settings', area_leader: 'folder_open' }

export default function Modules({ companyId }) {
  const [loading, setLoading] = useState(true)
  const [modules, setModules] = useState([])
  const [toast, setToast] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let active = true

    async function loadInitial() {
      setLoading(true)
      try {
        const data = await listCompanyModules(companyId)
        if (active) setModules(data)
      } catch (e) {
        if (active) setToast({ msg: e.message, type: 'error' })
      }
      if (active) setLoading(false)
    }

    loadInitial()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  async function handleToggle(mod) {
    if (mod.id === 'sys_core') return // el core nunca se desactiva
    setBusyId(mod.id)
    try {
      await setCompanyModule(companyId, mod.id, !mod.active)
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, active: !m.active } : m))
      setToast({ msg: `${mod.name} ${!mod.active ? 'activado' : 'desactivado'}.` })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    }
    setBusyId(null)
  }

  return (
    <div className="screen-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Módulos</h1>
          <p className="page-sub">Activa o desactiva aplicaciones para tu empresa.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2].map(i => <Skeleton key={i} h={72} />)}
        </div>
      ) : (
        <div className="sys-module-list">
          {modules.map(m => (
            <div key={m.id} className="sys-module-row">
              <div className="sys-module-icon">
                <span className="mat-icon">{MODULE_ICON[m.id] || 'apps'}</span>
              </div>
              <div className="sys-module-info">
                <div className="sys-module-name">
                  {m.name}
                  {m.id === 'sys_core' && <span className="badge badge-muted" style={{ marginLeft: 6 }}>Núcleo</span>}
                </div>
                <div className="sys-module-desc">{m.description}</div>
              </div>
              <label className="sys-toggle">
                <input
                  type="checkbox"
                  checked={m.active}
                  disabled={m.id === 'sys_core' || busyId === m.id}
                  onChange={() => handleToggle(m)}
                />
                <span className="sys-toggle-track"><span className="sys-toggle-thumb" /></span>
              </label>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
