import {
  Member,
  MemberRolesResponse,
  MIKPermissions,
} from '@backend/routes/members/models'
import useApi from './useApi'
import { AxiosError } from 'axios'
import { ErrorResponse } from '@backend/routes/response'

export function useRoles(): {
  isLoading: boolean
  isMember: boolean
  isMembersAdmin: boolean
  isAircraftAdmin: boolean
  roles: MemberRolesResponse['roles']
  permissions: MemberRolesResponse['permissions']
  error: AxiosError<ErrorResponse> | undefined
} {
  const { data, isLoading } = useApi<Member | null>({
    url: 'v1/members/me',
    allowUnauthenticated: true,
  })

  const { data: rolesData, error } = useApi<MemberRolesResponse>({
    url: 'v1/members/roles',
  })

  const withPermission = (permission: MIKPermissions) =>
    data?.roles.some((role) => role.permissions?.includes(permission)) ?? false

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
