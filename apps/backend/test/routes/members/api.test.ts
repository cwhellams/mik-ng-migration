import dotenv from 'dotenv'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/members/api.ts'
import {
  MIKPermissions,
  type Member,
  type MemberListFilters,
  type MemberListResponse,
  type MemberRolesResponse,
} from '../../../src/routes/members/models.ts'

dotenv.config()

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/members', router)

const memberToken = generateAccessToken({
  memberId: 1,
  email: 'member@mik.fi',
  permissions: [MIKPermissions.MEMBER],
})

const adminToken = generateAccessToken({
  memberId: 2,
  email: 'admin@mik.fi',
  permissions: [MIKPermissions.MEMBER_ADMIN],
})

const noPermissionsToken = generateAccessToken({
  memberId: 3,
  email: 'no-permissions@mik.fi',
  permissions: [],
})

const missingUserToken = generateAccessToken({
  memberId: -1,
  email: 'no-permissions@mik.fi',
  permissions: [],
})

describe('GET /members', () => {
  const query = async (token: string, query?: MemberListFilters) => {
    const response = await request(app)
      .get('/members')
      .set('Authorization', `Bearer ${token}`)
      .query(query ?? {})

    expect(response.status).toBe(200)

    const body = response.body as MemberListResponse

    return body.members.filter(m => m.memberId <= 10)
  }

  test.each([
    [1, memberToken],
    [2, adminToken],
  ])('should return 200 without search filters for user id %d', async (_memberId, token) => {
    const members = await query(token)

    expect(members).toMatchSnapshot()
  })

  it('should return prefix matches with name filter', async () => {
    const members = await query(memberToken, {
      name: 'an',
    })

    expect(members.map(m => m.name)).toEqual(['Antti Heikkinen', 'Anna Mäkinen'])
  })

  it('should return empty list with non-existing name filter', async () => {
    const members = await query(memberToken, {
      name: 'sdfoisusdfj',
    })

    expect(members).toEqual([])
  })

  it('should search by public role as a member', async () => {
    const members = await query(memberToken, {
      role: 'INSTRUCTOR',
    })
    expect(members.map(({ name, roles }) => ({ name, roles }))).toEqual([
      {
        name: 'Antti Heikkinen',
        roles: ['INSTRUCTOR', 'MEMBER'],
      },
      {
        name: 'Jukka Nieminen',
        roles: ['INSTRUCTOR'],
      },
      {
        name: 'Matti Virtanen',
        roles: ['INSTRUCTOR', 'MEMBER'],
      },
    ])
  })

  it('should search by multiple public roles as a member', async () => {
    const members = await query(memberToken, {
      role: ['INSTRUCTOR', 'COMMITTEE'],
    })
    expect(members.map(({ name, roles }) => ({ name, roles }))).toEqual([
      {
        name: 'Antti Heikkinen',
        roles: ['INSTRUCTOR', 'MEMBER'],
      },
      {
        name: 'Liisa Korhonen',
        roles: ['COMMITTEE'],
      },
      {
        name: 'Sanna Koskinen',
        roles: ['COMMITTEE'],
      },
      {
        name: 'Anna Mäkinen',
        roles: ['COMMITTEE'],
      },
      {
        name: 'Jukka Nieminen',
        roles: ['INSTRUCTOR'],
      },
      {
        name: 'Matti Virtanen',
        roles: ['INSTRUCTOR', 'MEMBER'],
      },
    ])
  })

  it('should skip search by invalid roles', async () => {
    const members = await query(memberToken, {
      role: 'NOT_ROLE',
    })
    expect(members.length).toEqual(8)
  })

  it('should skip search by private roles as a member', async () => {
    const members = await query(memberToken, {
      role: 'ADMIN',
    })

    expect(members.length).toEqual(8)
  })

  it('should skip search by unapproved roles as a member', async () => {
    const members = await query(memberToken, {
      role: 'null',
    })

    expect(members.length).toEqual(8)
  })

  it('should search by private roles as an admin', async () => {
    const members = await query(adminToken, {
      role: 'ADMIN',
    })

    expect(members.map(({ name, roles }) => ({ name, roles }))).toEqual([
      {
        name: 'MIK Admin',
        roles: ['ADMIN'],
      },
      {
        name: 'Pekka Hämäläinen',
        roles: ['ADMIN', 'MEMBER'],
      },
      {
        name: 'Liisa Korhonen',
        roles: ['ADMIN', 'COMMITTEE'],
      },
      {
        name: 'Kaisa Laine',
        roles: ['ADMIN'],
      },
    ])
  })

  it('should search by unapproved roles as an admin', async () => {
    const members = await query(adminToken, {
      role: 'null',
    })

    expect(members).toEqual([
      { memberId: 10, name: 'Marja Salminen', phoneNumber: '0490123456', roles: [] },
    ])
  })

  it('should search by private and unapproved roles as an admin', async () => {
    const members = await query(adminToken, {
      role: ['ADMIN', 'null'],
    })

    expect(members.map(({ name, roles }) => ({ name, roles }))).toEqual([
      {
        name: 'MIK Admin',
        roles: ['ADMIN'],
      },
      {
        name: 'Pekka Hämäläinen',
        roles: ['ADMIN', 'MEMBER'],
      },
      {
        name: 'Liisa Korhonen',
        roles: ['ADMIN', 'COMMITTEE'],
      },
      {
        name: 'Kaisa Laine',
        roles: ['ADMIN'],
      },
      { name: 'Marja Salminen', roles: [] },
    ])
  })
})

describe('GET /members/me', () => {
  const query = async (token: string) =>
    request(app).get('/members/me').set('Authorization', `Bearer ${token}`).query({})

  test.each([
    [1, memberToken],
    [2, adminToken],
    [3, noPermissionsToken],
  ])('should return 200 with valid token for user id %d', async (userId, token) => {
    const response = await query(token)

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
    const response = await patch(memberToken, { canMakeReservations: false })

    expect(response.status).toBe(200)
    expect(response.body.canMakeReservations).toEqual(true)
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

  it('Get return ponly public roles without permissions as a member', async () => {
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
    ])
  })
})
