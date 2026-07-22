/**
 * Tests for the secretary notification feature when a new member is created.
 *
 * This test is in a separate file because it requires jest.unstable_mockModule
 * (the ESM-native mock API) to intercept sendEmail before any modules that
 * depend on it are imported. All dependent imports therefore use dynamic
 * import() so that the mock is in place when they resolve.
 */

import { jest, describe, it, beforeEach, expect } from '@jest/globals'

// dotenv must load before any module that reads env vars
import 'dotenv/config'

// Register the mock BEFORE importing any module that uses sendGmail.ts
const mockSendEmail = jest.fn()
jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail: mockSendEmail,
}))

// Dynamic imports – all modules that (transitively) depend on sendGmail.ts
// must be imported here so they see the mock rather than the real module.
const { default: express } = await import('express')
const { default: cookieParser } = await import('cookie-parser')
const { default: request } = await import('supertest')

const { router } = await import('../../../src/routes/members/api.ts')
const { generateAccessToken } = await import('../../../src/routes/auth/token.ts')
const { db } = await import('../../../src/db/connection.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { MIKLang, MIKMemberTypes, MIKPermissions } =
  await import('../../../src/routes/members/models.ts')
const { deleteSimplbooksOutbox } = await import('../../db/__helpers__/simplbooksDbHelpers.ts')
import type { Member } from '../../../src/routes/members/models.ts'
import type { RegisterRequest } from '../../../src/routes/auth/schema.ts'

process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret'
process.env.ACCESS_TOKEN_EXPIRATION ??= '15m'

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

const post = (payload: RegisterRequest, token: string) =>
  request(app).post('/members').set('Cookie', `accessToken=${token}`).send(payload)

const remove = (id: string, token: string) =>
  request(app).delete(`/members/${id}`).set('Cookie', `accessToken=${token}`).send({})

const req: RegisterRequest = {
  memberType: MIKMemberTypes.NONFLYING,
  email: `${Date.now()}@testdata.com`,
  firstName: 'Notification',
  lastName: 'Test',
  lang: MIKLang.EN,
  streetAddress: 'Test Street 1',
  postcode: '00100',
  townCity: 'Helsinki',
  country: 'FI',
}

describe('POST /members – secretary notification', () => {
  beforeEach(async () => {
    await deleteSimplbooksOutbox()
    mockSendEmail.mockClear()
  })

  it('Notifies secretaries when a new member is created', async () => {
    // Assign SECRETARY role to an existing test member (idempotent)
    await db
      .insertInto('member.member_to_roles')
      .values({ member_id: 'Matti1', role_id: 'SECRETARY', created_by: 'k1mnimda' })
      .onConflict((oc) => oc.doNothing())
      .execute()

    // Derive the expected email from the DB so the assertion is not brittle
    const secretary = await db
      .selectFrom('member.register')
      .select('email')
      .where('member_id', '=', 'Matti1')
      .executeTakeFirstOrThrow()

    let createdMemberId: string | undefined
    try {
      const response = await post(req, adminToken)
      expect(response.status).toBe(200)
      createdMemberId = (response.body as Member).memberId

      // Wait for the background async task (DB query + sendEmail) to complete
      const deadline = Date.now() + 2000
      while (mockSendEmail.mock.calls.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }

      expect(mockSendEmail).toHaveBeenCalledWith(
        secretary.email,
        expect.any(String),
        expect.any(String),
      )
    } finally {
      // Cleanup regardless of test outcome to avoid leaving dirty state
      if (createdMemberId) {
        await remove(createdMemberId, adminToken)
      }
      await db
        .deleteFrom('member.member_to_roles')
        .where('member_id', '=', 'Matti1')
        .where('role_id', '=', 'SECRETARY')
        .execute()
    }
  })
})
