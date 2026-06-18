import { useState } from 'react'
import { requestUpgrade } from '../lib/supabase'

function formatCLP(value) {
  return !value ? 'Gratis' : `$${value.toLocaleString('es-CL')}/mes`
}

export default function UpgradePlanModal({ planStatus, onClose }) {
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested]   = useState(false)
  const [error, setError]           = useState('')

  if (!planStatus) return null
  const { plan_name, max_projects, current_projects, next_plan } = planStatus

  async function handleRequestUpgrade() {
    if (!next_plan) return
    setRequesting(true); setError('')
    try {
      await requestUpgrade(next_plan.id)
      setRequested(true)
    } catch (e) {
      setError(e.message || 'No pudimos registrar tu solicitud. Intenta de nuevo.')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Llegaste al límite de tu plan {plan_name}</h2>
          <button className="icon-btn" onClick={onClose}>
            <span className="mat-icon">close</span>
          </button>
        </div>

        <div className="modal-body">
          {requested ? (
            <div className="form-success">
              <span className="mat-icon">check_circle</span>
              Registramos tu solicitud para subir a <strong>{next_plan.name}</strong>. Te contactaremos para activar el pago y habilitar el plan.
            </div>
          ) : (
            <>
              <p>
                Ya tienes <strong>{current_projects}</strong> de <strong>{max_projects}</strong> proyectos permitidos en tu plan actual.
                Para crear un nuevo proyecto, necesitas subir de plan.
              </p>

              {next_plan ? (
                <div className="upgrade-suggestion">
                  <span className="upgrade-label">Te recomendamos</span>
                  <strong>{next_plan.name}</strong>
                  <span>{next_plan.max_projects} proyectos · {formatCLP(next_plan.price_clp)}</span>
                </div>
              ) : (
                <p>Ya estás en el plan más alto disponible. Si necesitas más proyectos, hablemos de un plan Enterprise a medida.</p>
              )}

              {error && <div className="form-error"><span className="mat-icon">error_outline</span>{error}</div>}

              {next_plan && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                  onClick={handleRequestUpgrade}
                  disabled={requesting}
                >
                  {requesting
                    ? <><span className="mat-icon spin">refresh</span> Enviando…</>
                    : <>Quiero subir a {next_plan.name}</>}
                </button>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{requested ? 'Cerrar' : 'Más tarde'}</button>
        </div>
      </div>
    </div>
  )
}
