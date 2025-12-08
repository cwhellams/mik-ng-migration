import {
  MemberRole,
  MemberRolesResponse,
  MIKPermissions,
} from '@backend/routes/members/models'
import useApi from './useApi'
import { Problem } from '@backend/routes/response'
import { useMe } from './useMe'
import { useThemeMode } from '../theme/ThemeContext'

export function useRoles(): {
  me: ReturnType<typeof useMe>['me']
  hasAccess: (...permission: MIKPermissions[]) => boolean
  isLoading: boolean
  isMembersAdmin: boolean
  isAircraftAdmin: boolean
  isFlightLogAdmin: boolean
  isInvoicingAdmin: boolean
  isAccessCodesAdmin: boolean
  isBookingAdmin: boolean
  isDocumentAdmin: boolean
  isSMSAdmin: boolean
  isSMSTeam: boolean
  roles: MemberRole[]
  permissions: MIKPermissions[]
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

  const myPermissions =
    me?.roles.flatMap((r) => r.permissions).filter((r) => !!r) ?? []

  const hasAccess = (...permissions: MIKPermissions[]) =>
    permissions.length === 0 ||
    permissions.some((p) => myPermissions.includes(p))

  const hasSudoAccess = (permission: MIKPermissions) =>
    sudo ? hasAccess(permission) : false

  return {
    me,
    hasAccess,
    isLoading,
    isMembersAdmin: hasSudoAccess(MIKPermissions.MEMBER_ADMIN),
    isAircraftAdmin: hasSudoAccess(MIKPermissions.AIRCRAFT_ADMIN),
    isFlightLogAdmin: hasSudoAccess(MIKPermissions.FLIGHTLOG_ADMIN),
    isInvoicingAdmin: hasSudoAccess(MIKPermissions.INVOICING_ADMIN),
    isAccessCodesAdmin: hasSudoAccess(MIKPermissions.ACCESS_CODES_ADMIN),
    isBookingAdmin: hasSudoAccess(MIKPermissions.BOOKING_ADMIN),
    isDocumentAdmin: hasSudoAccess(MIKPermissions.DOCUMENT_ADMIN),
    isSMSAdmin: hasSudoAccess(MIKPermissions.SMS_ADMIN),
    isSMSTeam: hasSudoAccess(MIKPermissions.SMS_TEAM),
    roles: rolesData?.roles ?? [],
    permissions: rolesData?.permissions ?? [],
    // user is in sudoers file if they have any admin permission
    sudoers: myPermissions.some((p) => p.endsWith('.admin')),
    error,
  }
}
