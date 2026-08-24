import { ReactNode } from 'react'
import { MIKPermissions } from '@mik/contracts/members'
import { useRoles } from '@mik/ui/hooks/useRoles'
import Forbidden from '../sections/error/Forbidden'

interface RequirePermissionProps {
  /** At least one of these permissions must be held. Empty array = any authenticated admin. */
  permissions: MIKPermissions[]
  children: ReactNode
}

/**
 * Permission guard for the admin app.
 *
 * Unlike the member app there is no separate "sudo toggle" — entering the admin
 * app is the deliberate admin-intent step. A route renders only if the signed-in
 * user holds at least one of the listed permissions.
 */
const RequirePermission = ({ permissions, children }: RequirePermissionProps) => {
  const { hasAccess, isLoading } = useRoles()

  if (isLoading) {
    return null
  }

  if (!hasAccess(...permissions)) {
    return <Forbidden />
  }

  return <>{children}</>
}

export default RequirePermission
