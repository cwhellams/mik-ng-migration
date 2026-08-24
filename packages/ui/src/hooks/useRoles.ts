import {
  type MemberRole,
  type MemberRolesResponse,
  MIKPermissions,
  downgradePermission,
} from '@mik/contracts/members'
import useApi from '@mik/ui/hooks/useApi'
import type { Problem } from '@mik/contracts/problem'
import { useMe } from './useMe'
import { useApiConfig } from './apiConfig'
import { identityEndpoints } from '../api/identity'

/**
 * Permissions and derived access checks for the signed-in member.
 *
 * The two accessors are the general case; the named flags are a convenience for
 * the handful of permissions checked all over the app. #1115 §10 is why there are
 * only six of them: this hook used to export 24, of which seven had no call site
 * at all and nine had five or fewer, so every new permission meant editing a
 * return type, an implementation and a union that nothing read. Reach for
 * `hasSudoAccess(...)` rather than adding a flag — a flag has to earn its place
 * by being checked in a lot of files.
 */
export function useRoles(): {
  me: ReturnType<typeof useMe>['me']

  /** True if the member holds **any** of these permissions, sudo mode or not. */
  hasAccess: (...permission: MIKPermissions[]) => boolean

  /**
   * `hasAccess`, but only while admin mode is on — the client half of the
   * backend's `downgradePermission`, which strips admin permissions from a
   * request sent with `x-sudo: false`. This is what the removed `is<X>Admin`
   * flags each were, so `hasSudoAccess(MIKPermissions.MEETING_ADMIN)` is the
   * direct replacement for `isMeetingAdmin`.
   */
  hasSudoAccess: (...permission: MIKPermissions[]) => boolean

  isLoading: boolean
  isMembersAdmin: boolean
  isAircraftAdmin: boolean
  isFlightLogAdmin: boolean
  isAccessCodesAdmin: boolean
  isBookingAdmin: boolean
  isSMSManager: boolean

  /**
   * Kept as a flag despite only four call sites: the rule is bespoke — an
   * instructor is ungated, a DTO admin is sudo-gated — and inlining it would
   * copy that asymmetry to every caller.
   */
  isDtoInstructor: boolean

  roles: MemberRole[]
  permissions: MIKPermissions[]

  /**
   * True when at least one of the member's permissions changes under
   * `downgradePermission` — i.e. when admin mode would actually do something.
   * `AdminToggle` shows the sudo switch on this.
   */
  sudoers: boolean

  error: Problem | undefined
} {
  const { me, isLoading } = useMe()

  // The same flag `useApi` sends as `x-sudo`, so the UI can never offer an
  // action the request would then be refused for. In `apps/admin` it is a
  // constant `true`, which is exactly that app's rule — reaching it is the
  // deliberate admin-intent step — and is why one implementation serves both.
  const { sudo } = useApiConfig()

  const { data: rolesData, error } = useApi<MemberRolesResponse>(
    {
      url: identityEndpoints.roles,
    },
    {
      // roles do not change often so skip automatic revalidations
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  const myPermissions = me?.roles?.flatMap((r) => r.permissions).filter((r) => !!r) ?? []

  const hasAccess = (...permissions: MIKPermissions[]) =>
    permissions.length === 0 || permissions.some((p) => myPermissions.includes(p))

  const hasSudoAccess = (...permissions: MIKPermissions[]) =>
    sudo ? hasAccess(...permissions) : false

  return {
    me,
    hasAccess,
    hasSudoAccess,
    isLoading,
    isMembersAdmin: hasSudoAccess(MIKPermissions.MEMBER_ADMIN),
    isAircraftAdmin: hasSudoAccess(MIKPermissions.AIRCRAFT_ADMIN),
    isFlightLogAdmin: hasSudoAccess(MIKPermissions.FLIGHTLOG_ADMIN),
    isAccessCodesAdmin: hasSudoAccess(MIKPermissions.ACCESS_CODES_ADMIN),
    isBookingAdmin: hasSudoAccess(MIKPermissions.BOOKING_ADMIN),
    isSMSManager: hasSudoAccess(MIKPermissions.SMS_MANAGER),
    // DTO_INSTRUCTOR is not downgraded outside sudo mode, but DTO_ADMIN is
    isDtoInstructor:
      hasAccess(MIKPermissions.DTO_INSTRUCTOR) || hasSudoAccess(MIKPermissions.DTO_ADMIN),
    roles: rolesData?.roles ?? [],
    permissions: rolesData?.permissions ?? [],
    // user is in sudoers file if the downgraded permission is different
    sudoers: myPermissions.some((p) => p !== downgradePermission(p)),
    error,
  }
}
