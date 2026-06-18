import { useEffect, useState, useCallback } from 'react'
import { getPlanStatus } from '../lib/supabase'

function formatCLP(value) {
  return !value ? 'Gratis' : `$${value.toLocaleString('es-CL')}/mes`
}

export default function PlanLimitBanner({ refreshKey, onGoToPlans }) {
  const [status, setStatus] = useState(null)

  const refresh = useCallback(() => {
    getPlanStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  if (!status || (!status.near_limit && !status.at_limit)) return null

  return (
    <div className={`plan-banner ${status.at_limit ? 'plan-banner--limit' : 'plan-banner--warning'}`}>
      <span>
        Ya tienes <strong>{status.current_projects}</strong> de <strong>{status.max_projects}</strong> proyectos en tu plan {status.plan_name}.
        {status.next_plan && (
          <> Te recomendamos subir a <strong>{status.next_plan.name}</strong> ({formatCLP(status.next_plan.price_clp)}) para no perder funcionalidades.</>
        )}
      </span>
      <button onClick={onGoToPlans}>Ver planes</button>
    </div>
  )
}
