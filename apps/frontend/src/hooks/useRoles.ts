import {
  MemberRolesResponse,
  MIKPermissions,
} from '@backend/routes/members/models'
import useApi from './useApi'
import { Problem } from '@backend/routes/response'
import { useMe } from './useMe'
import { useThemeMode } from '../theme/ThemeContext'

export function useRoles(): {
  isLoading: boolean
  isMember: boolean
  isMembersAdmin: boolean
  isAircraftAdmin: boolean
  isFlightLogAdmin: boolean
  roles: MemberRolesResponse['roles']
  permissions: MemberRolesResponse['permissions']
  sudoers: boolean
  error: Problem | undefined
} {
  const { me, isLoading } = useMe()

  const { sudo } = useThemeMode()

  const { data: rolesData, error } = useApi<MemberRolesResponse>(
    {
      url: 'v1/members/roles',
    },
    {
      // roles do not change often so skip automatic revalidations
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const withPermission = (permission: MIKPermissions) =>
    (sudo &&
      me?.roles.some((role) => role.permissions?.includes(permission))) ??
    false

  return {
    isLoading,
    isMember: withPermission(MIKPermissions.MEMBER),
    isMembersAdmin: withPermission(MIKPermissions.MEMBER_ADMIN),
    isAircraftAdmin: withPermission(MIKPermissions.AIRCRAFT_ADMIN),
    isFlightLogAdmin: withPermission(MIKPermissions.FLIGHTLOG_ADMIN),
    roles: rolesData?.roles ?? [],
    permissions: rolesData?.permissions ?? [],
    // user is in sudoers file if they have any admin permission
    sudoers:
      me?.roles.some((role) =>
        role.permissions?.some((p) => p.endsWith('.admin'))
      ) ?? false,
    error,
  }
}
