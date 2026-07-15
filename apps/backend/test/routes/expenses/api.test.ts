import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/expenses/api.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { ExpenseClaimStatus } from '../../../src/routes/expenses/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

// ── App ───────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/expenses', router)
app.use(problemErrorHandler)

// ── Tokens ────────────────────────────────────────────────────────────────────

const adminToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Admin',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.EXPENSE_ADMIN],
  canMakeReservations: false,
})

const memberToken = generateAccessToken({
  memberId: 'Juha1',
  lastName: 'Seppälä',
  email: 'juha@mik.fi',
  roles: [],
  permissions: [MIKPermissions.EXPENSE_USER],
  canMakeReservations: false,
})

// ── Seed data IDs ─────────────────────────────────────────────────────────────

const MEMBER_ID = 'Juha1'
const CATEGORY_CODE = 'misc'

async function insertClaim(status: ExpenseClaimStatus) {
  const category = await db
    .selectFrom('accts.expense_category')
    .select('id')
    .where('code', '=', CATEGORY_CODE)
    .executeTakeFirstOrThrow()

  const claim = await db
    .insertInto('accts.expense_claim')
    .values({
      member_id: MEMBER_ID,
      category_id: category.id,
      title: 'Test claim',
      status,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return claim.id
}

// ── Tests: GET /expenses/admin/pending/count ───────────────────────────────────

describe('GET /expenses/admin/pending/count', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/expenses/admin/pending/count')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a member without EXPENSE_ADMIN', async () => {
    const res = await request(app)
      .get('/expenses/admin/pending/count')
      .set('Cookie', `accessToken=${memberToken}`)
    expect(res.status).toBe(403)
  })

  it('reflects newly submitted claims in the count for EXPENSE_ADMIN', async () => {
    const before = await request(app)
      .get('/expenses/admin/pending/count')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(before.status).toBe(200)
    const baseline = before.body.count as number

    insertedClaimIds.push(await insertClaim(ExpenseClaimStatus.SUBMITTED))
    insertedClaimIds.push(await insertClaim(ExpenseClaimStatus.DRAFT))

    const after = await request(app)
      .get('/expenses/admin/pending/count')
      .set('Cookie', `accessToken=${adminToken}`)
    expect(after.status).toBe(200)
    expect(after.body.count).toBe(baseline + 1)
  })
})
