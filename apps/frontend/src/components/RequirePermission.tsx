import { ReactNode } from 'react'
import { MIKPermissions } from '@mik/contracts/members'
import { useRoles } from '../hooks/useRoles'
import { useThemeMode } from '../theme/ThemeContext'
import Forbidden from '../sections/error/Forbidden'

interface RequirePermissionProps {
  permissions: MIKPermissions[]
  adminModeOnly?: boolean
  children: ReactNode
}

const RequirePermission = ({ permissions, adminModeOnly, children }: RequirePermissionProps) => {
  const { hasAccess, isLoading } = useRoles()
  const { sudo } = useThemeMode()

  if (isLoading) {
    return null
  }

  const authorized = (!adminModeOnly || sudo) && hasAccess(...permissions)

  if (!authorized) {
    return <Forbidden />
  }

  return <>{children}</>
}

export default RequirePermission
