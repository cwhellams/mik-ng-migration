import {
  MemberRole,
  MemberRolesResponse,
  MIKPermissions,
  downgradePermission,
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
  isSMSProcessor: boolean
  isSMSManager: boolean
  isOutboxAdmin: boolean
  isStoreAdmin: boolean
  isStoreUser: boolean
  isExamAdmin: boolean
  isExamUser: boolean
  isInventoryAdmin: boolean
  isInventoryUser: boolean
  isAmeAdmin: boolean
  isAmeUser: boolean
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
    },
  )

  const myPermissions = me?.roles?.flatMap((r) => r.permissions).filter((r) => !!r) ?? []

  const hasAccess = (...permissions: MIKPermissions[]) =>
    permissions.length === 0 || permissions.some((p) => myPermissions.includes(p))

  const hasSudoAccess = (permission: MIKPermissions) => (sudo ? hasAccess(permission) : false)

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
    isSMSProcessor: hasSudoAccess(MIKPermissions.SMS_PROCESSOR),
    isSMSManager: hasSudoAccess(MIKPermissions.SMS_MANAGER),
    isOutboxAdmin: hasSudoAccess(MIKPermissions.OUTBOX_ADMIN),
    isStoreAdmin: hasSudoAccess(MIKPermissions.STORE_ADMIN),
    isStoreUser: hasAccess(MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN),
    isExamAdmin: hasSudoAccess(MIKPermissions.EXAM_ADMIN),
    isExamUser: hasAccess(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
    isInventoryAdmin: hasSudoAccess(MIKPermissions.INVENTORY_ADMIN),
    isInventoryUser: hasAccess(MIKPermissions.INVENTORY_USER, MIKPermissions.INVENTORY_ADMIN),
    isAmeAdmin: hasSudoAccess(MIKPermissions.AME_ADMIN),
    isAmeUser: hasAccess(MIKPermissions.AME_USER, MIKPermissions.AME_ADMIN),
    roles: rolesData?.roles ?? [],
    permissions: rolesData?.permissions ?? [],
    // user is in sudoers file if the downgraded permission is different
    sudoers: myPermissions.some((p) => p !== downgradePermission(p)),
    error,
  }
}
