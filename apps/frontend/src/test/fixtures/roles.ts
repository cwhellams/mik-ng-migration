import {
  MIKPermissions,
  type MemberRole,
  type MemberRolesResponse,
} from '@backend/routes/members/models'

import { auditFields } from './cast'

type LocalizedName = MemberRole['name']

const aRole = (
  roleId: string,
  name: LocalizedName,
  permissions: MIKPermissions[],
  {
    isPublic = false,
    description = null,
  }: { isPublic?: boolean; description?: string | null } = {},
): MemberRole => ({
  roleId,
  description,
  name,
  isPublic,
  permissions,
  ...auditFields(),
})

/**
 * The club's real roles, with the permission sets seeded by
 * `sql/schema/migration/V75__AddDefaultMemberRoles.sql`. Only the roles that
 * carry permissions are modelled here — permission-free roles (COMMITTEE,
 * EXAMINER, ...) can be added when a test needs them.
 */
export const ADMIN_ROLE = aRole(
  'ADMIN',
  { en: 'Administrator', fi: 'Ylläpitäjä', sv: 'Administratör' },
  [
    MIKPermissions.MEMBER_ADMIN,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.BOOKING_ADMIN,
    MIKPermissions.AIRCRAFT_ADMIN,
    MIKPermissions.ACCESS_CODES_ADMIN,
    MIKPermissions.INVOICING_ADMIN,
    MIKPermissions.DOCUMENT_ADMIN,
  ],
  { description: 'Administrator with full access' },
)

export const MEMBER_ROLE = aRole(
  'MEMBER',
  { en: 'Member', fi: 'Jäsen', sv: 'Medlem' },
  [MIKPermissions.MEMBER, MIKPermissions.DOCUMENT_USER],
  { isPublic: true, description: 'MIK member with basic access' },
)

export const FLYING_MEMBER_ROLE = aRole(
  'FLYING_MEMBER',
  { en: 'Flying Member', fi: 'Lento-oikeus', sv: 'Flygande medlem' },
  [
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.BOOKING_USER,
    MIKPermissions.AIRCRAFT_USER,
    MIKPermissions.ACCESS_CODES_USER,
    MIKPermissions.DOCUMENT_USER,
  ],
  { description: 'MIK member with additional flying rights' },
)

export const INSTRUCTOR_ROLE = aRole(
  'INSTRUCTOR',
  { en: 'Instructor', fi: 'Lennonopettaja', sv: 'Flyglärare' },
  [MIKPermissions.DTO_INSTRUCTOR],
  { isPublic: true, description: 'Instructor with permissions to manage training' },
)

export const ALL_ROLES: MemberRole[] = [
  ADMIN_ROLE,
  MEMBER_ROLE,
  FLYING_MEMBER_ROLE,
  INSTRUCTOR_ROLE,
]

/** Every permission the system knows about — the catalogue the roles admin page renders. */
export const ALL_PERMISSIONS: MIKPermissions[] = Object.values(MIKPermissions)

/**
 * A synthetic role carrying exactly the given permissions. Use this when a test
 * cares about a permission rather than about which real role grants it.
 */
export const aRoleWithPermissions = (...permissions: MIKPermissions[]): MemberRole =>
  aRole('TEST_ROLE', { en: 'Test Role', fi: 'Testirooli', sv: 'Testroll' }, permissions)

/** Response of `GET /api/v1/members/roles` — the catalogue, not the caller's own roles. */
export const aMemberRolesResponse = (
  overrides: Partial<MemberRolesResponse> = {},
): MemberRolesResponse => ({
  roles: ALL_ROLES,
  permissions: ALL_PERMISSIONS,
  ...overrides,
})
