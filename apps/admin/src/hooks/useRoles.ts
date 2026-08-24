import { MemberRole, MemberRolesResponse, MIKPermissions } from '@mik/contracts/members'
import useApi from './useApi'
import { Problem } from '@mik/contracts/problem'
import { useMe } from './useMe'
import { endpoints } from '../api/endpoints'

/**
 * Permissions for the signed-in admin.
 *
 * In the admin app there is no sudo toggle — entering the admin app is the
 * deliberate admin-intent step. `hasAccess` and `hasSudoAccess` are equivalent
 * here: both check whether the member holds the permission.
 */
export function useRoles(): {
  me: ReturnType<typeof useMe>['me']
  hasAccess: (...permission: MIKPermissions[]) => boolean
  hasSudoAccess: (...permission: MIKPermissions[]) => boolean
  isLoading: boolean
  isMembersAdmin: boolean
  isAircraftAdmin: boolean
  isFlightLogAdmin: boolean
  isAccessCodesAdmin: boolean
  isBookingAdmin: boolean
  isSMSManager: boolean
  roles: MemberRole[]
  permissions: MIKPermissions[]
  error: Problem | undefined
} {
  const { me, isLoading } = useMe()

  const { data: rolesData, error } = useApi<MemberRolesResponse>(
    { url: endpoints.members.roles },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  const myPermissions = me?.roles?.flatMap((r) => r.permissions).filter((r) => !!r) ?? []

  const hasAccess = (...permissions: MIKPermissions[]) =>
    permissions.length === 0 || permissions.some((p) => myPermissions.includes(p))

  // In the admin app, hasSudoAccess === hasAccess (no sudo toggle needed).
  const hasSudoAccess = hasAccess

  return {
    me,
    hasAccess,
    hasSudoAccess,
    isLoading,
    isMembersAdmin: hasAccess(MIKPermissions.MEMBER_ADMIN),
    isAircraftAdmin: hasAccess(MIKPermissions.AIRCRAFT_ADMIN),
    isFlightLogAdmin: hasAccess(MIKPermissions.FLIGHTLOG_ADMIN),
    isAccessCodesAdmin: hasAccess(MIKPermissions.ACCESS_CODES_ADMIN),
    isBookingAdmin: hasAccess(MIKPermissions.BOOKING_ADMIN),
    isSMSManager: hasAccess(MIKPermissions.SMS_MANAGER),
    roles: rolesData?.roles ?? [],
    permissions: rolesData?.permissions ?? [],
    error,
  }
}
