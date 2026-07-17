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

// ── Tests: POST /expenses (mileage claims) ──────────────────────────────────────

describe('POST /expenses (mileage)', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function mileageCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', 'mileage')
      .executeTakeFirstOrThrow()
    return category.id
  }

  it('creates a mileage claim, ignoring a legacy passengers field', async () => {
    const categoryId = await mileageCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Mileage test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: 'HOME - ROS - HOME',
            date: '2026-07-16',
            quantity: 99,
            unit: 'km',
            unitPrice: 0.275,
            sortOrder: 0,
          },
        ],
        mileageDetail: {
          route: 'HOME - ROS - HOME',
          journeyDate: '2026-07-16',
          distanceKm: 99,
          // Legacy clients may still send this — the API must silently ignore it.
          passengers: ['Someone'],
          boardApproved: false,
          hetu: '010101-123A',
        },
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)

    expect(res.body.mileageDetail).toBeDefined()
    expect(res.body.mileageDetail.route).toBe('HOME - ROS - HOME')
    expect(res.body.mileageDetail.distanceKm).toBe(99)
    expect(res.body.mileageDetail).not.toHaveProperty('passengers')
  })
})

// ── Tests: POST /expenses (fuel claims) — EFNU price cap enforcement ────────────

describe('POST /expenses (fuel price cap)', () => {
  const insertedClaimIds: string[] = []
  const JET_A1_CAP_EUR = 1.91 // keep in sync with EFNU_FUEL_PRICE_PER_LITRE.JetA1

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function fuelCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()
    return category.id
  }

  async function postFuelClaim(body: Record<string, unknown>) {
    const categoryId = await fuelCategoryId()
    return request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel test',
        fuelLitres: 100,
        fuelType: 'JetA1',
        expenseDate: '2026-07-15',
        ...body,
      })
  }

  it('clamps an EUR unit price above the EFNU cap down to the cap', async () => {
    const res = await postFuelClaim({
      currency: 'EUR',
      lineItems: [
        {
          itemId: null,
          description: '100 l JetA1',
          date: '2026-07-16',
          quantity: 100,
          unit: 'l',
          unitPrice: 5, // way above the 1.91 EUR/litre cap
          fuelType: 'JetA1',
          costCentreCode: 'OH-STL',
          sortOrder: 0,
        },
      ],
    })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems[0].unitPrice).toBeCloseTo(JET_A1_CAP_EUR, 2)
  })

  it('leaves an EUR unit price at or below the cap untouched', async () => {
    const res = await postFuelClaim({
      currency: 'EUR',
      lineItems: [
        {
          itemId: null,
          description: '100 l JetA1',
          date: '2026-07-16',
          quantity: 100,
          unit: 'l',
          unitPrice: 1.5,
          fuelType: 'JetA1',
          costCentreCode: 'OH-STL',
          sortOrder: 0,
        },
      ],
    })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems[0].unitPrice).toBeCloseTo(1.5, 2)
  })

  it('converts the cap into the claim currency before clamping a non-EUR unit price', async () => {
    const fxRate = 0.041 // 1 CZK ≈ 0.041 EUR
    // 50 CZK/litre is well above the cap once converted (cap ≈ 46.6 CZK/litre)
    const res = await postFuelClaim({
      currency: 'CZK',
      fxRate,
      lineItems: [
        {
          itemId: null,
          description: '100 l JetA1',
          date: '2026-07-16',
          quantity: 100,
          unit: 'l',
          unitPrice: 50,
          fuelType: 'JetA1',
          costCentreCode: 'OH-STL',
          sortOrder: 0,
        },
      ],
    })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems[0].unitPrice).toBeCloseTo(JET_A1_CAP_EUR / fxRate, 2)
  })

  it('leaves a non-EUR unit price below the converted cap untouched', async () => {
    const fxRate = 0.041
    const res = await postFuelClaim({
      currency: 'CZK',
      fxRate,
      lineItems: [
        {
          itemId: null,
          description: '100 l JetA1',
          date: '2026-07-16',
          quantity: 100,
          unit: 'l',
          unitPrice: 10, // well under the ≈46.6 CZK/litre converted cap
          fuelType: 'JetA1',
          costCentreCode: 'OH-STL',
          sortOrder: 0,
        },
      ],
    })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems[0].unitPrice).toBeCloseTo(10, 2)
  })

  it('does not clamp line items without a fuelType', async () => {
    const res = await postFuelClaim({
      currency: 'EUR',
      lineItems: [
        {
          itemId: null,
          description: 'Oil top-up',
          date: '2026-07-16',
          quantity: 1,
          unit: 'pcs',
          unitPrice: 25,
          costCentreCode: 'OH-STL',
          sortOrder: 0,
        },
      ],
    })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems[0].unitPrice).toBeCloseTo(25, 2)
  })
})

// ── Tests: POST /expenses (fuel claims) — per-line-item aircraft requirement ────
// Aircraft selection for fuel claims moved from the claim-level `aircraftId` field to
// a per-line-item `costCentreCode` (see V1360 migration). The API must no longer
// require the claim-level field, but must still require an aircraft per fuel line item.

describe('POST /expenses (fuel)', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function fuelCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()
    return category.id
  }

  it('creates a fuel claim with no claim-level aircraftId, as long as line items have one', async () => {
    const categoryId = await fuelCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel test',
        currency: 'EUR',
        fuelLitres: 100,
        fuelType: 'JetA1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JetA1',
            date: '2026-07-16',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JetA1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.aircraftId).toBeFalsy()
    expect(res.body.lineItems[0].costCentreCode).toBe('OH-STL')
  })

  it('rejects a fuel claim when a line item has no aircraft selected', async () => {
    const categoryId = await fuelCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel test',
        currency: 'EUR',
        fuelLitres: 100,
        fuelType: 'JetA1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JetA1',
            date: '2026-07-16',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JetA1',
            sortOrder: 0,
          },
        ],
      })

    expect(res.status).toBe(400)
    if (res.status === 201) {
      insertedClaimIds.push(res.body.id)
    }
  })

  it('submits a fuel claim with no claim-level aircraftId', async () => {
    const categoryId = await fuelCategoryId()

    const create = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        fuelLitres: 100,
        fuelType: 'JetA1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JetA1',
            date: '2026-07-16',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JetA1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })
    expect(create.status).toBe(201)
    insertedClaimIds.push(create.body.id)

    const submit = await request(app)
      .post(`/expenses/${create.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(submit.status).toBe(200)
    expect(submit.body.status).toBe('SUBMITTED')
  })
})
