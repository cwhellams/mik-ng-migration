import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import type { RegisterRequest } from '../../../src/routes/auth/schema.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/members/api.ts'
import {
  MIKLang,
  MIKMemberTypes,
  MIKPermissions,
  PrimaryMotivation,
  PilotLicenceType,
  AircraftRating,
  type Member,
  type MemberListFilters,
  type MemberListResponse,
  type MemberRole,
  type MemberRolesResponse,
} from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import type { Upsert } from '../../../src/types/schema.ts'
import { deleteSimplbooksOutbox } from '../../db/__helpers__/simplbooksDbHelpers.ts'
import { HttpStatusCode } from 'axios'
import { db } from '../../../src/db/connection.ts'
import { addMember } from '../../../src/db/member-queries.ts'
import { generateMagicLinkToken } from '../../../src/routes/auth/magiclink.ts'
import { createPendingEmailChange } from '../../../src/db/email-change-queries.ts'
import { insertBooking, getBookings } from '../../../src/db/booking-queries.ts'
import { BookingStatus, BookingType } from '../../../src/routes/bookings/models.ts'
import dayjs from 'dayjs'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/members', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: ['ADMIN'],
  permissions: [MIKPermissions.MEMBER_ADMIN],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: ['MEMBER'],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

const noPermissionsToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Korhonen',
  email: 'no-permissions@mik.fi',
  roles: ['MEMBER'],
  permissions: [],
  canMakeReservations: false,
})

const missingUserToken = generateAccessToken({
  memberId: 'Iceman99',
  lastName: 'Unknown',
  email: 'no-permissions@mik.fi',
  roles: ['MEMBER'],
  permissions: [],
  canMakeReservations: false,
})

const post = async (payload: Upsert<MemberRole>, token: string) =>
  request(app).post(`/members/roles`).set('Cookie', `accessToken=${token}`).send(payload)

const remove = async (id: string, token: string) =>
  request(app).delete(`/members/roles/${id}`).set('Cookie', `accessToken=${token}`).send({})

describe('GET /members', () => {
  const query = async (token: string, query?: MemberListFilters) => {
    const response = await request(app)
      .get('/members')
      .set('Cookie', `accessToken=${token}`)
      .query(query ?? {})

    expect(response.status).toBe(200)

    return response.body as MemberListResponse
  }

  test.each([
    [1, memberToken],
    [2, adminToken],
  ])('should return 200 without search filters for user id %d', async (_memberId, token) => {
    const members = await query(token)
    members.members = members.members.sort((a, b) => a.memberId.localeCompare(b.memberId))

    expect(members).toMatchSnapshot({
      members: members.members.map((member) => ({
        ...member,
        ...(member.memberSince !== undefined ? { memberSince: expect.any(String) } : {}),
      })),
    })
  })

  it('should return approved prefix matches with name filter', async () => {
    const membersQry = await query(adminToken, {
      name: 'an',
    })

    expect(membersQry.members.map((m) => m.first)).toEqual(['Antti'])
    expect(membersQry.members.map((m) => m.last)).toEqual(['Heikkinen'])
  })

  it('should return unapproved prefix matches with name filter', async () => {
    const membersQry = await query(adminToken, {
      name: 'an',
      showUnapproved: true,
    })

    expect(membersQry.members.map((m) => m.first)).toEqual(['Anna'])
    expect(membersQry.members.map((m) => m.last)).toEqual(['Mäkinen'])
  })

  it('should return empty list with non-existing name filter', async () => {
    const membersQry = await query(memberToken, {
      name: 'sdfoisusdfj',
    })

    expect(membersQry.members).toEqual([])
  })

  it('should include city or town information in member list', async () => {
    const membersQry = await query(memberToken)

    expect(membersQry.members.every((member) => 'townCity' in member)).toBe(true)
  })

  it('should include admin-only attributes for member admins', async () => {
    const membersQry = await query(adminToken)
    const member = membersQry.members.find((m) => m.memberId === 'Matti1')

    expect(member).toMatchObject({
      memberSince: expect.any(String),
      isTrainingProgramPilot: expect.any(Boolean),
      canMakeReservations: expect.any(Boolean),
      automaticBillingStatus: expect.any(Boolean),
      autoRenewAnnualMembership: expect.any(Boolean),
      autoRenewEquipmentFee: expect.any(Boolean),
    })
  })

  it('should not include admin-only attributes for regular members', async () => {
    const membersQry = await query(memberToken)
    const member = membersQry.members[0]

    expect(member).not.toHaveProperty('memberSince')
    expect(member).not.toHaveProperty('isTrainingProgramPilot')
    expect(member).not.toHaveProperty('canMakeReservations')
    expect(member).not.toHaveProperty('automaticBillingStatus')
    expect(member).not.toHaveProperty('autoRenewAnnualMembership')
    expect(member).not.toHaveProperty('autoRenewEquipmentFee')
  })

  it('should search by public role as a member', async () => {
    const membersQry = await query(memberToken, {
      role: 'INSTRUCTOR',
    })
    expect(membersQry.members.map(({ first, last, roles }) => ({ first, last, roles }))).toEqual([
      {
        first: 'Antti',
        last: 'Heikkinen',
        roles: ['INSTRUCTOR', 'MEMBER'],
      },
      {
        first: 'Jukka',
        last: 'Nieminen',
        roles: ['INSTRUCTOR'],
      },
      {
        first: 'Matti',
        last: 'Virtanen',
        roles: ['INSTRUCTOR', 'MEMBER'],
      },
    ])
  })

  it('should search by multiple public roles as a member', async () => {
    const membersQry = await query(adminToken, {
      role: ['INSTRUCTOR', 'COMMITTEE'],
    })
    expect(membersQry.members.map(({ first, last, roles }) => ({ first, last, roles }))).toEqual([
      {
        first: 'Antti',
        last: 'Heikkinen',
        roles: ['INSTRUCTOR', 'MEMBER'],
      },
      {
        first: 'Liisa',
        last: 'Korhonen',
        roles: ['ADMIN', 'COMMITTEE', 'SMS_PROCESSOR'],
      },
      {
        first: 'Sanna',
        last: 'Koskinen',
        roles: ['COMMITTEE', 'SMS_PROCESSOR'],
      },
      {
        first: 'Jukka',
        last: 'Nieminen',
        roles: ['INSTRUCTOR'],
      },
      {
        first: 'Matti',
        last: 'Virtanen',
        roles: ['FLYING_MEMBER', 'INSTRUCTOR', 'MEMBER', 'SMS_MANAGER'],
      },
    ])
  })

  it('should skip search by invalid roles', async () => {
    const membersQry = await query(memberToken, {
      role: 'NOT_ROLE',
    })
    expect(membersQry.members.length).toEqual(11)
  })

  it('should skip search by private roles as a member', async () => {
    const membersQry = await query(memberToken, {
      role: 'ADMIN',
    })

    expect(membersQry.members.length).toEqual(11)
  })

  it('should skip search by unapproved roles as a member', async () => {
    const membersQry = await query(memberToken, {
      showUnapproved: true,
    })

    expect(membersQry.members.length).toEqual(11)
  })

  it('should skip search by removed roles as a member', async () => {
    const membersQry = await query(memberToken, {
      showRemoved: true,
    })

    expect(membersQry.members.length).toEqual(11)
  })

  it('should skip search by private roles as a admin without sudo mode', async () => {
    const res = await request(app)
      .get('/members')
      .set('Cookie', `accessToken=${adminToken}`)
      .set('X-Sudo', 'false')
      .query(query ?? {})

    expect(res.status).toBe(200)

    const membersQry = res.body as MemberListResponse
    expect(membersQry.members.length).toEqual(11)
  })

  it('should search by private and approved roles as an admin', async () => {
    const membersQry = await query(adminToken, {
      role: 'ADMIN',
    })

    expect(membersQry.members.map(({ first, last, roles }) => ({ first, last, roles }))).toEqual([
      {
        first: 'Pekka',
        last: 'Hämäläinen',
        roles: ['ADMIN', 'MEMBER'],
      },
      {
        first: 'Liisa',
        last: 'Korhonen',
        roles: ['ADMIN', 'COMMITTEE', 'SMS_PROCESSOR'],
      },
      {
        first: 'John',
        last: 'McDoe',
        roles: ['ADMIN', 'MEMBER'],
      },
    ])
  })

  it('should search by unapproved roles as an admin', async () => {
    const membersQry = await query(adminToken, {
      showUnapproved: true,
    })

    const member = membersQry.members.filter((m) => m.memberId === 'Marja1')
    expect(member).toMatchSnapshot(member.map((m) => ({ ...m, memberSince: expect.any(String) })))
  })

  it('should search by private and unapproved roles as an admin', async () => {
    const membersQry = await query(adminToken, {
      role: ['ADMIN'],
      showUnapproved: true,
    })

    expect(membersQry.members.map(({ first, last, roles }) => ({ first, last, roles }))).toEqual([
      {
        first: 'Kaisa',
        last: 'Laine',
        roles: ['ADMIN'],
      },
    ])
  })
})

describe('GET /members/me', () => {
  const query = async (token: string) =>
    request(app).get('/members/me').set('Cookie', `accessToken=${token}`).query({})

  test.each([[memberToken], [adminToken], [noPermissionsToken]])(
    'should return 200 with valid token for user',
    async (token) => {
      const response = await query(token)

      expect(response.status).toBe(200)

      const member = response.body as Member
      expect(member).toMatchSnapshot({
        memberSince: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        updatedBy: expect.any(String),
        ...(member.emailVerifiedAt ? { emailVerifiedAt: expect.any(String) } : {}),
        ...(token !== adminToken ? { membershipApprovedAt: expect.any(String) } : {}),
        roles: member.roles.map((role) => ({
          ...role,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })),
      })
    },
  )

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).get('/members/1')

    expect(response.status).toBe(401)
  })
  it('Get return 401 if invalid token', async () => {
    const response = await query('invalid_token')
    expect(response.status).toBe(401)
  })

  it('Get return 404 if user is missing', async () => {
    const response = await query(missingUserToken)
    expect(response.status).toBe(404)
  })
})

describe('GET /members/mailing-lists', () => {
  const originalMailingListsEnv = process.env.AIRCRAFT_MAILING_LISTS

  afterEach(() => {
    if (originalMailingListsEnv === undefined) {
      delete process.env.AIRCRAFT_MAILING_LISTS
      return
    }

    process.env.AIRCRAFT_MAILING_LISTS = originalMailingListsEnv
  })

  it('should return parsed mailing lists for authenticated user', async () => {
    process.env.AIRCRAFT_MAILING_LISTS = '10:General list,20:Ops:Team,30'

    const response = await request(app)
      .get('/members/mailing-lists')
      .set('Cookie', `accessToken=${memberToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      { id: '10', name: 'General list' },
      { id: '20', name: 'Ops:Team' },
      { id: '30', name: '30' },
    ])
  })

  it('should return 401 when authorization header is missing', async () => {
    const response = await request(app).get('/members/mailing-lists')

    expect(response.status).toBe(401)
  })
})

describe('PATCH /members/me', () => {
  const patch = async (token: string, payload: Partial<Member>) =>
    request(app).patch('/members/me').set('Cookie', `accessToken=${token}`).send(payload)

  it('should update valid fields', async () => {
    const response = await patch(memberToken, { firstName: 'Teppo' })

    expect(response.status).toBe(200)
    expect(response.body.firstName).toEqual('Teppo')

    // cleanup
    await patch(memberToken, { firstName: 'Matti' })
  })

  it('should clear mustUpdateProfile when saving own profile', async () => {
    await db
      .updateTable('member.register')
      .set({ must_update_profile: true })
      .where('member_id', '=', 'Matti1')
      .execute()

    const response = await patch(memberToken, { firstName: 'Matti' })

    expect(response.status).toBe(200)
    expect((response.body as Member).mustUpdateProfile).toBe(false)

    const member = await db
      .selectFrom('member.register')
      .select('must_update_profile')
      .where('member_id', '=', 'Matti1')
      .executeTakeFirstOrThrow()

    expect(member.must_update_profile).toBe(false)
  })

  it('should NOT clear mustUpdateProfile when saving only non-identity fields', async () => {
    const original = await db
      .selectFrom('member.register')
      .select('ice_contact_name')
      .where('member_id', '=', 'Matti1')
      .executeTakeFirstOrThrow()

    await db
      .updateTable('member.register')
      .set({ must_update_profile: true })
      .where('member_id', '=', 'Matti1')
      .execute()

    // iceContactName is editable via PATCH /me but is not one of the profile
    // identity/contact fields that count as reviewing the profile.
    const response = await patch(memberToken, { iceContactName: 'Emergency Contact' })

    expect(response.status).toBe(200)
    expect((response.body as Member).mustUpdateProfile).toBe(true)

    const member = await db
      .selectFrom('member.register')
      .select('must_update_profile')
      .where('member_id', '=', 'Matti1')
      .executeTakeFirstOrThrow()
    expect(member.must_update_profile).toBe(true)

    // cleanup — restore the flag and the mutated field so shared-DB snapshots elsewhere are unaffected
    await db
      .updateTable('member.register')
      .set({ must_update_profile: false, ice_contact_name: original.ice_contact_name })
      .where('member_id', '=', 'Matti1')
      .execute()
  })

  it('should not update priviledged fields', async () => {
    const response = await patch(memberToken, {
      canMakeReservations: false,
      isTrainingProgramPilot: false,
    })

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/members/me',
      timestamp: expect.any(String),
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: ['canMakeReservations', 'isTrainingProgramPilot'],
          path: [],
        }),
      ]),
    })
  })
})

describe('GET /members/roles', () => {
  const query = async (token: string) =>
    request(app).get('/members/roles').set('Cookie', `accessToken=${token}`).query({})

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).get('/members/roles').query({})

    expect(response.status).toBe(401)
  })
  it('Get return 401 if invalid token', async () => {
    const response = await query('invalid_token')
    expect(response.status).toBe(401)
  })

  it('Get return only public roles without permissions as a member', async () => {
    const response = await query(memberToken)
    expect(response.status).toBe(200)

    const { permissions, roles } = response.body as MemberRolesResponse

    expect(permissions).toEqual([])
    expect(roles.map(({ roleId, permissions }) => ({ roleId, permissions }))).toEqual([
      { permissions: [], roleId: 'CHAIRMAN' },
      { permissions: [], roleId: 'COMMITTEE' },
      { permissions: [], roleId: 'EXAMINER' },
      { permissions: [], roleId: 'INSTRUCTOR' },
      { permissions: [], roleId: 'MEMBER' },
      { permissions: [], roleId: 'PLANE_CAPTAIN' },
      { permissions: [], roleId: 'SECRETARY' },
    ])
  })

  it('Get return all roles and permissions as an admin', async () => {
    const response = await query(adminToken)
    const { permissions, roles } = response.body as MemberRolesResponse

    expect(permissions).toEqual([
      'member',
      'member.admin',
      'flightlog.user',
      'flightlog.admin',
      'booking.user',
      'booking.admin',
      'aircraft.user',
      'aircraft.admin',
      'invoicing.user',
      'invoicing.admin',
      'access_codes.user',
      'access_codes.admin',
      'fuelPrices.user',
      'fuelPrices.admin',
      'document.user',
      'document.admin',
      'sms.processor',
      'sms.manager',
      'outbox.admin',
      'store.user',
      'store.admin',
      'exam.user',
      'exam.admin',
      'dto.user',
      'dto.instructor',
      'dto.admin',
      'events.admin',
      'expense.user',
      'expense.admin',
      'expense.hetu_admin',
      'inventory.user',
      'inventory.admin',
      'ame.user',
      'ame.admin',
      'meeting.user',
      'meeting.admin',
    ])
    expect(roles.map(({ roleId, permissions }) => ({ roleId, permissions }))).toEqual([
      {
        permissions: [
          'member.admin',
          'flightlog.admin',
          'booking.admin',
          'aircraft.admin',
          'access_codes.admin',
          'invoicing.admin',
          'document.admin',
          'outbox.admin',
          'store.admin',
          'fuelPrices.admin',
          'exam.admin',
          'dto.admin',
          'events.admin',
          'expense.admin',
          'inventory.admin',
          'meeting.admin',
          'expense.hetu_admin',
        ],
        roleId: 'ADMIN',
      },
      {
        permissions: [
          'member.admin',
          'flightlog.admin',
          'booking.admin',
          'aircraft.admin',
          'access_codes.admin',
          'invoicing.admin',
          'document.admin',
          'outbox.admin',
          'store.admin',
          'fuelPrices.admin',
          'exam.admin',
          'dto.admin',
          'events.admin',
          'expense.admin',
          'inventory.admin',
          'expense.hetu_admin',
        ],
        roleId: 'CHAIRMAN',
      },
      { permissions: ['access_codes.admin'], roleId: 'COMMITTEE' },
      { permissions: ['dto.instructor'], roleId: 'EXAMINER' },
      {
        permissions: [
          'flightlog.user',
          'booking.user',
          'aircraft.user',
          'access_codes.user',
          'document.user',
          'store.user',
          'fuelPrices.user',
          'dto.user',
          'inventory.user',
          'meeting.user',
        ],
        roleId: 'FLYING_MEMBER',
      },
      { permissions: ['dto.instructor'], roleId: 'INSTRUCTOR' },
      { permissions: ['flightlog.user', 'aircraft.user', 'document.user'], roleId: 'MAINTENANCE' },
      {
        permissions: [
          'member',
          'document.user',
          'store.user',
          'exam.user',
          'dto.user',
          'expense.user',
          'inventory.user',
          'meeting.user',
        ],
        roleId: 'MEMBER',
      },
      {
        permissions: [
          'flightlog.admin',
          'booking.admin',
          'aircraft.admin',
          'access_codes.admin',
          'document.admin',
          'fuelPrices.admin',
        ],
        roleId: 'PLANE_CAPTAIN',
      },
      {
        permissions: ['member.admin', 'flightlog.admin', 'document.admin', 'invoicing.user'],
        roleId: 'SECRETARY',
      },
      { permissions: null, roleId: 'SERVICE' },
      { permissions: ['sms.manager'], roleId: 'SMS_MANAGER' },
      { permissions: ['sms.processor'], roleId: 'SMS_PROCESSOR' },
    ])
  })
})

describe('GET /members/roles/id', () => {
  const query = async (id: string, token: string) =>
    request(app).get(`/members/roles/${id}`).set('Cookie', `accessToken=${token}`).query({})

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).get('/members/roles/ADMIN').query({})

    expect(response.status).toBe(401)
  })
  it('Get return 401 if invalid token', async () => {
    const response = await query('ADMIN', 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Get return 403 as a reqular member', async () => {
    const response = await query('ADMIN', memberToken)
    expect(response.status).toBe(403)
  })

  it('Get return 404 as an admin with unknown role id', async () => {
    const response = await query('NOTFOUND', adminToken)
    expect(response.status).toBe(404)
  })

  it('Get return role as an admin', async () => {
    const response = await query('ADMIN', adminToken)
    const role = response.body as MemberRole

    expect(role).toEqual({
      roleId: 'ADMIN',
      description: 'Administrator with full access',
      name: {
        en: 'Administrator',
        fi: 'Ylläpitäjä',
        sv: 'Administratör',
      },
      isPublic: false,
      permissions: [
        'member.admin',
        'flightlog.admin',
        'booking.admin',
        'aircraft.admin',
        'access_codes.admin',
        'invoicing.admin',
        'document.admin',
        'outbox.admin',
        'store.admin',
        'fuelPrices.admin',
        'exam.admin',
        'dto.admin',
        'events.admin',
        'expense.admin',
        'inventory.admin',
        'meeting.admin',
        'expense.hetu_admin',
      ],
      createdAt: expect.any(String),
      createdBy: 'k1mnimda',
      updatedAt: expect.any(String),
      updatedBy: 'k1mnimda',
    })
  })
})

describe('PATCH /members/roles/id', () => {
  const patch = async (id: string, payload: Partial<Upsert<MemberRole>>, token: string) =>
    request(app).patch(`/members/roles/${id}`).set('Cookie', `accessToken=${token}`).send(payload)

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).patch('/members/roles/ADMIN').send({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await patch('ADMIN', {}, 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Return 403 as a reqular member', async () => {
    const response = await patch('ADMIN', {}, memberToken)
    expect(response.status).toBe(403)
  })

  it('Return 404 as an admin with unknown role id', async () => {
    const response = await patch('NOTFOUND', {}, adminToken)
    expect(response.status).toBe(404)
  })

  it('Patch role as an admin', async () => {
    const response = await patch('ADMIN', { isPublic: true }, adminToken)
    expect(response.status).toBe(200)

    const updatedRole = response.body as MemberRole

    expect(updatedRole.isPublic).toEqual(true)

    const reverted = await patch('ADMIN', { isPublic: false }, adminToken)
    const revertedRole = reverted.body as MemberRole
    expect(revertedRole.isPublic).toEqual(false)
  })
})

describe('POST /members/roles', () => {
  const role: Upsert<MemberRole> = {
    roleId: new Date().getTime().toString(),
    description: 'description',
    isPublic: true,
    name: {
      en: 'English',
      fi: 'Finnish',
      sv: 'Swedish',
    },
    permissions: [MIKPermissions.MEMBER_ADMIN, MIKPermissions.FLIGHTLOG_ADMIN],
  }

  it('Return 401 if no token in authorization header', async () => {
    const response = await request(app).post('/members/roles').send({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await post(role, 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Return 403 as a reqular member', async () => {
    const response = await post(role, memberToken)
    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/members/roles',
      timestamp: expect.any(String),
    })
  })

  it('Post role as an admin', async () => {
    const response = await post(role, adminToken)
    expect(response.status).toBe(200)

    await remove(role.roleId, adminToken)
  })

  it('Return 500 is duplicate role id', async () => {
    const response = await post({ ...role, roleId: 'ADMIN' }, adminToken)
    expect(response.body).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail: 'duplicate key value violates unique constraint \"roles_pkey\"',
      instance: '/members/roles',
      timestamp: expect.any(String),
    })
  })

  it('Return 400 with missing fields', async () => {
    const response = await post(
      { ...role, name: undefined } as unknown as Upsert<MemberRole>,
      adminToken,
    )
    expect(response.status).toBe(400)
  })
})

describe('DELETE /members/roles/id', () => {
  const role: Upsert<MemberRole> = {
    roleId: new Date().getTime().toString(),
    description: 'description',
    isPublic: true,
    name: {
      en: 'English',
      fi: 'Finnish',
      sv: 'Swedish',
    },
    permissions: [MIKPermissions.MEMBER_ADMIN, MIKPermissions.FLIGHTLOG_ADMIN],
  }

  it('Return 401 if no token in authorization header', async () => {
    const response = await request(app).delete('/members/roles/id').send({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await post(role, 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Return 403 as a reqular member', async () => {
    const response = await post(role, memberToken)
    expect(response.status).toBe(403)
  })

  it('Delete role as an admin', async () => {
    await post(role, adminToken)

    const response = await remove(role.roleId, adminToken)
    expect(response.status).toBe(204)
  })

  it('Return 404 if role not found', async () => {
    const response = await remove('NOTFOUND', adminToken)
    expect(response.status).toBe(404)
  })
})

describe('PATCH /members/id', () => {
  const patch = async (id: string, payload: Partial<Member>, token: string) =>
    request(app).patch(`/members/${id}`).set('Cookie', `accessToken=${token}`).send(payload)

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).patch('/members/1').send({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await patch('0', {}, 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Return 403 as a regular member', async () => {
    const response = await patch('0', {}, memberToken)
    expect(response.status).toBe(403)
  })

  it('Return 404 as an admin with unknown member id', async () => {
    const response = await patch('-1', {}, adminToken)
    expect(response.status).toBe(404)
  })

  it('Patch member as an admin', async () => {
    const response = await patch(
      'k1mnimda',
      { firstName: 'Test', isTrainingProgramPilot: true },
      adminToken,
    )
    expect(response.status).toBe(200)

    const updatedRole = response.body as Member

    expect(updatedRole.firstName).toEqual('Test')
    expect(updatedRole.isTrainingProgramPilot).toBe(true)

    const reverted = await patch(
      'k1mnimda',
      { firstName: 'MIK', isTrainingProgramPilot: false },
      adminToken,
    )
    const revertedRole = reverted.body as Member
    expect(revertedRole.firstName).toEqual('MIK')
    expect(revertedRole.isTrainingProgramPilot).toBe(false)
  })

  it('should reject mustUpdateProfile in admin member patch payload', async () => {
    const response = await patch('Matti1', { mustUpdateProfile: true }, adminToken)

    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual([
      {
        code: 'unrecognized_keys',
        keys: ['mustUpdateProfile'],
        path: [],
        message: 'Unrecognized key: "mustUpdateProfile"',
      },
    ])
  })

  describe('canMakeReservations revocation cancels future bookings', () => {
    // Matti1 has canMakeReservations=true in test data (V30__MemberData.sql)
    const testMemberId = 'Matti1'
    const adminJwt = {
      memberId: 'k1mnimda',
      lastName: 'Admin',
      email: 'admin@mik.fi',
      roles: ['ADMIN'] as string[],
      permissions: [MIKPermissions.MEMBER_ADMIN],
      canMakeReservations: false,
    }
    let insertedBookingId: string

    beforeEach(async () => {
      // Insert a future booking for Matti1 using a fixed far-future date for test stability
      const futureStart = dayjs('2030-06-01T10:00:00Z')
      const futureEnd = futureStart.add(1, 'hour')
      const booking = await insertBooking(
        {
          memberId: testMemberId,
          registration: 'OH-STL',
          status: BookingStatus.CONFIRMED,
          type: BookingType.TRAINING,
          startTimeEpoch: futureStart.unix().toString(),
          endTimeEpoch: futureEnd.unix().toString(),
          instructorMemberId: 'k1mnimda',
        },
        adminJwt,
      )
      insertedBookingId = booking.bookingId
    })

    afterEach(async () => {
      // Clean up inserted booking and restore canMakeReservations
      await db.deleteFrom('schedule.bookings').where('booking_id', '=', insertedBookingId).execute()
      await patch(testMemberId, { canMakeReservations: true }, adminToken)
      // Restore any testdata bookings for this member that were cancelled as a side-effect of
      // the true→false canMakeReservations transition (stl*/ihq* are shared testdata used by
      // other test suites and must not be left in a cancelled state).
      await db
        .updateTable('schedule.bookings')
        .set((eb) => ({
          booking_status: BookingStatus.CONFIRMED,
          cancelled_at: null,
          cancelled_by: null,
          description: null,
          // Restore updated_by to the original creator so other tests see clean seed data
          updated_by: eb.ref('created_by'),
        }))
        .where('member_id', '=', testMemberId)
        .where((eb) => eb.or([eb('booking_id', 'like', 'stl%'), eb('booking_id', 'like', 'ihq%')]))
        .where('booking_status', '=', BookingStatus.CANCELLED)
        .execute()
    })

    it('cancels future bookings when canMakeReservations transitions true → false', async () => {
      const bookingsBefore = await getBookings({ memberId: testMemberId })
      expect(bookingsBefore.some((b) => b.bookingId === insertedBookingId)).toBe(true)

      const response = await patch(testMemberId, { canMakeReservations: false }, adminToken)
      expect(response.status).toBe(200)
      expect((response.body as Member).canMakeReservations).toBe(false)

      const bookingsAfter = await getBookings({ memberId: testMemberId })
      expect(bookingsAfter.some((b) => b.bookingId === insertedBookingId)).toBe(false)
    })

    it('does not cancel future bookings when canMakeReservations stays true', async () => {
      const bookingsBefore = await getBookings({ memberId: testMemberId })
      expect(bookingsBefore.some((b) => b.bookingId === insertedBookingId)).toBe(true)

      const response = await patch(testMemberId, { canMakeReservations: true }, adminToken)
      expect(response.status).toBe(200)

      const bookingsAfter = await getBookings({ memberId: testMemberId })
      expect(bookingsAfter.some((b) => b.bookingId === insertedBookingId)).toBe(true)
    })

    it('does not cancel future bookings when canMakeReservations is already false', async () => {
      // First revoke access via true → false transition
      await patch(testMemberId, { canMakeReservations: false }, adminToken)

      // Insert a second future booking directly via the DB layer to simulate an edge case
      // where a booking exists for a member whose access is already revoked (e.g. created
      // by an admin on their behalf). A subsequent false → false PATCH must not cancel it.
      const futureStart = dayjs('2030-06-02T10:00:00Z')
      const futureEnd = futureStart.add(1, 'hour')
      const secondBooking = await insertBooking(
        {
          memberId: testMemberId,
          registration: 'OH-IHQ',
          status: BookingStatus.CONFIRMED,
          type: BookingType.TRAINING,
          startTimeEpoch: futureStart.unix().toString(),
          endTimeEpoch: futureEnd.unix().toString(),
          instructorMemberId: 'k1mnimda',
        },
        adminJwt,
      )

      try {
        // Patching false → false should not trigger cancellation
        const response = await patch(testMemberId, { canMakeReservations: false }, adminToken)
        expect(response.status).toBe(200)

        const bookingsAfter = await getBookings({ memberId: testMemberId })
        expect(bookingsAfter.some((b) => b.bookingId === secondBooking.bookingId)).toBe(true)
      } finally {
        await db
          .deleteFrom('schedule.bookings')
          .where('booking_id', '=', secondBooking.bookingId)
          .execute()
      }
    })
  })
})

describe('POST /members/must-update-profile', () => {
  const memberIds = ['Matti1', 'Liisa1']

  const postBulk = async (
    body: { memberIds?: string[]; mustUpdateProfile?: boolean },
    token?: string,
  ) => {
    const req = request(app).post('/members/must-update-profile').send(body)
    return token ? req.set('Cookie', `accessToken=${token}`) : req
  }

  const flags = async () =>
    db
      .selectFrom('member.register')
      .select(['member_id', 'must_update_profile'])
      .where('member_id', 'in', memberIds)
      .execute()

  afterEach(async () => {
    await db
      .updateTable('member.register')
      .set({ must_update_profile: false })
      .where('member_id', 'in', memberIds)
      .execute()
  })

  it('should return 401 without auth', async () => {
    const response = await postBulk({ memberIds, mustUpdateProfile: true })
    expect(response.status).toBe(401)
  })

  it('should return 403 for a regular member', async () => {
    const response = await postBulk({ memberIds, mustUpdateProfile: true }, memberToken)
    expect(response.status).toBe(403)
  })

  it('should return 400 for an empty memberIds array', async () => {
    const response = await postBulk({ memberIds: [], mustUpdateProfile: true }, adminToken)
    expect(response.status).toBe(400)
  })

  it('should let an admin set and clear mustUpdateProfile for many members', async () => {
    const setResponse = await postBulk({ memberIds, mustUpdateProfile: true }, adminToken)
    expect(setResponse.status).toBe(200)
    expect(setResponse.body).toEqual({ updated: memberIds.length })

    const afterSet = await flags()
    expect(afterSet.every((m) => m.must_update_profile === true)).toBe(true)

    const clearResponse = await postBulk({ memberIds, mustUpdateProfile: false }, adminToken)
    expect(clearResponse.status).toBe(200)
    expect(clearResponse.body).toEqual({ updated: memberIds.length })

    const afterClear = await flags()
    expect(afterClear.every((m) => m.must_update_profile === false)).toBe(true)
  })

  it('should set the flag for a single member (one-element array)', async () => {
    const response = await postBulk({ memberIds: ['Matti1'], mustUpdateProfile: true }, adminToken)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: 1 })

    const member = await db
      .selectFrom('member.register')
      .select('must_update_profile')
      .where('member_id', '=', 'Matti1')
      .executeTakeFirstOrThrow()
    expect(member.must_update_profile).toBe(true)
  })

  it('should report only the count of members that actually exist', async () => {
    const response = await postBulk(
      { memberIds: ['Matti1', 'NonExistent99'], mustUpdateProfile: true },
      adminToken,
    )
    expect(response.status).toBe(200)
    // NonExistent99 is silently skipped; the caller can detect the shortfall.
    expect(response.body).toEqual({ updated: 1 })
  })
})

describe('GET /members/id', () => {
  const get = async (id: string, token: string) =>
    request(app).get(`/members/${id}`).set('Cookie', `accessToken=${token}`).query({})

  it('Return 401 if no token in authorization header', async () => {
    const response = await request(app).get('/members/0').query({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await get('anything', 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Return 403 as a reqular member', async () => {
    const response = await get('Liisa1', memberToken)
    expect(response.status).toBe(403)
  })

  it('Return 404 if memeber  does not exist', async () => {
    const response = await get('iceman', adminToken)
    expect(response.status).toBe(404)
  })

  it('Get member details as an admin', async () => {
    const response = await get('k1mnimda', adminToken)
    expect(response.status).toBe(200)

    const member = response.body as Member
    expect(member).toMatchSnapshot({
      memberSince: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      roles: member.roles.map((role) => ({
        ...role,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
  })
})

describe('POST /members', () => {
  beforeEach(async () => {
    await deleteSimplbooksOutbox()
  })

  const post = async (payload: RegisterRequest, token: string) =>
    request(app).post(`/members`).set('Cookie', `accessToken=${token}`).send(payload)

  const remove = async (id: string, token: string) =>
    request(app).delete(`/members/${id}`).set('Cookie', `accessToken=${token}`).send({})

  const email = `${new Date().getTime()}@testdata.com`
  const req: RegisterRequest = {
    memberType: MIKMemberTypes.NONFLYING,
    email,
    firstName: 'first',
    lastName: 'last',
    lang: MIKLang.EN,
    streetAddress: 'street',
    postcode: '00100',
    townCity: 'city',
    country: 'FI',
  }

  it('Return 401 if no token in authorization header', async () => {
    const response = await request(app).post('/members').send({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await post(req, 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Return 403 as a reqular member', async () => {
    const response = await post(req, memberToken)
    expect(response.status).toBe(403)
  })

  it('Create and delete member as an admin', async () => {
    const response = await post(req, adminToken)
    expect(response.status).toBe(200)

    const member = response.body as Member

    await remove(member.memberId, adminToken)
  })

  it('Return 500 with duplicate email', async () => {
    const response = await post({ ...req, email: 'admin@mik.fi' }, adminToken)
    expect(response.body).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail: 'duplicate key value violates unique constraint \"register_email_key\"',
      instance: '/members',
      timestamp: expect.any(String),
    })
  })

  it('Return 400 with missing fields', async () => {
    const response = await post(
      { ...req, firstName: undefined } as unknown as RegisterRequest,
      adminToken,
    )
    expect(response.status).toBe(400)
  })

  it('Create member with applicationData and verify it is stored and returned', async () => {
    const applicationData = {
      totalFlightHours: 150,
      aircraftTypesFlown: 'C172, DA40',
      pilotLicenceType: PilotLicenceType.PPL_A,
      ratings: [AircraftRating.SEP_LAND],
      primaryMotivation: PrimaryMotivation.FLY,
      coverLetter: 'I love flying and want to join MIK.',
      voluntaryWork: 'Yes, I am happy to help.',
      accidentHistory: false,
      criminalRecord: false,
      gdprAccepted: true as const,
    }

    const emailWithAppData = `${new Date().getTime()}-appdata@testdata.com`
    const response = await post({ ...req, email: emailWithAppData, applicationData }, adminToken)
    expect(response.status).toBe(200)

    const member = response.body as Member
    expect(member.applicationData).toMatchObject({
      totalFlightHours: 150,
      aircraftTypesFlown: 'C172, DA40',
      pilotLicenceType: PilotLicenceType.PPL_A,
      ratings: [AircraftRating.SEP_LAND],
      primaryMotivation: PrimaryMotivation.FLY,
      coverLetter: 'I love flying and want to join MIK.',
      voluntaryWork: 'Yes, I am happy to help.',
      accidentHistory: false,
      criminalRecord: false,
      gdprAccepted: true,
    })

    // Verify applicationData is returned when fetching member by ID
    const getResponse = await request(app)
      .get(`/members/${member.memberId}`)
      .set('Cookie', `accessToken=${adminToken}`)

    expect(getResponse.status).toBe(200)
    expect((getResponse.body as Member).applicationData).toMatchObject(applicationData)

    await remove(member.memberId, adminToken)
  })

  it('Create member with accidentHistory=true requires accidentHistoryDetails', async () => {
    const emailForTest = `${new Date().getTime()}-accident@testdata.com`
    const response = await post(
      {
        ...req,
        email: emailForTest,
        applicationData: {
          totalFlightHours: 0,
          aircraftTypesFlown: 'C172',
          primaryMotivation: PrimaryMotivation.LEARN_TO_FLY,
          coverLetter: 'test',
          voluntaryWork: 'yes',
          accidentHistory: true,
          // missing accidentHistoryDetails
          criminalRecord: false,
          gdprAccepted: true,
        },
      },
      adminToken,
    )
    expect(response.status).toBe(400)
  })

  it('Create member with criminalRecord=true requires criminalRecordDetails', async () => {
    const emailForTest = `${new Date().getTime()}-criminal@testdata.com`
    const response = await post(
      {
        ...req,
        email: emailForTest,
        applicationData: {
          primaryMotivation: PrimaryMotivation.FLY,
          coverLetter: 'test',
          voluntaryWork: 'yes',
          accidentHistory: false,
          criminalRecord: true,
          // missing criminalRecordDetails
          gdprAccepted: true as const,
        },
      },
      adminToken,
    )
    expect(response.status).toBe(400)
  })

  it('Create member with pilotLicenceType=OTHER requires pilotLicenceTypeOther', async () => {
    const emailForTest = `${new Date().getTime()}-licence@testdata.com`
    const response = await post(
      {
        ...req,
        email: emailForTest,
        applicationData: {
          pilotLicenceType: PilotLicenceType.OTHER,
          // missing pilotLicenceTypeOther
          primaryMotivation: PrimaryMotivation.FLY,
          coverLetter: 'test',
          voluntaryWork: 'yes',
          accidentHistory: false,
          criminalRecord: false,
          gdprAccepted: true as const,
        },
      },
      adminToken,
    )
    expect(response.status).toBe(400)
  })

  it('Create member with ratings including OTHER requires ratingsOther', async () => {
    const emailForTest = `${new Date().getTime()}-ratings@testdata.com`
    const response = await post(
      {
        ...req,
        email: emailForTest,
        applicationData: {
          ratings: [AircraftRating.OTHER],
          // missing ratingsOther
          primaryMotivation: PrimaryMotivation.FLY,
          coverLetter: 'test',
          voluntaryWork: 'yes',
          accidentHistory: false,
          criminalRecord: false,
          gdprAccepted: true as const,
        },
      },
      adminToken,
    )
    expect(response.status).toBe(400)
  })

  it('Create member with primaryMotivation=OTHER requires motivationOther', async () => {
    const emailForTest = `${new Date().getTime()}-motivation@testdata.com`
    const response = await post(
      {
        ...req,
        email: emailForTest,
        applicationData: {
          primaryMotivation: PrimaryMotivation.OTHER,
          // missing motivationOther
          coverLetter: 'test',
          voluntaryWork: 'yes',
          accidentHistory: false,
          criminalRecord: false,
          gdprAccepted: true as const,
        },
      },
      adminToken,
    )
    expect(response.status).toBe(400)
  })
})

describe('Membership approval tests', () => {
  it('Get unapproved members should return list of members awaiting approval', async () => {
    const response = await request(app)
      .get('/members')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ showUnapproved: true })
    expect(response.status).toBe(200)
    response.body.members = response.body.members.sort(
      (a: { memberId: string }, b: { memberId: string }) => a.memberId.localeCompare(b.memberId),
    )
    expect(response.body.members).toMatchSnapshot(
      response.body.members.map((m: { memberSince?: unknown }) => ({
        ...m,
        memberSince: expect.any(String),
      })),
    )
  })

  it('Get unapproved members by name should return data when member admin', async () => {
    const response = await request(app)
      .get('/members')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ showUnapproved: true, name: 'Kaisa' })
    expect(response.status).toEqual(200)
    expect(response.body.members.length).toEqual(1)
    expect(response.body.members[0].email).toEqual('kaisa.laine@example.com')
  })

  it('Get unapproved members by name should not return when not a member admin', async () => {
    const response = await request(app)
      .get('/members')
      .set('Cookie', `accessToken=${memberToken}`)
      .query({ showUnapproved: true, name: 'Kaisa' })
    expect(response.status).toEqual(200)
    expect(response.body.members.length).toEqual(0)
  })

  it('POST approval should approve a new member by updating the member.register table ', async () => {
    const response = await request(app)
      .post('/members/Marja1/approve')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(HttpStatusCode.Created)

    const member = response.body as Member
    expect(member.membershipApprovedBy).toEqual('k1mnimda')
    expect(member.roles.map((r) => r.roleId)).toEqual(['FLYING_MEMBER', 'MEMBER'])

    //revert changes
    await db
      .updateTable('member.register')
      .set({
        membership_approved_at: null,
        membership_approved_by: null,
      })
      .where('member_id', '=', 'Marja1')
      .execute()
    await db.deleteFrom('member.member_to_roles').where('member_id', '=', 'Marja1').execute()
  })

  it('POST approval should return not found when member does not exist', async () => {
    const response = await request(app)
      .post('/members/Brewster/approve')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(HttpStatusCode.InternalServerError)
  })

  it('POST approval should not be allowed for non admin users', async () => {
    const response = await request(app)
      .post('/members/Marja1/approve')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(response.status).toBe(HttpStatusCode.Forbidden)
  })
})
describe('Set language tests', () => {
  it('Updates the language', async () => {
    const response = await request(app)
      .patch('/members/me/lang')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ lang: 'en' })
    expect(response.status).toBe(200)

    const undoResponse = await request(app)
      .patch('/members/me/lang')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ lang: 'fi' })

    expect(undoResponse.status).toBe(200)
  })
})

describe('GET /members/trash', () => {
  it('should return removed members when admin', async () => {
    const response = await request(app)
      .get('/members/trash')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body.members).toBeDefined()
    expect(Array.isArray(response.body.members)).toBe(true)
  })

  it('should return 403 when non-admin tries to access trash', async () => {
    const response = await request(app)
      .get('/members/trash')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(response.status).toBe(HttpStatusCode.Forbidden)
  })
})

describe('POST /members/:memberId/restore', () => {
  it('should return 404 when member not found', async () => {
    const response = await request(app)
      .post('/members/NonExistent99/restore')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(404)
    expect(response.body.detail).toBe('Member not found')
  })

  it('should return 400 when member is not in removed state', async () => {
    const response = await request(app)
      .post('/members/Matti1/restore')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('Member is not in removed state')
  })

  it('should return 403 when non-admin tries to restore', async () => {
    const response = await request(app)
      .post('/members/Antti1/restore')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(response.status).toBe(HttpStatusCode.Forbidden)
  })
})

describe('POST /members/:memberId/deactivate', () => {
  it('should return 404 when member not found', async () => {
    const response = await request(app)
      .post('/members/NonExistent99/deactivate')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ reason: 'Test reason' })
    expect(response.status).toBe(404)
    expect(response.body.detail).toBe('Member not found')
  })

  it('should return 403 when non-admin tries to deactivate', async () => {
    const response = await request(app)
      .post('/members/Antti1/deactivate')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ reason: 'Test reason' })
    expect(response.status).toBe(HttpStatusCode.Forbidden)
  })
})

describe('POST /members/me/cancel-membership', () => {
  let cancelMemberId: string
  let cancelMemberToken: string

  beforeAll(async () => {
    cancelMemberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email: `cancel-test-${Date.now()}@test.com`,
      firstName: 'Cancel',
      lastName: 'TestMember',
      lang: MIKLang.FI,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })
    cancelMemberToken = generateAccessToken({
      memberId: cancelMemberId,
      lastName: 'TestMember',
      email: `cancel-test@test.com`,
      roles: ['MEMBER'],
      permissions: [MIKPermissions.MEMBER],
      canMakeReservations: false,
    })
  })

  afterAll(async () => {
    // The member was deactivated (not hard deleted) by the cancel route, clean up the record
    await db.deleteFrom('member.register').where('member_id', '=', cancelMemberId).execute()
  })

  it('should return 404 when authenticated user member not found', async () => {
    const response = await request(app)
      .post('/members/me/cancel-membership')
      .set('Cookie', `accessToken=${missingUserToken}`)
    expect(response.status).toBe(404)
    expect(response.body.detail).toBe('Member not found')
  })

  it('should return 204, even when annual fee has been paid', async () => {
    const response = await request(app)
      .post('/members/me/cancel-membership')
      .set('Cookie', `accessToken=${cancelMemberToken}`)
    expect(response.status).toBe(204)
  })
})

describe('GET /members/annual-membership-stats', () => {
  it('should return membership stats when invoicing admin', async () => {
    const invoicingAdminToken = generateAccessToken({
      memberId: 'k1mnimda',
      lastName: 'Admin',
      email: 'admin@mik.fi',
      roles: ['ADMIN'],
      permissions: [MIKPermissions.INVOICING_ADMIN],
      canMakeReservations: false,
    })

    const response = await request(app)
      .get('/members/annual-membership-stats')
      .set('Cookie', `accessToken=${invoicingAdminToken}`)
    expect(response.status).toBe(HttpStatusCode.Ok)
    expect(response.body).toHaveProperty('totalAutoRenewMembers')
    expect(response.body).toHaveProperty('totalAutoRenewEquipmentFee')
    expect(response.body).toHaveProperty('year')
  })

  it('should return stats for specific year when year query provided', async () => {
    const invoicingAdminToken = generateAccessToken({
      memberId: 'k1mnimda',
      lastName: 'Admin',
      email: 'admin@mik.fi',
      roles: ['ADMIN'],
      permissions: [MIKPermissions.INVOICING_ADMIN],
      canMakeReservations: false,
    })

    const response = await request(app)
      .get('/members/annual-membership-stats')
      .query({ year: '2025' })
      .set('Cookie', `accessToken=${invoicingAdminToken}`)
    expect(response.status).toBe(HttpStatusCode.Ok)
    expect(response.body.year).toBe(2025)
  })

  it('should return 403 when non-invoicing-admin tries to access', async () => {
    const response = await request(app)
      .get('/members/annual-membership-stats')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(response.status).toBe(HttpStatusCode.Forbidden)
  })
})

describe('POST /members/:memberId/approve with migration flag', () => {
  it('should skip sending email when x-mik-migration header is true', async () => {
    const response = await request(app)
      .post('/members/Marja1/approve')
      .set('Cookie', `accessToken=${adminToken}`)
      .set('x-mik-migration', 'true')

    expect(response.status).toBe(HttpStatusCode.Created)
    const member = response.body as Member
    expect(member.roles.length).toBeGreaterThan(0)

    // Cleanup
    await db
      .updateTable('member.register')
      .set({
        membership_approved_at: null,
        membership_approved_by: null,
      })
      .where('member_id', '=', 'Marja1')
      .execute()
    await db.deleteFrom('member.member_to_roles').where('member_id', '=', 'Marja1').execute()
  })
})

describe('DELETE /members/:memberId', () => {
  it('should return 404 when trying to delete non-existent member', async () => {
    const response = await request(app)
      .delete('/members/NonExistent99')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(404)
  })
})

describe('GET /members/non-renewals', () => {
  const query = async (token: string, year?: number) =>
    request(app)
      .get('/members/non-renewals')
      .set('Cookie', `accessToken=${token}`)
      .query(year ? { year } : {})

  it('should return 401 without auth', async () => {
    const response = await request(app).get('/members/non-renewals')
    expect(response.status).toBe(401)
  })

  it('should return 403 for a regular member', async () => {
    const response = await query(memberToken)
    expect(response.status).toBe(403)
  })

  it('should return 200 with the current year for an admin', async () => {
    const response = await query(adminToken)
    expect(response.status).toBe(200)

    const body = response.body
    expect(body).toHaveProperty('members')
    expect(body).toHaveProperty('year')
    expect(Array.isArray(body.members)).toBe(true)
    expect(typeof body.year).toBe('number')
  })

  it('should return 200 when a specific year is provided', async () => {
    const response = await query(adminToken, 2025)
    expect(response.status).toBe(200)
    expect(response.body.year).toBe(2025)
  })

  it('should not include REMOVED members', async () => {
    const response = await query(adminToken)
    expect(response.status).toBe(200)
    const members = response.body.members as Array<{ memberType: string }>
    expect(members.every((m) => m.memberType !== 'REMOVED')).toBe(true)
  })

  it('each member should have the expected fields', async () => {
    const response = await query(adminToken)
    expect(response.status).toBe(200)

    const members = response.body.members as Array<Record<string, unknown>>
    if (members.length > 0) {
      const first = members[0]
      expect(first).toHaveProperty('memberId')
      expect(first).toHaveProperty('firstName')
      expect(first).toHaveProperty('lastName')
      expect(first).toHaveProperty('email')
      expect(first).toHaveProperty('memberType')
      expect(first).toHaveProperty('lang')
      expect(first).toHaveProperty('feeStatus')
      expect(first).toHaveProperty('billableFlightCount')
      expect(typeof first.billableFlightCount).toBe('number')
    }
  })

  it('should return billableFlightCount as 0 for members with no 2026 flights', async () => {
    const response = await query(adminToken, 2026)
    expect(response.status).toBe(200)

    const members = response.body.members as Array<{
      memberId: string
      billableFlightCount: number
    }>
    expect(members.length).toBeGreaterThan(0)
    // Members with no 2026 flights should have billableFlightCount of 0
    const noFlightMembers = members.filter((m) =>
      ['Liisa1', 'Jukka1', 'Antti1'].includes(m.memberId),
    )
    expect(noFlightMembers.length).toBeGreaterThan(0)
    expect(noFlightMembers.every((m) => m.billableFlightCount === 0)).toBe(true)
  })

  it('should return non-zero billableFlightCount for members with 2025 billable flights', async () => {
    const response = await query(adminToken, 2025)
    expect(response.status).toBe(200)

    const members = response.body.members as Array<{
      memberId: string
      billableFlightCount: number
    }>
    // Matti1 has 2 billable flights in V50 test data + 3 in V201 blank row test data + 6 in V203 extended test data + 1 in V220 yoy data = 12
    const matti = members.find((m) => m.memberId === 'Matti1')
    expect(matti).toBeDefined()
    expect(matti!.billableFlightCount).toBe(12)
    // All counts must be non-negative integers
    expect(
      members.every((m) => Number.isInteger(m.billableFlightCount) && m.billableFlightCount >= 0),
    ).toBe(true)
  })
})

describe('POST /members/:memberId/send-renewal-reminder', () => {
  const sendReminder = async (memberId: string, token: string) =>
    request(app)
      .post(`/members/${memberId}/send-renewal-reminder`)
      .set('Cookie', `accessToken=${token}`)

  it('should return 401 without auth', async () => {
    const response = await request(app).post('/members/Matti1/send-renewal-reminder')
    expect(response.status).toBe(401)
  })

  it('should return 403 for a regular member', async () => {
    const response = await sendReminder('Matti1', memberToken)
    expect(response.status).toBe(403)
  })

  it('should return 404 for a non-existent member', async () => {
    const response = await sendReminder('NonExist9', adminToken)
    expect(response.status).toBe(404)
  })

  it('should return 204 and record a REMINDER_SENT action for an admin', async () => {
    const response = await sendReminder('Matti1', adminToken)
    expect(response.status).toBe(204)

    // Verify the action was recorded
    const action = await db
      .selectFrom('member.non_renewal_actions')
      .selectAll()
      .where('member_id', '=', 'Matti1')
      .where('action_type', '=', 'REMINDER_SENT')
      .orderBy('performed_at', 'desc')
      .executeTakeFirst()

    expect(action).toBeDefined()
    expect(action?.performed_by).toBe('k1mnimda')

    // cleanup
    if (action) {
      await db.deleteFrom('member.non_renewal_actions').where('id', '=', action.id).execute()
    }
  })
})

describe('POST /members/me/email-change/request', () => {
  let emailChangeMemberId: string
  let emailChangeMemberToken: string

  beforeAll(async () => {
    emailChangeMemberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email: `email-change-test-${Date.now()}@test.com`,
      firstName: 'EmailChange',
      lastName: 'TestMember',
      lang: MIKLang.EN,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })
    emailChangeMemberToken = generateAccessToken({
      memberId: emailChangeMemberId,
      lastName: 'TestMember',
      email: `email-change-test-${Date.now()}@test.com`,
      roles: ['MEMBER'],
      permissions: [MIKPermissions.MEMBER],
      canMakeReservations: false,
    })
  })

  afterAll(async () => {
    await db
      .deleteFrom('member.pending_email_changes')
      .where('member_id', '=', emailChangeMemberId)
      .execute()
    await db.deleteFrom('member.register').where('member_id', '=', emailChangeMemberId).execute()
  })

  it('should return 401 without auth', async () => {
    const response = await request(app)
      .post('/members/me/email-change/request')
      .send({ newEmail: 'new@test.com' })
    expect(response.status).toBe(401)
  })

  it('should return 400 for invalid email format', async () => {
    const response = await request(app)
      .post('/members/me/email-change/request')
      .set('Cookie', `accessToken=${emailChangeMemberToken}`)
      .send({ newEmail: 'not-an-email' })
    expect(response.status).toBe(400)
  })

  it('should return 400 when new email is same as current email', async () => {
    const member = await db
      .selectFrom('member.register')
      .select('email')
      .where('member_id', '=', emailChangeMemberId)
      .executeTakeFirstOrThrow()
    const response = await request(app)
      .post('/members/me/email-change/request')
      .set('Cookie', `accessToken=${emailChangeMemberToken}`)
      .send({ newEmail: member.email })
    expect(response.status).toBe(400)
  })

  it('should return 409 when new email already in use', async () => {
    const response = await request(app)
      .post('/members/me/email-change/request')
      .set('Cookie', `accessToken=${emailChangeMemberToken}`)
      .send({ newEmail: 'admin@mik.fi' })
    expect(response.status).toBe(409)
  })

  it('should return 204 for a valid new email', async () => {
    const response = await request(app)
      .post('/members/me/email-change/request')
      .set('Cookie', `accessToken=${emailChangeMemberToken}`)
      .send({ newEmail: `new-email-${Date.now()}@test.com` })
    expect(response.status).toBe(204)
  })
})

describe('POST /members/me/email-change/verify', () => {
  let verifyMemberId: string
  let verifyMemberToken: string
  const originalEmail = `verify-test-${Date.now()}@test.com`

  beforeAll(async () => {
    verifyMemberId = await addMember({
      memberType: MIKMemberTypes.FLYING,
      email: originalEmail,
      firstName: 'Verify',
      lastName: 'TestMember',
      lang: MIKLang.EN,
      streetAddress: 'Test Street',
      postcode: '00100',
      townCity: 'Test City',
      country: 'FI',
    })
    verifyMemberToken = generateAccessToken({
      memberId: verifyMemberId,
      lastName: 'TestMember',
      email: originalEmail,
      roles: ['MEMBER'],
      permissions: [MIKPermissions.MEMBER],
      canMakeReservations: false,
    })
  })

  afterAll(async () => {
    await db
      .deleteFrom('member.pending_email_changes')
      .where('member_id', '=', verifyMemberId)
      .execute()
    await db.deleteFrom('member.register').where('member_id', '=', verifyMemberId).execute()
  })

  it('should return 401 without auth', async () => {
    const response = await request(app)
      .post('/members/me/email-change/verify')
      .send({ token: 'any-token' })
    expect(response.status).toBe(401)
  })

  it('should return 400 when token is missing', async () => {
    const response = await request(app)
      .post('/members/me/email-change/verify')
      .set('Cookie', `accessToken=${verifyMemberToken}`)
      .send({})
    expect(response.status).toBe(400)
  })

  it('should return 401 for an invalid/unknown token', async () => {
    const response = await request(app)
      .post('/members/me/email-change/verify')
      .set('Cookie', `accessToken=${verifyMemberToken}`)
      .send({ token: 'invalid-token-value' })
    expect(response.status).toBe(401)
  })

  it('should return 200 and update the email with a valid token', async () => {
    const newEmail = `verified-${Date.now()}@test.com`
    const { token, tokenHash } = generateMagicLinkToken()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    await createPendingEmailChange(verifyMemberId, newEmail, tokenHash, expiresAt)

    const response = await request(app)
      .post('/members/me/email-change/verify')
      .set('Cookie', `accessToken=${verifyMemberToken}`)
      .send({ token })

    expect(response.status).toBe(200)
    expect(response.body.email).toBe(newEmail)
  })

  it('should return 401 for a token that has already been used (replay attack)', async () => {
    const newEmail2 = `verified2-${Date.now()}@test.com`
    const { token, tokenHash } = generateMagicLinkToken()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    await createPendingEmailChange(verifyMemberId, newEmail2, tokenHash, expiresAt)

    // First use should succeed
    await request(app)
      .post('/members/me/email-change/verify')
      .set('Cookie', `accessToken=${verifyMemberToken}`)
      .send({ token })

    // Second use should fail
    const response = await request(app)
      .post('/members/me/email-change/verify')
      .set('Cookie', `accessToken=${verifyMemberToken}`)
      .send({ token })

    expect(response.status).toBe(401)
  })

  it('should return 401 for an expired token', async () => {
    const expiredEmail = `expired-${Date.now()}@test.com`
    const { token, tokenHash } = generateMagicLinkToken()
    const expiresAt = new Date(Date.now() - 1000) // already expired
    await createPendingEmailChange(verifyMemberId, expiredEmail, tokenHash, expiresAt)

    const response = await request(app)
      .post('/members/me/email-change/verify')
      .set('Cookie', `accessToken=${verifyMemberToken}`)
      .send({ token })

    expect(response.status).toBe(401)
  })

  it("should return 401 when using another member's token", async () => {
    const otherEmail = `other-member-${Date.now()}@test.com`
    const { token, tokenHash } = generateMagicLinkToken()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    // Create the token for verifyMemberId
    await createPendingEmailChange(verifyMemberId, otherEmail, tokenHash, expiresAt)

    // Try to use it with a different member's token (memberToken = 'Matti1')
    const response = await request(app)
      .post('/members/me/email-change/verify')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ token })

    // Should fail because member_id in token doesn't match the authenticated user
    expect(response.status).toBe(401)

    // The original token should still be unused (not consumed by the foreign user)
    const pendingRow = await db
      .selectFrom('member.pending_email_changes')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst()
    expect(pendingRow).toBeDefined()
    expect(pendingRow?.used_at).toBeNull()
  })
})

describe('GET /members/:memberId/invoices', () => {
  it('should return 401 without auth', async () => {
    const response = await request(app).get('/members/Matti1/invoices')
    expect(response.status).toBe(401)
  })

  it('should return 403 for a regular member', async () => {
    const response = await request(app)
      .get('/members/Matti1/invoices')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(response.status).toBe(403)
  })

  it('should return 404 for a non-existent member', async () => {
    const response = await request(app)
      .get('/members/NonExistent99/invoices')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(404)
  })

  it('should return invoices for a valid member as admin', async () => {
    const response = await request(app)
      .get('/members/Matti1/invoices')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('invoices')
    expect(Array.isArray(response.body.invoices)).toBe(true)
    expect(
      response.body.invoices.every(
        (invoice: { member_id: string }) => invoice.member_id === 'Matti1',
      ),
    ).toBe(true)
  })
})

describe('GET /members/:memberId/flights', () => {
  it('should return 401 without auth', async () => {
    const response = await request(app).get('/members/Matti1/flights')
    expect(response.status).toBe(401)
  })

  it('should return 403 for a regular member', async () => {
    const response = await request(app)
      .get('/members/Matti1/flights')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(response.status).toBe(403)
  })

  it('should return 404 for a non-existent member', async () => {
    const response = await request(app)
      .get('/members/NonExistent99/flights')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(404)
  })

  it('should return flights for a valid member as admin', async () => {
    const response = await request(app)
      .get('/members/Matti1/flights')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('logs')
    expect(Array.isArray(response.body.logs)).toBe(true)

    const { logs } = response.body
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.length).toBeLessThanOrEqual(10)
  })
})
