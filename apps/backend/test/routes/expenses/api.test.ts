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

  // Regression test for issue #1023: unit_price was DECIMAL(10,2), so a rate like
  // 0.2755 EUR/km got rounded to 0.28 on insert before being multiplied by distance,
  // inflating the total (99 * 0.28 = 27.72 instead of the correct 99 * 0.2755 = 27.27).
  it('preserves 4-decimal precision on the per-km rate so the total is not rounded up early', async () => {
    const categoryId = await mileageCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Mileage precision test',
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
            unitPrice: 0.2755,
            sortOrder: 0,
          },
        ],
        mileageDetail: {
          route: 'HOME - ROS - HOME',
          journeyDate: '2026-07-16',
          distanceKm: 99,
          boardApproved: false,
          hetu: '010101-123A',
        },
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)

    expect(res.body.lineItems[0].unitPrice).toBe(0.2755)
    expect(res.body.totalAmount).toBe(27.27)
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
            airport: 'EFNU',
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

  it('rejects a fuel claim when a line item has no airport or date selected', async () => {
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
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JetA1',
            costCentreCode: 'OH-STL',
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
            airport: 'EFNU',
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

// ── Tests: POST /expenses (fuel claims) — per-line-item quantity/type requirement ─
// Fuel quantity now lives on each line item (not once at claim level via the legacy
// fuelLitres field), so the API must no longer require that claim-level field. The
// per-line-item fuelType is optional and no longer enforced (the selected invoice
// item identifies the fuel instead).

describe('POST /expenses (fuel litres/type)', () => {
  const insertedClaimIds: string[] = []
  // EEPU (Pärnu, Estonia) — a non-Finnish airfield seeded by V240__ExpenseClaimsTestData.sql.
  const foreignAirportIdent = 'EEPU'

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

  it('creates a fuel claim with no claim-level fuelLitres/fuelType, as long as line items have them', async () => {
    const categoryId = await fuelCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel test',
        currency: 'EUR',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JetA1',
            date: '2026-07-16',
            airport: 'EFNU',
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
    expect(res.body.fuelLitres).toBeFalsy()
    expect(res.body.fuelType).toBeFalsy()
    expect(res.body.lineItems[0].quantity).toBe(100)
    expect(res.body.lineItems[0].fuelType).toBe('JetA1')
  })

  // refuelOutsideFinland is derived server-side from each line item's ICAO airport
  // code (issue #1020) rather than being a client-editable claim-level flag: any
  // non-EFxx airport counts as fueling abroad, regardless of what the client sends.

  it('derives refuelOutsideFinland=false for a Finnish (EFxx) line-item airport', async () => {
    const categoryId = await fuelCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel test',
        currency: 'EUR',
        expenseDate: '2026-07-15',
        refuelOutsideFinland: true, // ignored by the server, kept here to prove that
        lineItems: [
          {
            itemId: null,
            description: '100 l JetA1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.refuelOutsideFinland).toBe(false)
  })

  it('derives refuelOutsideFinland=true when a line-item airport is not EFxx', async () => {
    const categoryId = await fuelCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel test abroad',
        currency: 'EUR',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JetA1',
            date: '2026-07-16',
            airport: foreignAirportIdent,
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.refuelOutsideFinland).toBe(true)
  })

  // Production has fuel line items from before airport/date existed (issue #966).
  // Editing/submitting those claims must keep working without backfilling the field —
  // airport/date are only required for genuinely new line items (issue #1020).
  it('allows editing and submitting a legacy fuel claim whose line item predates airport/date', async () => {
    const categoryId = await fuelCategoryId()

    const claim = await db
      .insertInto('accts.expense_claim')
      .values({
        member_id: 'Juha1',
        category_id: categoryId,
        title: 'Legacy fuel claim',
        status: ExpenseClaimStatus.DRAFT,
        updated_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    insertedClaimIds.push(claim.id)

    const lineItem = await db
      .insertInto('accts.expense_claim_line_item')
      .values({
        claim_id: claim.id,
        description: '100 l JetA1 (legacy, no airport recorded)',
        quantity: 100,
        unit: 'l',
        unit_price: 1.5,
        sort_order: 0,
        cost_centre_code: 'OH-STL',
        fuel_type: 'JetA1',
        // fuel_date / airport intentionally left null — data entered before issue #966.
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const editRes = await request(app)
      .put(`/expenses/${claim.id}`)
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        title: 'Legacy fuel claim (edited)',
        expenseDate: '2026-07-15',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        lineItems: [
          {
            id: lineItem.id,
            description: '100 l JetA1 (legacy, no airport recorded)',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JetA1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })

    expect(editRes.status).toBe(200)
    expect(editRes.body.title).toBe('Legacy fuel claim (edited)')
    expect(editRes.body.lineItems[0].airport).toBeFalsy()

    const submitRes = await request(app)
      .post(`/expenses/${claim.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(submitRes.status).toBe(200)
  })
})

// ── Tests: POST /expenses/:id/override-fuel-price — admin EFNU price override ───

describe('POST /expenses/:id/override-fuel-price', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createSubmittedFuelClaim(unitPrice: number): Promise<string> {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()

    const create = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Fuel test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JetA1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 100,
            unit: 'l',
            unitPrice,
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

    return create.body.id
  }

  it('caps the line item unit price and notes the cap in the description', async () => {
    const claimId = await createSubmittedFuelClaim(5)

    const res = await request(app)
      .post(`/expenses/${claimId}/override-fuel-price`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ efnuPrice: 1.91 })

    expect(res.status).toBe(200)
    expect(res.body.lineItems[0].unitPrice).toBeCloseTo(1.91, 2)
    expect(res.body.description ?? '').toContain('EFNU fuel price cap')
  })

  it('rejects the override for a non-fuel claim', async () => {
    const claimId = await insertClaim(ExpenseClaimStatus.SUBMITTED)

    const res = await request(app)
      .post(`/expenses/${claimId}/override-fuel-price`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ efnuPrice: 1.91 })

    expect(res.status).toBe(400)
  })

  it('rejects the override for a member without EXPENSE_ADMIN', async () => {
    const claimId = await createSubmittedFuelClaim(5)

    const res = await request(app)
      .post(`/expenses/${claimId}/override-fuel-price`)
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ efnuPrice: 1.91 })

    expect(res.status).toBe(403)
  })
})
