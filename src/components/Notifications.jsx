import { useEffect, useState, useRef } from 'react'
import { getActivity } from '../lib/supabase'

const TYPE_CONFIG = {
  comment:    { icon: 'chat_bubble_outline', cls: 'act-comment',   label: 'Comentario'  },
  status:     { icon: 'swap_horiz',          cls: 'act-status',    label: 'Estado'      },
  milestone:  { icon: 'flag',                cls: 'act-milestone', label: 'Hito'        },
  assignment: { icon: 'person_add',          cls: 'act-assign',    label: 'Asignación'  },
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60)    return 'Ahora'
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function Notifications({ onClose }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [read, setRead]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('alp_read') || '[]') } catch { return [] }
  })
  const panelRef = useRef(null)

  useEffect(() => {
    getActivity(20).then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }, [])

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function markAllRead() {
    const ids = items.map(i => i.id)
    localStorage.setItem('alp_read', JSON.stringify(ids))
    setRead(ids)
  }

  function markRead(id) {
    const next = [...read, id]
    localStorage.setItem('alp_read', JSON.stringify(next))
    setRead(next)
  }

  const unread = items.filter(i => !read.includes(i.id))

  return (
    <div className="notif-panel" ref={panelRef}>
      {/* Header */}
      <div className="notif-header">
        <div className="notif-title-row">
          <span className="notif-title">Notificaciones</span>
          {unread.length > 0 && (
            <span className="notif-count">{unread.length} nuevas</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {unread.length > 0 && (
            <button className="notif-action-btn" onClick={markAllRead}>
              Marcar todas como leídas
            </button>
          )}
          <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}>
            <span className="mat-icon" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="notif-body">
        {loading ? (
          <div className="notif-empty">
            <span className="mat-icon spin" style={{ fontSize: 28 }}>refresh</span>
          </div>
        ) : items.length === 0 ? (
          <div className="notif-empty">
            <span className="mat-icon" style={{ fontSize: 36, marginBottom: 8 }}>notifications_none</span>
            <span>Sin notificaciones</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              La actividad del equipo aparecerá aquí
            </span>
          </div>
        ) : (
          <div className="notif-list">
            {items.map(item => {
              const cfg  = TYPE_CONFIG[item.type] || TYPE_CONFIG.comment
              const isUnread = !read.includes(item.id)
              return (
                <div
                  key={item.id}
                  className={`notif-item ${isUnread ? 'unread' : ''}`}
                  onClick={() => markRead(item.id)}
                >
                  {isUnread && <span className="unread-dot" />}
                  <div className={`activity-icon ${cfg.cls}`} style={{ width: 32, height: 32, flexShrink: 0 }}>
                    <span className="mat-icon" style={{ fontSize: 15 }}>{cfg.icon}</span>
                  </div>
                  <div className="notif-item-body">
                    <div className="notif-item-text">
                      {item.actor_name && <strong>{item.actor_name} </strong>}
                      {item.content}
                      {item.project_name && (
                        <span className="notif-project"> · {item.project_name}</span>
                      )}
                    </div>
                    <div className="notif-item-meta">
                      <span className="notif-type-badge">{cfg.label}</span>
                      <span className="notif-time">{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="notif-footer">
          <button className="notif-action-btn notif-footer-btn" onClick={onClose}>
            Ver toda la actividad en Dashboard
            <span className="mat-icon" style={{ fontSize: 14 }}>arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  )
}
