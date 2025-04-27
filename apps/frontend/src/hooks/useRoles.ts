import {
  MemberRolesResponse,
  MIKPermissions,
} from '@backend/routes/members/models'
import useApi from './useApi'
import { Problem } from '@backend/routes/response'
import { useMe } from './useMe'

export function useRoles(): {
  isLoading: boolean
  isMember: boolean
  isMembersAdmin: boolean
  isAircraftAdmin: boolean
  roles: MemberRolesResponse['roles']
  permissions: MemberRolesResponse['permissions']
  error: Problem | undefined
} {
  const { me, isLoading } = useMe()

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
    me?.roles.some((role) => role.permissions?.includes(permission)) ?? false

  return {
    isLoading,
    isMember: withPermission(MIKPermissions.MEMBER),
    isMembersAdmin: withPermission(MIKPermissions.MEMBER_ADMIN),
    isAircraftAdmin: withPermission(MIKPermissions.AIRCRAFT_ADMIN),
    roles: rolesData?.roles ?? [],
    permissions: rolesData?.permissions ?? [],
    error,
  }
}
