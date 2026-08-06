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

// Narrower than EXPENSE_ADMIN — only treasurer/chairman hold this (issue #1022).
const hetuAdminToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Admin',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.EXPENSE_ADMIN, MIKPermissions.EXPENSE_HETU_ADMIN],
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

  // Regression test for issue #1024: only unitPrice (total cost / litres) was persisted,
  // so redisplaying the total after a save/reload reconstructed it as quantity * unitPrice.
  // Since unitPrice is rounded to 4 decimal places, that reconstruction drifted from the
  // total the member actually typed in (e.g. 30 l for 50.00 EUR -> unitPrice 1.6667 ->
  // 30 * 1.6667 = 50.01, not 50.00). Persisting totalCost directly makes it exact.
  it('round-trips the exact total cost the member entered for a fuel line item', async () => {
    const categoryId = await fuelCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Fuel precision test',
        currency: 'EUR',
        fuelLitres: 30,
        fuelType: 'JetA1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '30 l JetA1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 30,
            unit: 'l',
            unitPrice: 50 / 30,
            totalCost: 50,
            fuelType: 'JetA1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems[0].totalCost).toBe(50)

    const reloaded = await request(app)
      .get(`/expenses/${res.body.id}`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(reloaded.status).toBe(200)
    expect(reloaded.body.lineItems[0].totalCost).toBe(50)
  })

  // Aircraft/airport/date completeness is enforced at submit time, not at create/
  // save-draft time — a fuel claim must be saveable before those fields are filled in.
  it('allows saving a fuel claim draft with no aircraft selected, but rejects submitting it', async () => {
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
            sortOrder: 0,
          },
        ],
      })
    expect(create.status).toBe(201)
    insertedClaimIds.push(create.body.id)

    const submit = await request(app)
      .post(`/expenses/${create.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(submit.status).toBe(400)
    expect(submit.body.detail).toBe('Each fuel line item requires an aircraft to be selected.')
  })

  it('allows saving a fuel claim draft with no airport or date, but rejects submitting it', async () => {
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

    expect(submit.status).toBe(400)
    expect(submit.body.detail).toBe(
      'Each fuel line item requires an airport and date to be selected.',
    )
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
        // Predates the airport/date field (see FUEL_LINE_ITEM_AIRPORT_DATE_CUTOFF in
        // api.ts) — genuinely simulates legacy data rather than relying on the line
        // item merely having a persisted id, which no longer signals "legacy" now
        // that every item gets an id as soon as a draft is first saved.
        created_at: new Date('2026-01-01T00:00:00.000Z'),
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

  // Aircraft selection moved from claim-level to per-line-item (see V1360 migration,
  // #963); production has fuel line items from before that, with no costCentreCode
  // recorded. Submitting one of those (e.g. after an admin moves it back to DRAFT)
  // must keep working without backfilling a field that didn't exist for it yet.
  it('allows submitting a legacy fuel claim whose line item predates per-line-item aircraft selection', async () => {
    const categoryId = await fuelCategoryId()

    const claim = await db
      .insertInto('accts.expense_claim')
      .values({
        member_id: 'Juha1',
        category_id: categoryId,
        title: 'Legacy fuel claim (pre-aircraft-field)',
        status: ExpenseClaimStatus.DRAFT,
        // Predates FUEL_LINE_ITEM_AIRCRAFT_CUTOFF in api.ts - genuinely simulates
        // legacy data from before aircraft was tracked per line item.
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date(),
        iban: 'FI2112345600000785',
        iban_account_name: 'Juha Seppälä',
        expense_date: '2026-01-01',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    insertedClaimIds.push(claim.id)

    await db
      .insertInto('accts.expense_claim_line_item')
      .values({
        claim_id: claim.id,
        description: '100 l JetA1 (legacy, no aircraft recorded)',
        quantity: 100,
        unit: 'l',
        unit_price: 1.5,
        sort_order: 0,
        fuel_type: 'JetA1',
        airport: 'EFHK',
        fuel_date: '2026-01-01',
        // cost_centre_code intentionally left null - predates per-line-item aircraft.
      })
      .execute()

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

// ── Tests: POST /expenses — draft saves with incomplete line items ─────────────
// Line items are intentionally NOT required to be complete when saving a draft (see
// ExpenseLineItemSchema/CreateExpenseClaimSchema in models.ts) — a partially-filled
// wizard must be able to "Save draft" from any step. Completeness is enforced only at
// submit time (POST /expenses/:id/submit, tested below).

describe('POST /expenses (draft with incomplete line items)', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function miscCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', CATEGORY_CODE)
      .executeTakeFirstOrThrow()
    return category.id
  }

  it('saves a draft with no line items at all', async () => {
    const categoryId = await miscCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ categoryId, title: 'Early draft', lineItems: [] })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems).toEqual([])
  })

  it('saves a draft with an untouched placeholder line item (empty description)', async () => {
    const categoryId = await miscCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Early draft with placeholder item',
        lineItems: [
          { itemId: null, description: '', quantity: 1, unit: 'pcs', unitPrice: 0, sortOrder: 0 },
        ],
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.lineItems).toHaveLength(1)
    expect(res.body.lineItems[0].description).toBe('')
  })
})

// ── Tests: POST /expenses/:id/submit — line item requirements ──────────────────

describe('POST /expenses/:id/submit (line item requirements)', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createDraft(lineItems: unknown[]): Promise<string> {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', CATEGORY_CODE)
      .executeTakeFirstOrThrow()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Submit validation test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-07-15',
        lineItems,
      })
    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    return res.body.id
  }

  it('rejects submitting a claim with no line items', async () => {
    const claimId = await createDraft([])

    const res = await request(app)
      .post(`/expenses/${claimId}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(400)
    expect(res.body.detail).toBe('At least one line item is required.')
  })

  it('rejects submitting a claim whose line item has no description', async () => {
    const claimId = await createDraft([
      { itemId: null, description: '', quantity: 1, unit: 'pcs', unitPrice: 10, sortOrder: 0 },
    ])

    const res = await request(app)
      .post(`/expenses/${claimId}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(400)
    expect(res.body.detail).toBe('Every line item needs a description.')
  })

  it('submits successfully once line items are complete', async () => {
    const claimId = await createDraft([
      {
        itemId: null,
        description: 'Test expense',
        quantity: 1,
        unit: 'pcs',
        unitPrice: 10,
        sortOrder: 0,
      },
    ])

    const res = await request(app)
      .post(`/expenses/${claimId}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe(ExpenseClaimStatus.SUBMITTED)
  })
})

// ── Tests: HETU reveal + Tulorekisteri report (issue #1022) ────────────────────

describe('Mileage HETU reveal and Tulorekisteri report', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db
        .deleteFrom('accts.mileage_hetu_access_audit')
        .where('claim_id', 'in', insertedClaimIds)
        .execute()
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createMileageClaim(options: {
    hetu?: string
    journeyDate: string
    distanceKm?: number
  }): Promise<string> {
    const category = await db
      .selectFrom('accts.expense_category')
      .select('id')
      .where('code', '=', 'mileage')
      .executeTakeFirstOrThrow()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Mileage HETU test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: options.journeyDate,
        lineItems: [
          {
            itemId: null,
            description: 'HOME - ROS - HOME',
            date: options.journeyDate,
            quantity: options.distanceKm ?? 99,
            unit: 'km',
            unitPrice: 0.275,
            sortOrder: 0,
          },
        ],
        mileageDetail: {
          route: 'HOME - ROS - HOME',
          journeyDate: options.journeyDate,
          distanceKm: options.distanceKm ?? 99,
          boardApproved: false,
          ...(options.hetu ? { hetu: options.hetu } : {}),
        },
      })
    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    return res.body.id
  }

  async function approveClaim(claimId: string, approvedAt: Date): Promise<void> {
    await db
      .updateTable('accts.expense_claim')
      .set({
        status: ExpenseClaimStatus.APPROVED,
        approved_at: approvedAt,
        approved_by: 'Liisa1',
      })
      .where('id', '=', claimId)
      .execute()
  }

  describe('GET /expenses/:id', () => {
    it('always returns a masked HETU, never the plaintext', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })

      const asMember = await request(app)
        .get(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${memberToken}`)
      expect(asMember.status).toBe(200)
      expect(asMember.body.mileageDetail.hetu).toBe('***********')

      const asAdmin = await request(app)
        .get(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')
      expect(asAdmin.status).toBe(200)
      expect(asAdmin.body.mileageDetail.hetu).toBe('***********')
    })
  })

  describe('PUT /expenses/:id', () => {
    it('updates route/distance without wiping the stored HETU when hetu is omitted', async () => {
      // Mirrors the admin edit form, which never sees the plaintext HETU back from
      // the API and so leaves the field blank unless the admin retypes it.
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })

      const putRes = await request(app)
        .put(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${memberToken}`)
        .send({
          mileageDetail: {
            route: 'HOME - EFHF - HOME',
            journeyDate: '2026-07-16',
            distanceKm: 42,
            boardApproved: false,
          },
        })
      expect(putRes.status).toBe(200)
      expect(putRes.body.mileageDetail.route).toBe('HOME - EFHF - HOME')
      expect(putRes.body.mileageDetail.distanceKm).toBe(42)

      await approveClaim(claimId, new Date())
      const revealRes = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')
      expect(revealRes.status).toBe(200)
      expect(revealRes.body.hetu).toBe('010101-123A')
    })

    it('re-encrypts the HETU when a new one is submitted', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })

      const putRes = await request(app)
        .put(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${memberToken}`)
        .send({
          mileageDetail: {
            route: 'HOME - EFHF - HOME',
            journeyDate: '2026-07-16',
            distanceKm: 42,
            boardApproved: false,
            hetu: '020202-456B',
          },
        })
      expect(putRes.status).toBe(200)

      await approveClaim(claimId, new Date())
      const revealRes = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')
      expect(revealRes.status).toBe(200)
      expect(revealRes.body.hetu).toBe('020202-456B')
    })
  })

  describe('GET /expenses/:id/mileage/hetu', () => {
    it('returns the plaintext HETU for EXPENSE_HETU_ADMIN and writes one audit row', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(200)
      expect(res.body.hetu).toBe('010101-123A')

      const auditRows = await db
        .selectFrom('accts.mileage_hetu_access_audit')
        .selectAll()
        .where('claim_id', '=', claimId)
        .execute()
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0].accessed_by).toBe('Liisa1')
      expect(auditRows[0].context).toBe('CLAIM_REVEAL')
    })

    it('rejects a committee member who only has EXPENSE_ADMIN', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${adminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(403)
    })

    it('rejects a plain member', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${memberToken}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 when the claim has no HETU on file', async () => {
      const claimId = await createMileageClaim({ journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(404)
    })

    it('rejects revealing HETU on a claim that is not yet approved', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(409)

      const auditRows = await db
        .selectFrom('accts.mileage_hetu_access_audit')
        .selectAll()
        .where('claim_id', '=', claimId)
        .execute()
      expect(auditRows).toHaveLength(0)
    })
  })

  describe('GET /expenses/:id/mileage/hetu/access-log', () => {
    it('lets the claim owner see who revealed their HETU and when', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu/access-log`)
        .set('Cookie', `accessToken=${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].accessedByName).toBe('Liisa Korhonen')
      expect(new Date(res.body.data[0].accessedAt).toString()).not.toBe('Invalid Date')
    })

    it('is empty when no one has viewed the HETU yet', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu/access-log`)
        .set('Cookie', `accessToken=${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('rejects a member who does not own the claim', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const otherMemberToken = generateAccessToken({
        memberId: 'Pekka1',
        lastName: 'Other',
        email: 'pekka@mik.fi',
        roles: [],
        permissions: [MIKPermissions.EXPENSE_USER],
        canMakeReservations: false,
      })

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu/access-log`)
        .set('Cookie', `accessToken=${otherMemberToken}`)

      expect(res.status).toBe(403)
    })
  })

  describe('GET /expenses/admin/mileage-report', () => {
    it('returns only approved mileage claims within the date range, never HETU', async () => {
      const inRange = await createMileageClaim({ hetu: '010101-123A', journeyDate: '2026-06-10' })
      await approveClaim(inRange, new Date('2026-06-11T00:00:00.000Z'))

      const outOfRange = await createMileageClaim({
        hetu: '020202-234B',
        journeyDate: '2026-08-01',
      })
      await approveClaim(outOfRange, new Date('2026-08-02T00:00:00.000Z'))

      const res = await request(app)
        .get('/expenses/admin/mileage-report')
        .query({ startDate: '2026-06-01', endDate: '2026-06-30' })
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(200)
      const claimIdsInReport = res.body.data.map((row: { claimId: string }) => row.claimId)
      expect(claimIdsInReport).toContain(inRange)
      expect(claimIdsInReport).not.toContain(outOfRange)
      expect(JSON.stringify(res.body)).not.toContain('hetu')
      expect(JSON.stringify(res.body)).not.toContain('010101-123A')
    })

    it('rejects a reversed date range', async () => {
      const res = await request(app)
        .get('/expenses/admin/mileage-report')
        .query({ startDate: '2026-06-30', endDate: '2026-06-01' })
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(400)
    })

    it('rejects a request from a committee member who only has EXPENSE_ADMIN', async () => {
      const res = await request(app)
        .get('/expenses/admin/mileage-report')
        .query({ startDate: '2026-06-01', endDate: '2026-06-30' })
        .set('Cookie', `accessToken=${adminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(403)
    })
  })
})
