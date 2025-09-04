import 'dotenv/config'
import express from 'express'
import request from 'supertest'

import type { RegisterRequest } from '../../../src/routes/auth/schema.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/members/api.ts'
import {
  MIKLang,
  MIKMemberTypes,
  MIKPermissions,
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

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/members', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  email: 'admin@mik.fi',
  permissions: [MIKPermissions.MEMBER_ADMIN],
})

const memberToken = generateAccessToken({
  memberId: 'Matti1',
  email: 'member@mik.fi',
  permissions: [MIKPermissions.MEMBER],
})

const noPermissionsToken = generateAccessToken({
  memberId: 'Liisa1',
  email: 'no-permissions@mik.fi',
  permissions: [],
})

const missingUserToken = generateAccessToken({
  memberId: 'Iceman99',
  email: 'no-permissions@mik.fi',
  permissions: [],
})

const post = async (payload: Upsert<MemberRole>, token: string) =>
  request(app).post(`/members/roles`).set('Authorization', `Bearer ${token}`).send(payload)

const remove = async (id: string, token: string) =>
  request(app).delete(`/members/roles/${id}`).set('Authorization', `Bearer ${token}`).send({})

describe('GET /members', () => {
  const query = async (token: string, query?: MemberListFilters) => {
    const response = await request(app)
      .get('/members')
      .set('Authorization', `Bearer ${token}`)
      .query(query ?? {})

    expect(response.status).toBe(200)

    return response.body as MemberListResponse
  }

  test.each([
    [1, memberToken],
    [2, adminToken],
  ])('should return 200 without search filters for user id %d', async (_memberId, token) => {
    const members = await query(token)

    expect(members).toMatchSnapshot()
  })

  it('should return prefix matches with name filter', async () => {
    const membersQry = await query(adminToken, {
      name: 'an',
      isMembershipApproved: undefined,
    })

    expect(membersQry.members.map(m => m.first)).toEqual(['Antti', 'Anna'])
    expect(membersQry.members.map(m => m.last)).toEqual(['Heikkinen', 'Mäkinen'])
  })

  it('should return empty list with non-existing name filter', async () => {
    const membersQry = await query(memberToken, {
      name: 'sdfoisusdfj',
    })

    expect(membersQry.members).toEqual([])
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
      isMembershipApproved: undefined,
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
        roles: ['ADMIN', 'COMMITTEE'],
      },
      {
        first: 'Sanna',
        last: 'Koskinen',
        roles: ['COMMITTEE'],
      },
      {
        first: 'Anna',
        last: 'Mäkinen',
        roles: ['COMMITTEE'],
      },
      {
        first: 'Jukka',
        last: 'Nieminen',
        roles: ['INSTRUCTOR'],
      },
      {
        first: 'Matti',
        last: 'Virtanen',
        roles: ['FLYING_MEMBER', 'INSTRUCTOR', 'MEMBER'],
      },
    ])
  })

  it('should skip search by invalid roles', async () => {
    const membersQry = await query(memberToken, {
      role: 'NOT_ROLE',
    })
    expect(membersQry.members.length).toEqual(7)
  })

  it('should skip search by private roles as a member', async () => {
    const membersQry = await query(memberToken, {
      role: 'ADMIN',
      isMembershipApproved: undefined,
    })

    expect(membersQry.members.length).toEqual(7)
  })

  it('should skip search by unapproved roles as a member', async () => {
    const membersQry = await query(memberToken, {
      role: 'null',
      isMembershipApproved: true,
    })

    expect(membersQry.members.length).toEqual(7)
  })

  it('should skip search by private roles as a admin without sudo mode', async () => {
    const res = await request(app)
      .get('/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Sudo', 'false')
      .query(query ?? {})

    expect(res.status).toBe(200)

    const membersQry = res.body as MemberListResponse
    expect(membersQry.members.length).toEqual(7)
  })

  it('should search by private roles as an admin', async () => {
    const membersQry = await query(adminToken, {
      role: 'ADMIN',
    })

    expect(membersQry.members.map(({ first, last, roles }) => ({ first, last, roles }))).toEqual([
      {
        first: 'MIK',
        last: 'Admin',
        roles: ['ADMIN'],
      },
      {
        first: 'Pekka',
        last: 'Hämäläinen',
        roles: ['ADMIN', 'MEMBER'],
      },
      {
        first: 'Liisa',
        last: 'Korhonen',
        roles: ['ADMIN', 'COMMITTEE'],
      },
      {
        first: 'Kaisa',
        last: 'Laine',
        roles: ['ADMIN'],
      },
      {
        first: 'John',
        last: 'McDoe',
        roles: ['ADMIN'],
      },
    ])
  })

  it('should search by unapproved roles as an admin', async () => {
    const membersQry = await query(adminToken, {
      role: 'null',
    })

    const member = membersQry.members.filter(m => m.memberId === 'Marja1')
    expect(member).toMatchSnapshot()
  })

  it('should search by private and unapproved roles as an admin', async () => {
    const membersQry = await query(adminToken, {
      role: ['ADMIN', 'null'],
      isMembershipApproved: undefined,
    })

    expect(membersQry.members.map(({ first, last, roles }) => ({ first, last, roles }))).toEqual([
      {
        first: 'MIK',
        last: 'Admin',
        roles: ['ADMIN'],
      },
      {
        first: 'Pekka',
        last: 'Hämäläinen',
        roles: ['ADMIN', 'MEMBER'],
      },
      {
        first: 'Liisa',
        last: 'Korhonen',
        roles: ['ADMIN', 'COMMITTEE'],
      },
      {
        first: 'Kaisa',
        last: 'Laine',
        roles: ['ADMIN'],
      },
      {
        first: 'John',
        last: 'McDoe',
        roles: ['ADMIN'],
      },
    ])
  })
})

describe('GET /members/me', () => {
  const query = async (token: string) =>
    request(app).get('/members/me').set('Authorization', `Bearer ${token}`).query({})

  test.each([[memberToken], [adminToken], [noPermissionsToken]])(
    'should return 200 with valid token for user',
    async token => {
      const response = await query(token)

      expect(response.status).toBe(200)

      const member = response.body as Member
      expect(member).toMatchSnapshot({
        memberSince: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        updatedBy: expect.any(String),
        ...(token !== adminToken ? { membershipApprovedAt: expect.any(String) } : {}),
        roles: member.roles.map(role => ({
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

describe('PATCH /members/me', () => {
  const patch = async (token: string, payload: Partial<Member>) =>
    request(app).patch('/members/me').set('Authorization', `Bearer ${token}`).send(payload)

  it('should update valid fields', async () => {
    const response = await patch(memberToken, { firstName: 'Teppo' })

    expect(response.status).toBe(200)
    expect(response.body.firstName).toEqual('Teppo')

    // cleanup
    await patch(memberToken, { firstName: 'Matti' })
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
      errors: [
        {
          code: 'unrecognized_keys',
          keys: ['canMakeReservations', 'isTrainingProgramPilot'],
          path: [],
          message: "Unrecognized key(s) in object: 'canMakeReservations', 'isTrainingProgramPilot'",
        },
      ],
    })
  })
})

describe('GET /members/roles', () => {
  const query = async (token: string) =>
    request(app).get('/members/roles').set('Authorization', `Bearer ${token}`).query({})

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
    ])
    expect(roles.map(({ roleId, permissions }) => ({ roleId, permissions }))).toEqual([
      {
        permissions: ['member.admin', 'flightlog.admin', 'booking.admin', 'aircraft.admin'],
        roleId: 'ADMIN',
      },
      { permissions: [], roleId: 'COMMITTEE' },
      { permissions: [], roleId: 'EXAMINER' },
      { permissions: ['flightlog.user', 'booking.user', 'aircraft.user'], roleId: 'FLYING_MEMBER' },
      { permissions: [], roleId: 'INSTRUCTOR' },
      { permissions: ['flightlog.user', 'aircraft.user'], roleId: 'MAINTENANCE' },
      { permissions: ['member'], roleId: 'MEMBER' },
      {
        permissions: ['flightlog.admin', 'booking.admin', 'aircraft.admin'],
        roleId: 'PLANE_CAPTAIN',
      },
      { permissions: ['member.admin', 'flightlog.admin'], roleId: 'SECRETARY' },
      { permissions: null, roleId: 'SERVICE' },
    ])
  })
})

describe('GET /members/roles/id', () => {
  const query = async (id: string, token: string) =>
    request(app).get(`/members/roles/${id}`).set('Authorization', `Bearer ${token}`).query({})

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
      permissions: ['member.admin', 'flightlog.admin', 'booking.admin', 'aircraft.admin'],
      createdAt: expect.any(String),
      createdBy: 'k1mnimda',
      updatedAt: expect.any(String),
      updatedBy: 'k1mnimda',
    })
  })
})

describe('PATCH /members/roles/id', () => {
  const patch = async (id: string, payload: Partial<Upsert<MemberRole>>, token: string) =>
    request(app).patch(`/members/roles/${id}`).set('Authorization', `Bearer ${token}`).send(payload)

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
    request(app).patch(`/members/${id}`).set('Authorization', `Bearer ${token}`).send(payload)

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
})

describe('GET /members/id', () => {
  const get = async (id: string, token: string) =>
    request(app).get(`/members/${id}`).set('Authorization', `Bearer ${token}`).query({})

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
      roles: member.roles.map(role => ({
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
    request(app).post(`/members`).set('Authorization', `Bearer ${token}`).send(payload)

  const remove = async (id: string, token: string) =>
    request(app).delete(`/members/${id}`).set('Authorization', `Bearer ${token}`).send({})

  const email = `${new Date().getTime()}@testdata.com`
  const req: RegisterRequest = {
    memberType: MIKMemberTypes.NONFLYING,
    email,
    firstName: 'first',
    lastName: 'last',
    lang: MIKLang.EN,
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
})

describe('Membership approval tests', () => {
  it('Get awaiting approval member details should return list of members awaiting approval', async () => {
    const response = await request(app)
      .get('/members/awaiting-approval')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(200)

    var payload = response.body
      .slice()
      .sort((a: Member, b: Member) => a.memberId.localeCompare(b.memberId))
      .map((member: Member) => ({
        ...member,
        memberSince: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }))

    expect(payload).toMatchSnapshot()
  })

  it('Get awaiting approval member details should return error when not a member admin', async () => {
    const response = await request(app)
      .get('/members/awaiting-approval')
      .set('Authorization', `Bearer ${memberToken}`)
    expect(response.status).toBe(403)
  })

  it('POST approval should approve a new member by updating the member.register table ', async () => {
    const response = await request(app)
      .post('/members/Marja1/approve')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(HttpStatusCode.Created)

    //revert changes
    await db
      .updateTable('member.register')
      .set({
        membership_approved_at: null,
        membership_approved_by: null,
      })
      .where('member_id', '=', 'Marja1')
      .execute()
  })

  it('POST approval should return not found when member does not exist', async () => {
    const response = await request(app)
      .post('/members/Brewster/approve')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(HttpStatusCode.InternalServerError)
  })

  it('POST approval should not be allowed for non admin users', async () => {
    const response = await request(app)
      .post('/members/Marja1/approve')
      .set('Authorization', `Bearer ${memberToken}`)
    expect(response.status).toBe(HttpStatusCode.Forbidden)
  })
})
describe('Set language tests', () => {
  it('Updates the language', async () => {
    const response = await request(app)
      .patch('/members/me/lang')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ lang: 'en' })
    expect(response.status).toBe(200)

    const undoResponse = await request(app)
      .patch('/members/me/lang')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ lang: 'fi' })

    expect(undoResponse.status).toBe(200)
  })
})
