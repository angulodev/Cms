import { useEffect, useState } from 'react'
import { amIPlatformAdmin } from '../../lib/company'
import PlatformUsersTable from './PlatformUsersTable'
import CompanyMembersList from './CompanyMembersList'
import { Skeleton } from '../UI'

// Punto de entrada de la sección "Usuarios" del módulo de sistema.
// Los super-admin de plataforma ven la tabla global (todos los usuarios
// de Supabase Auth, estilo sys_user). Los admin de empresa normales ven
// solo los miembros de su propia empresa (comportamiento original).
export default function Users({ companyId }) {
  const [checking, setChecking] = useState(true)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  useEffect(() => {
    let active = true
    amIPlatformAdmin()
      .then(result => { if (active) setIsPlatformAdmin(result) })
      .catch(() => {})
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  if (checking) {
    return (
      <div className="screen-content">
        <Skeleton h={300} />
      </div>
    )
  }

  return isPlatformAdmin
    ? <PlatformUsersTable />
    : <CompanyMembersList companyId={companyId} />
}
