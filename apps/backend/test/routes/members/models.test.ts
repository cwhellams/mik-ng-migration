import { MIKPermissions } from '@mik/contracts/members'

describe('getBasicUserRole', () => {
  it('should return MEMBER for MEMBER_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.MEMBER_ADMIN)).toBe(MIKPermissions.MEMBER)
  })

  it('should return FLIGHTLOG_USER for FLIGHTLOG_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.FLIGHTLOG_ADMIN)).toBe(MIKPermissions.FLIGHTLOG_USER)
  })

  it('should return BOOKING_USER for BOOKING_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.BOOKING_ADMIN)).toBe(MIKPermissions.BOOKING_USER)
  })

  it('should return AIRCRAFT_USER for AIRCRAFT_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.AIRCRAFT_ADMIN)).toBe(MIKPermissions.AIRCRAFT_USER)
  })

  it('should return INVOICING_USER for INVOICING_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.INVOICING_ADMIN)).toBe(MIKPermissions.INVOICING_USER)
  })

  it('should return ACCESS_CODES_USER for ACCESS_CODES_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.ACCESS_CODES_ADMIN)).toBe(
      MIKPermissions.ACCESS_CODES_USER,
    )
  })

  it('should return DOCUMENT_USER for DOCUMENT_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.DOCUMENT_ADMIN)).toBe(MIKPermissions.DOCUMENT_USER)
  })

  it('should return EXAM_USER for EXAM_ADMIN', () => {
    expect(getBasicUserRole(MIKPermissions.EXAM_ADMIN)).toBe(MIKPermissions.EXAM_USER)
  })

  it('should return SMS_PROCESSOR for SMS_PROCESSOR (no separate user role)', () => {
    expect(getBasicUserRole(MIKPermissions.SMS_PROCESSOR)).toBe(MIKPermissions.SMS_PROCESSOR)
  })

  it('should return the same permission for non-admin permissions', () => {
    expect(getBasicUserRole(MIKPermissions.MEMBER)).toBe(MIKPermissions.MEMBER)
    expect(getBasicUserRole(MIKPermissions.FLIGHTLOG_USER)).toBe(MIKPermissions.FLIGHTLOG_USER)
    expect(getBasicUserRole(MIKPermissions.BOOKING_USER)).toBe(MIKPermissions.BOOKING_USER)
  })
})
function getBasicUserRole(permission: MIKPermissions): MIKPermissions {
  const adminToUserMap: Record<string, MIKPermissions> = {
    [MIKPermissions.MEMBER_ADMIN]: MIKPermissions.MEMBER,
    [MIKPermissions.FLIGHTLOG_ADMIN]: MIKPermissions.FLIGHTLOG_USER,
    [MIKPermissions.BOOKING_ADMIN]: MIKPermissions.BOOKING_USER,
    [MIKPermissions.AIRCRAFT_ADMIN]: MIKPermissions.AIRCRAFT_USER,
    [MIKPermissions.INVOICING_ADMIN]: MIKPermissions.INVOICING_USER,
    [MIKPermissions.ACCESS_CODES_ADMIN]: MIKPermissions.ACCESS_CODES_USER,
    [MIKPermissions.DOCUMENT_ADMIN]: MIKPermissions.DOCUMENT_USER,
    [MIKPermissions.EXAM_ADMIN]: MIKPermissions.EXAM_USER,
  }

  return adminToUserMap[permission] ?? permission
}
