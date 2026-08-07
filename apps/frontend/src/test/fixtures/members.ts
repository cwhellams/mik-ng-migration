import {
  MIKLang,
  MIKMemberTypes,
  MIKPermissions,
  type Member,
  type MemberList,
  type MemberListResponse,
} from '@backend/routes/members/models'

import {
  ADMIN_MEMBER_ID,
  auditFields,
  INSTRUCTOR_MEMBER_ID,
  MEMBER_ID,
  NO_PERMISSIONS_MEMBER_ID,
} from './cast'
import {
  ADMIN_ROLE,
  aRoleWithPermissions,
  FLYING_MEMBER_ROLE,
  INSTRUCTOR_ROLE,
  MEMBER_ROLE,
} from './roles'

/**
 * Matti Virtanen — the everyman member, mirroring `sql/schema/testdata/V30__MemberData.sql`.
 * Every other member fixture is a variation on this one.
 */
export const aMember = (overrides: Partial<Member> = {}): Member => ({
  memberId: MEMBER_ID,
  memberType: MIKMemberTypes.FLYING,
  email: 'chris.whellams@gmail.com',
  firstName: 'Matti',
  lastName: 'Virtanen',

  phoneNumber: '0401234567',
  phoneCountry: 'FI',
  streetAddress: 'Keskuskatu 1',
  postcode: '00100',
  townCity: 'Helsinki',
  country: 'FI',

  iceContactName: 'Liisa Virtanen',
  iceContactPhoneNumber: '0407654321',
  iceContactPhoneCountry: 'FI',

  licenceId: 'FI.FCL.123456',
  licenceExpiry: '2026-03-20',
  medicalExpiry: '2026-06-01',

  isTrainingProgramPilot: true,
  isMembershipApproved: true,
  canMakeReservations: true,
  billingId: '123',
  dateOfBirth: '1980-01-15',
  memberSince: '2020-01-01',
  lang: MIKLang.FI,
  roles: [MEMBER_ROLE, FLYING_MEMBER_ROLE],
  defaultInstructorMemberId: null,

  ...auditFields(),
  ...overrides,
})

/** `k1mnimda` — the club admin. Carries the real ADMIN role's permission set. */
export const anAdmin = (overrides: Partial<Member> = {}): Member =>
  aMember({
    memberId: ADMIN_MEMBER_ID,
    firstName: 'Klubi',
    lastName: 'Admin',
    email: 'admin@mik.fi',
    lang: MIKLang.EN,
    roles: [MEMBER_ROLE, ADMIN_ROLE],
    ...overrides,
  })

/** `Liisa1` — a member with no permissions at all. The frontend's "403 everywhere" case. */
export const aMemberWithoutPermissions = (overrides: Partial<Member> = {}): Member =>
  aMember({
    memberId: NO_PERMISSIONS_MEMBER_ID,
    firstName: 'Liisa',
    lastName: 'Korhonen',
    email: 'juho.kolehmainen@iki.fi',
    memberType: MIKMemberTypes.JUNIOR,
    isTrainingProgramPilot: false,
    licenceId: null,
    licenceExpiry: null,
    medicalExpiry: null,
    roles: [],
    ...overrides,
  })

/** `Jukka1` — the instructor. */
export const anInstructor = (overrides: Partial<Member> = {}): Member =>
  aMember({
    memberId: INSTRUCTOR_MEMBER_ID,
    firstName: 'Jukka',
    lastName: 'Nieminen',
    email: 'jukka@example.com',
    roles: [MEMBER_ROLE, FLYING_MEMBER_ROLE, INSTRUCTOR_ROLE],
    ...overrides,
  })

/**
 * A member carrying exactly the given permissions and nothing else. Use when a
 * test is about one permission gate rather than about a real club role.
 */
export const aMemberWithPermissions = (
  permissions: MIKPermissions[],
  overrides: Partial<Member> = {},
): Member => aMember({ roles: [aRoleWithPermissions(...permissions)], ...overrides })

/** An entry as returned by `GET /api/v1/members` (a narrower shape than `Member`). */
export const aMemberListEntry = (overrides: Partial<MemberList> = {}): MemberList => ({
  memberId: MEMBER_ID,
  first: 'Matti',
  last: 'Virtanen',
  email: 'chris.whellams@gmail.com',
  phoneNumber: '0401234567',
  townCity: 'Helsinki',
  roles: [MEMBER_ROLE.roleId, FLYING_MEMBER_ROLE.roleId],
  lang: MIKLang.FI,
  memberSince: '2020-01-01',
  isTrainingProgramPilot: true,
  canMakeReservations: true,
  ...overrides,
})

export const aMemberListResponse = (
  members: MemberList[] = [
    aMemberListEntry(),
    aMemberListEntry({
      memberId: INSTRUCTOR_MEMBER_ID,
      first: 'Jukka',
      last: 'Nieminen',
      email: 'jukka@example.com',
      roles: [INSTRUCTOR_ROLE.roleId],
    }),
  ],
): MemberListResponse => ({ members })
