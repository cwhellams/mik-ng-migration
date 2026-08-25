import 'dotenv/config'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { jest } from '@jest/globals'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import sharp from 'sharp'
import { sql } from 'kysely'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/expenses/api.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { storageService } from '../../../src/services/storage.ts'
import { SimplbooksEventType } from '../../../src/services/simplbooks/models.ts'

// ── Stub OSRM server ─────────────────────────────────────────────────────────
// Every mileage claim create/update now makes a real server-side call to OSRM (issue
// #1021's server-authoritative distance check) — this stubs it out so tests don't hit
// the live public router.project-osrm.org, stay deterministic, and don't flake on
// network availability/rate limits. Matches most test legs' `distanceKm: 99` by
// default so the >20% justification check doesn't unexpectedly trigger; tests that
// specifically exercise that check override `mockOsrmDistanceMeters` beforehand.
let mockOsrmDistanceMeters = 99_000
let osrmStubServer: http.Server

beforeAll(async () => {
  osrmStubServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: mockOsrmDistanceMeters }] }))
  })
  await new Promise<void>((resolve) => osrmStubServer.listen(0, resolve))
  const { port } = osrmStubServer.address() as AddressInfo
  process.env.OSRM_BASE_URL = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => osrmStubServer.close(() => resolve()))
})

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
    .selectFrom('accts.expenseCategory')
    .select('id')
    .where('code', '=', CATEGORY_CODE)
    .executeTakeFirstOrThrow()

  const claim = await db
    .insertInto('accts.expenseClaim')
    .values({
      memberId: MEMBER_ID,
      categoryId: category.id,
      title: 'Test claim',
      status,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return claim.id
}

// Every non-mileage claim now requires at least one attachment before it can be
// submitted (issue: members were confused when submit silently failed with no
// receipt attached) — most submit-flow tests below just need *a* receipt on file,
// not to exercise the attachment feature itself, so this is a one-line fixture for
// that rather than repeating the multer/sharp setup at every call site.
async function attachTestReceipt(claimId: string, token: string = memberToken): Promise<void> {
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 10, g: 200, b: 10 } },
  })
    .jpeg()
    .toBuffer()

  const res = await request(app)
    .post(`/expenses/${claimId}/attachments`)
    .set('Cookie', `accessToken=${token}`)
    .attach('files', image, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
  expect(res.status).toBe(201)
}

// ── Tests: GET /expenses/admin/pending/count ───────────────────────────────────

describe('GET /expenses/admin/pending/count', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
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
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function mileageCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'mileage')
      .executeTakeFirstOrThrow()
    return category.id
  }

  function makeLeg(overrides: Record<string, unknown> = {}) {
    return {
      startAddress: 'Helsinki',
      startLat: 60.1699,
      startLon: 24.9384,
      endAddress: 'Tampere',
      endLat: 61.4978,
      endLon: 23.761,
      journeyDate: '2026-07-16',
      distanceKm: 99,
      boardApproved: false,
      ...overrides,
    }
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
            description: 'Helsinki - Tampere',
            date: '2026-07-16',
            quantity: 99,
            unit: 'km',
            unitPrice: 0.275,
            sortOrder: 0,
          },
        ],
        // Legacy clients may still send this on a leg — the API must silently ignore it.
        mileageLegs: [makeLeg({ passengers: ['Someone'] })],
        hetu: '010101-123N',
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)

    expect(res.body.mileageLegs).toHaveLength(1)
    expect(res.body.mileageLegs[0].startAddress).toBe('Helsinki')
    expect(res.body.mileageLegs[0].endAddress).toBe('Tampere')
    expect(res.body.mileageLegs[0].distanceKm).toBe(99)
    expect(res.body.mileageLegs[0]).not.toHaveProperty('passengers')
    expect(res.body.hetu).toBe('***********')
  })

  it('creates a mileage claim with multiple one-way legs, summing their reimbursement', async () => {
    const categoryId = await mileageCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Multi-leg mileage test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            description: 'Helsinki - Tampere',
            date: '2026-07-16',
            quantity: 99,
            unit: 'km',
            unitPrice: 0.275,
            sortOrder: 0,
          },
          {
            description: 'Tampere - Helsinki',
            date: '2026-07-17',
            quantity: 99,
            unit: 'km',
            unitPrice: 0.275,
            sortOrder: 1,
          },
        ],
        mileageLegs: [
          makeLeg({ journeyDate: '2026-07-16' }),
          makeLeg({
            startAddress: 'Tampere',
            endAddress: 'Helsinki',
            journeyDate: '2026-07-17',
          }),
        ],
        hetu: '010101-123N',
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)

    expect(res.body.mileageLegs).toHaveLength(2)
    expect(res.body.totalAmount).toBeCloseTo(2 * 99 * 0.275, 2)
  })

  it('requires a justification note when a leg exceeds the direct distance by more than 20%', async () => {
    const categoryId = await mileageCategoryId()
    // Server recomputes the direct distance itself (issue #1021) rather than trusting
    // the client-submitted directDistanceKm below — point the stub at 100km so the
    // submitted 150km leg genuinely exceeds the 20% threshold server-side.
    mockOsrmDistanceMeters = 100_000

    const withoutNote = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Detour without justification',
        lineItems: [
          { description: 'Helsinki - Tampere', quantity: 150, unit: 'km', unitPrice: 0.275 },
        ],
        mileageLegs: [makeLeg({ distanceKm: 150, directDistanceKm: 100 })],
        hetu: '010101-123N',
      })
    expect(withoutNote.status).toBe(400)

    const withNote = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Detour with justification',
        lineItems: [
          { description: 'Helsinki - Tampere', quantity: 150, unit: 'km', unitPrice: 0.275 },
        ],
        mileageLegs: [
          makeLeg({
            distanceKm: 150,
            directDistanceKm: 100,
            justificationNote: 'Road closure forced a detour via Lahti.',
            boardApproved: true,
          }),
        ],
        hetu: '010101-123N',
      })
    expect(withNote.status).toBe(201)
    insertedClaimIds.push(withNote.body.id)
    expect(withNote.body.mileageLegs[0].justificationNote).toBe(
      'Road closure forced a detour via Lahti.',
    )
    mockOsrmDistanceMeters = 99_000
  })

  // Regression test: MILEAGE_MAX_KM/boardApproved was previously only checked
  // client-side (VITE_MILEAGE_MAX_KM) with no server-side equivalent — a client could
  // submit any distance with boardApproved left false, or spoofed true, unchecked.
  it('requires board approval for a leg above MILEAGE_MAX_KM regardless of client-claimed boardApproved', async () => {
    const categoryId = await mileageCategoryId()

    const withoutApproval = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Long leg, no board approval',
        lineItems: [
          { description: 'Helsinki - Oulu', quantity: 600, unit: 'km', unitPrice: 0.275 },
        ],
        mileageLegs: [
          makeLeg({
            distanceKm: 600,
            directDistanceKm: 99,
            justificationNote: 'Long cross-country training flight.',
            boardApproved: false,
          }),
        ],
        hetu: '010101-123N',
      })
    expect(withoutApproval.status).toBe(400)

    const withApproval = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Long leg, board approved',
        lineItems: [
          { description: 'Helsinki - Oulu', quantity: 600, unit: 'km', unitPrice: 0.275 },
        ],
        mileageLegs: [
          makeLeg({
            distanceKm: 600,
            directDistanceKm: 99,
            justificationNote: 'Long cross-country training flight.',
            boardApproved: true,
          }),
        ],
        hetu: '010101-123N',
      })
    expect(withApproval.status).toBe(201)
    insertedClaimIds.push(withApproval.body.id)
  })

  // Regression test: a client that simply omits directDistanceKm must not be able to
  // bypass the justification-note requirement — the server recomputes the direct
  // distance itself (via OSRM) and enforces the check against that value, not
  // whatever (if anything) the client claims.
  it('cannot bypass the justification-note requirement by omitting directDistanceKm', async () => {
    const categoryId = await mileageCategoryId()
    mockOsrmDistanceMeters = 100_000 // server "measures" 100km regardless of client input

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Detour, no directDistanceKm claimed at all',
        lineItems: [
          { description: 'Helsinki - Tampere', quantity: 150, unit: 'km', unitPrice: 0.275 },
        ],
        // No directDistanceKm field at all — this is exactly what a client bypassing
        // the client-side check would send.
        mileageLegs: [makeLeg({ distanceKm: 150 })],
        hetu: '010101-123N',
      })

    expect(res.status).toBe(400)
    mockOsrmDistanceMeters = 99_000
  })

  // Manually-entered addresses (no lat/lon — e.g. address lookup was unavailable) must
  // still be accepted: distance verification is skipped for that leg rather than
  // blocking the claim, per issue #1021's "help, don't block" requirement.
  it('accepts a leg with manually-entered addresses (no coordinates) and skips distance verification', async () => {
    const categoryId = await mileageCategoryId()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId,
        title: 'Manual entry, address lookup was down',
        lineItems: [
          { description: 'Helsinki - Tampere', quantity: 500, unit: 'km', unitPrice: 0.275 },
        ],
        mileageLegs: [
          {
            startAddress: 'Helsinki (typed manually)',
            endAddress: 'Tampere (typed manually)',
            journeyDate: '2026-07-16',
            distanceKm: 500,
            boardApproved: true,
          },
        ],
        hetu: '010101-123N',
      })

    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    expect(res.body.mileageLegs[0].startAddress).toBe('Helsinki (typed manually)')
    expect(res.body.mileageLegs[0].directDistanceKm).toBeUndefined()
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
        mileageLegs: [makeLeg({ journeyDate: '2026-07-16' })],
        hetu: '010101-123N',
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
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function fuelCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expenseCategory')
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
        fuelType: 'JET A-1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JET A-1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JET A-1',
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

  // Issue #955: cross-trip balanced fuel price cap, computed live from local_fuel_price
  // + line items (never persisted onto totalAmount).
  describe('fuelReimbursementSummary', () => {
    const insertedPriceIds: number[] = []

    afterEach(async () => {
      if (insertedPriceIds.length > 0) {
        await db.deleteFrom('accts.localFuelPrice').where('id', 'in', insertedPriceIds).execute()
        insertedPriceIds.length = 0
      }
    })

    async function insertLocalPrice(fuelType: string, priceEurPerLitre: number, validFrom: string) {
      const row = await db
        .insertInto('accts.localFuelPrice')
        .values({
          fuelType: fuelType,
          priceEurPerLitre: priceEurPerLitre,
          validFrom: validFrom,
          createdBy: 'Juha1',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      insertedPriceIds.push(row.id)
    }

    it('balances a cheap and a pricy stop, and excludes club-card litres from the payout', async () => {
      await insertLocalPrice('JET A-1', 3.0, '2026-01-01')
      const categoryId = await fuelCategoryId()

      const res = await request(app)
        .post('/expenses')
        .set('Cookie', `accessToken=${memberToken}`)
        .send({
          categoryId,
          title: 'Cross-country fuel test',
          currency: 'EUR',
          expenseDate: '2026-07-15',
          lineItems: [
            {
              description: 'Home base, cheap',
              date: '2026-07-15',
              airport: 'EFNU',
              quantity: 50,
              unit: 'l',
              unitPrice: 2.0,
              fuelType: 'JET A-1',
              costCentreCode: 'OH-STL',
              sortOrder: 0,
            },
            {
              description: 'Outstation, expensive',
              date: '2026-07-15',
              airport: 'EFTU',
              quantity: 50,
              unit: 'l',
              unitPrice: 4.0,
              fuelType: 'JET A-1',
              costCentreCode: 'OH-STL',
              sortOrder: 1,
            },
            {
              description: 'Paid with club card',
              date: '2026-07-15',
              airport: 'EFNU',
              quantity: 20,
              unit: 'l',
              unitPrice: 3.0,
              fuelType: 'JET A-1',
              costCentreCode: 'OH-STL',
              paidWithClubCard: true,
              sortOrder: 2,
            },
          ],
        })

      expect(res.status).toBe(201)
      insertedClaimIds.push(res.body.id)

      const summary = res.body.fuelReimbursementSummary
      expect(summary).toBeDefined()
      expect(summary.totalLitres).toBe(120)
      expect(summary.totalCost).toBe(360) // 100 + 200 + 60
      expect(summary.localPriceCost).toBe(360) // 120 * 3.00
      expect(summary.cappedTotal).toBe(360)
      expect(summary.clubCardCost).toBe(60)
      expect(summary.memberReimbursement).toBe(300) // 360 - 60 club card
      expect(summary.memberOwesClub).toBe(0)
      expect(summary.capped).toBe(false)
    })

    it('is undefined when no local price has been configured for the fuel type', async () => {
      const categoryId = await fuelCategoryId()

      const res = await request(app)
        .post('/expenses')
        .set('Cookie', `accessToken=${memberToken}`)
        .send({
          categoryId,
          title: 'No local price configured',
          currency: 'EUR',
          expenseDate: '2026-07-15',
          lineItems: [
            {
              description: 'Fuel',
              date: '2026-07-15',
              airport: 'EFNU',
              quantity: 50,
              unit: 'l',
              unitPrice: 2.0,
              fuelType: 'MOGAS 98E5',
              costCentreCode: 'OH-STL',
              sortOrder: 0,
            },
          ],
        })

      expect(res.status).toBe(201)
      insertedClaimIds.push(res.body.id)
      expect(res.body.fuelReimbursementSummary.localPriceCost).toBeNull()
      expect(res.body.fuelReimbursementSummary.memberReimbursement).toBe(100)
    })
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
        fuelType: 'JET A-1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '30 l JET A-1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 30,
            unit: 'l',
            unitPrice: 50 / 30,
            totalCost: 50,
            fuelType: 'JET A-1',
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
        fuelType: 'JET A-1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JET A-1',
            date: '2026-07-16',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JET A-1',
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
        fuelType: 'JET A-1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JET A-1',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JET A-1',
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
        fuelType: 'JET A-1',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            itemId: null,
            description: '100 l JET A-1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JET A-1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })
    expect(create.status).toBe(201)
    insertedClaimIds.push(create.body.id)
    await attachTestReceipt(create.body.id)

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
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function fuelCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expenseCategory')
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
            description: '100 l JET A-1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JET A-1',
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
    expect(res.body.lineItems[0].fuelType).toBe('JET A-1')
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
            description: '100 l JET A-1',
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
            description: '100 l JET A-1',
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
      .insertInto('accts.expenseClaim')
      .values({
        memberId: 'Juha1',
        categoryId: categoryId,
        title: 'Legacy fuel claim',
        status: ExpenseClaimStatus.DRAFT,
        // Predates the airport/date field (see FUEL_LINE_ITEM_AIRPORT_DATE_CUTOFF in
        // api.ts) — genuinely simulates legacy data rather than relying on the line
        // item merely having a persisted id, which no longer signals "legacy" now
        // that every item gets an id as soon as a draft is first saved.
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    insertedClaimIds.push(claim.id)

    const lineItem = await db
      .insertInto('accts.expenseClaimLineItem')
      .values({
        claimId: claim.id,
        description: '100 l JET A-1 (legacy, no airport recorded)',
        quantity: 100,
        unit: 'l',
        unitPrice: 1.5,
        sortOrder: 0,
        costCentreCode: 'OH-STL',
        fuelType: 'JET A-1',
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
            description: '100 l JET A-1 (legacy, no airport recorded)',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JET A-1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })

    expect(editRes.status).toBe(200)
    expect(editRes.body.title).toBe('Legacy fuel claim (edited)')
    expect(editRes.body.lineItems[0].airport).toBeFalsy()
    await attachTestReceipt(claim.id)

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
      .insertInto('accts.expenseClaim')
      .values({
        memberId: 'Juha1',
        categoryId: categoryId,
        title: 'Legacy fuel claim (pre-aircraft-field)',
        status: ExpenseClaimStatus.DRAFT,
        // Predates FUEL_LINE_ITEM_AIRCRAFT_CUTOFF in api.ts - genuinely simulates
        // legacy data from before aircraft was tracked per line item.
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date(),
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-01-01',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    insertedClaimIds.push(claim.id)

    await db
      .insertInto('accts.expenseClaimLineItem')
      .values({
        claimId: claim.id,
        description: '100 l JET A-1 (legacy, no aircraft recorded)',
        quantity: 100,
        unit: 'l',
        unitPrice: 1.5,
        sortOrder: 0,
        fuelType: 'JET A-1',
        airport: 'EFHK',
        fuelDate: '2026-01-01',
        // cost_centre_code intentionally left null - predates per-line-item aircraft.
      })
      .execute()
    await attachTestReceipt(claim.id)

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
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createSubmittedFuelClaim(unitPrice: number): Promise<string> {
    const category = await db
      .selectFrom('accts.expenseCategory')
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
            description: '100 l JET A-1',
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
    await attachTestReceipt(create.body.id)

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
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function miscCategoryId(): Promise<number> {
    const category = await db
      .selectFrom('accts.expenseCategory')
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
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createDraft(lineItems: unknown[]): Promise<string> {
    const category = await db
      .selectFrom('accts.expenseCategory')
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
    await attachTestReceipt(claimId)

    const res = await request(app)
      .post(`/expenses/${claimId}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe(ExpenseClaimStatus.SUBMITTED)
  })

  it('rejects submitting a non-mileage claim with no receipt attachment', async () => {
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

    expect(res.status).toBe(400)
    expect(res.body.detail).toBe('At least one receipt attachment is required before submitting.')
  })
})

// A mileage claim must say who travelled where before it is payable: the wizard omits
// mileageLegs entirely while any leg is incomplete and HETU is never required to save a
// draft, so without a submit-time check an empty mileage claim — still carrying the
// frontend's positive default km line item — could be submitted and approved (issue #1021).
describe('POST /expenses/:id/submit (mileage requirements)', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createMileageDraft(body: Record<string, unknown>): Promise<string> {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'mileage')
      .executeTakeFirstOrThrow()

    const res = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Mileage submit validation',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-07-15',
        lineItems: [
          {
            description: 'Helsinki - Tampere',
            date: '2026-07-16',
            quantity: 99,
            unit: 'km',
            unitPrice: 0.275,
            sortOrder: 0,
          },
        ],
        ...body,
      })
    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    return res.body.id
  }

  const validLeg = {
    startAddress: 'Helsinki',
    startLat: 60.1699,
    startLon: 24.9384,
    endAddress: 'Tampere',
    endLat: 61.4978,
    endLon: 23.761,
    journeyDate: '2026-07-16',
    distanceKm: 99,
    boardApproved: false,
  }

  it('rejects submitting a mileage claim with no legs', async () => {
    const claimId = await createMileageDraft({ hetu: '010101-123N' })

    const res = await request(app)
      .post(`/expenses/${claimId}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(400)
    expect(res.body.detail).toBe('A mileage claim needs at least one journey leg.')
  })

  it('rejects submitting a mileage claim with no HETU', async () => {
    const claimId = await createMileageDraft({ mileageLegs: [validLeg] })

    const res = await request(app)
      .post(`/expenses/${claimId}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('valid Finnish personal identity code')
  })

  it('rejects submitting a mileage claim whose HETU fails its checksum', async () => {
    const claimId = await createMileageDraft({
      mileageLegs: [validLeg],
      hetu: '010101-123A', // one character off — a typo, not a real identity code
    })

    const res = await request(app)
      .post(`/expenses/${claimId}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('valid Finnish personal identity code')
  })

  it('submits a mileage claim with a valid leg and HETU, with no attachment', async () => {
    const claimId = await createMileageDraft({
      mileageLegs: [validLeg],
      hetu: '010101-123N',
    })

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
        .deleteFrom('accts.mileageHetuAccessAudit')
        .where('claimId', 'in', insertedClaimIds)
        .execute()
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createMileageClaim(options: {
    hetu?: string
    journeyDate: string
    distanceKm?: number
  }): Promise<string> {
    const category = await db
      .selectFrom('accts.expenseCategory')
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
        mileageLegs: [
          {
            startAddress: 'Home',
            startLat: 60.1699,
            startLon: 24.9384,
            endAddress: 'Rovaniemi',
            endLat: 66.5039,
            endLon: 25.7294,
            journeyDate: options.journeyDate,
            distanceKm: options.distanceKm ?? 99,
            boardApproved: false,
          },
        ],
        ...(options.hetu ? { hetu: options.hetu } : {}),
      })
    expect(res.status).toBe(201)
    insertedClaimIds.push(res.body.id)
    return res.body.id
  }

  async function approveClaim(claimId: string, approvedAt: Date): Promise<void> {
    await db
      .updateTable('accts.expenseClaim')
      .set({
        status: ExpenseClaimStatus.APPROVED,
        approvedAt: approvedAt,
        approvedBy: 'Liisa1',
      })
      .where('id', '=', claimId)
      .execute()
  }

  describe('GET /expenses/:id', () => {
    it('always returns a masked HETU, never the plaintext', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })

      const asMember = await request(app)
        .get(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${memberToken}`)
      expect(asMember.status).toBe(200)
      expect(asMember.body.hetu).toBe('***********')

      const asAdmin = await request(app)
        .get(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')
      expect(asAdmin.status).toBe(200)
      expect(asAdmin.body.hetu).toBe('***********')
    })
  })

  describe('PUT /expenses/:id', () => {
    it('updates leg distance without wiping the stored HETU when hetu is omitted', async () => {
      // Mirrors the admin edit form, which never sees the plaintext HETU back from
      // the API and so leaves the field blank unless the admin retypes it.
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })

      const putRes = await request(app)
        .put(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${memberToken}`)
        .send({
          mileageLegs: [
            {
              startAddress: 'Home',
              startLat: 60.1699,
              startLon: 24.9384,
              endAddress: 'Helsinki-Malmi',
              endLat: 60.2544,
              endLon: 25.0428,
              journeyDate: '2026-07-16',
              distanceKm: 42,
              boardApproved: false,
            },
          ],
        })
      expect(putRes.status).toBe(200)
      expect(putRes.body.mileageLegs[0].endAddress).toBe('Helsinki-Malmi')
      expect(putRes.body.mileageLegs[0].distanceKm).toBe(42)

      await approveClaim(claimId, new Date())
      const revealRes = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')
      expect(revealRes.status).toBe(200)
      expect(revealRes.body.hetu).toBe('010101-123N')
    })

    it('re-encrypts the HETU when a new one is submitted', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })

      const putRes = await request(app)
        .put(`/expenses/${claimId}`)
        .set('Cookie', `accessToken=${memberToken}`)
        .send({
          mileageLegs: [
            {
              startAddress: 'Home',
              startLat: 60.1699,
              startLon: 24.9384,
              endAddress: 'Helsinki-Malmi',
              endLat: 60.2544,
              endLon: 25.0428,
              journeyDate: '2026-07-16',
              distanceKm: 42,
              boardApproved: false,
            },
          ],
          hetu: '020202-4564',
        })
      expect(putRes.status).toBe(200)

      await approveClaim(claimId, new Date())
      const revealRes = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')
      expect(revealRes.status).toBe(200)
      expect(revealRes.body.hetu).toBe('020202-4564')
    })
  })

  describe('GET /expenses/:id/mileage/hetu', () => {
    it('returns the plaintext HETU for EXPENSE_HETU_ADMIN and writes one audit row', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(200)
      expect(res.body.hetu).toBe('010101-123N')

      const auditRows = await db
        .selectFrom('accts.mileageHetuAccessAudit')
        .selectAll()
        .where('claimId', '=', claimId)
        .execute()
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0].accessedBy).toBe('Liisa1')
      expect(auditRows[0].context).toBe('CLAIM_REVEAL')
    })

    it('rejects a committee member who only has EXPENSE_ADMIN', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${adminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(403)
    })

    it('rejects a plain member', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })
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
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu`)
        .set('Cookie', `accessToken=${hetuAdminToken}`)
        .set('x-sudo', 'true')

      expect(res.status).toBe(409)

      const auditRows = await db
        .selectFrom('accts.mileageHetuAccessAudit')
        .selectAll()
        .where('claimId', '=', claimId)
        .execute()
      expect(auditRows).toHaveLength(0)
    })
  })

  describe('GET /expenses/:id/mileage/hetu/access-log', () => {
    it('lets the claim owner see who revealed their HETU and when', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })
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
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })
      await approveClaim(claimId, new Date())

      const res = await request(app)
        .get(`/expenses/${claimId}/mileage/hetu/access-log`)
        .set('Cookie', `accessToken=${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('rejects a member who does not own the claim', async () => {
      const claimId = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-07-16' })
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
      const inRange = await createMileageClaim({ hetu: '010101-123N', journeyDate: '2026-06-10' })
      await approveClaim(inRange, new Date('2026-06-11T00:00:00.000Z'))

      const outOfRange = await createMileageClaim({
        hetu: '020202-234Y',
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
      expect(JSON.stringify(res.body)).not.toContain('010101-123N')
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

// ── Tests: PATCH /expenses/:id/edit (issue #1028) ───────────────────────────────

describe('PATCH /expenses/:id/edit (treasurer edit before approval)', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db
        .deleteFrom('accts.expenseClaimEditAudit')
        .where('claimId', 'in', insertedClaimIds)
        .execute()
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  async function createSubmittedClaim(): Promise<{ claimId: string; lineItemId: number }> {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'misc')
      .executeTakeFirstOrThrow()

    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Treasurer edit test',
        expenseDate: '2026-07-15',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        lineItems: [
          {
            description: 'Original description',
            quantity: 1,
            unit: 'pcs',
            unitPrice: 10,
            sortOrder: 0,
          },
        ],
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)
    await attachTestReceipt(created.body.id)

    const submitted = await request(app)
      .post(`/expenses/${created.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(submitted.status).toBe(200)

    return { claimId: created.body.id, lineItemId: created.body.lineItems[0].id }
  }

  it('lets a treasurer correct a line item without resetting status, and logs a message', async () => {
    const { claimId, lineItemId } = await createSubmittedClaim()

    const res = await request(app)
      .patch(`/expenses/${claimId}/edit`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        lineItems: [{ id: lineItemId, description: 'Corrected description', unitPrice: 12 }],
      })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe(ExpenseClaimStatus.SUBMITTED)
    expect(res.body.lineItems[0].description).toBe('Corrected description')
    expect(res.body.lineItems[0].unitPrice).toBe(12)

    const detail = await request(app)
      .get(`/expenses/${claimId}`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(
      detail.body.messages.some((m: { body: string }) => m.body.includes('Treasurer corrected')),
    ).toBe(true)

    const auditRows = await db
      .selectFrom('accts.expenseClaimEditAudit')
      .selectAll()
      .where('claimId', '=', claimId)
      .execute()
    expect(auditRows).toHaveLength(2) // description + unitPrice
    expect(auditRows.map((r) => r.fieldName).sort()).toEqual(['description', 'unitPrice'])
  })

  it('is a no-op (no message, no audit rows) when nothing actually changed', async () => {
    const { claimId, lineItemId } = await createSubmittedClaim()

    const res = await request(app)
      .patch(`/expenses/${claimId}/edit`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ lineItems: [{ id: lineItemId, description: 'Original description' }] })

    expect(res.status).toBe(200)
    const auditRows = await db
      .selectFrom('accts.expenseClaimEditAudit')
      .selectAll()
      .where('claimId', '=', claimId)
      .execute()
    expect(auditRows).toHaveLength(0)
  })

  // Regression test: LINE_ITEM_FIELD_COLUMNS had no entry for totalCost, so correcting
  // unitPrice on a line item that was originally submitted with an explicit totalCost
  // (via the FX "enter total, derive unit price" flow) left the stale totalCost in
  // place, and the claim total (coalesce(total_cost, quantity*unit_price)) kept using
  // the old figure.
  it('clears a stale totalCost when the treasurer corrects unitPrice', async () => {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'misc')
      .executeTakeFirstOrThrow()

    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Total cost staleness test',
        expenseDate: '2026-07-15',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        lineItems: [
          {
            description: 'Foreign currency item',
            quantity: 100,
            unit: 'pcs',
            unitPrice: 2.755,
            totalCost: 275.5,
            sortOrder: 0,
          },
        ],
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)
    const lineItemId = created.body.lineItems[0].id
    await attachTestReceipt(created.body.id)

    const submitted = await request(app)
      .post(`/expenses/${created.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(submitted.status).toBe(200)

    const res = await request(app)
      .patch(`/expenses/${created.body.id}/edit`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ lineItems: [{ id: lineItemId, unitPrice: 3.0 }] })

    expect(res.status).toBe(200)
    expect(res.body.lineItems[0].unitPrice).toBe(3.0)
    expect(res.body.lineItems[0].totalCost).toBeNull()
    // 100 * 3.0, not the stale 275.50
    expect(res.body.totalAmount).toBeCloseTo(300, 2)

    const auditRows = await db
      .selectFrom('accts.expenseClaimEditAudit')
      .selectAll()
      .where('claimId', '=', created.body.id)
      .execute()
    expect(auditRows.map((r) => r.fieldName).sort()).toEqual(['totalCost', 'unitPrice'])
  })

  // The treasurer's edit dialog (like the member's own form) lets the treasurer type the
  // known total and derives unitPrice from it, so it sends both. Without totalCost in the
  // patch schema the exact figure was dropped and rebuilt from the rounded unit price,
  // reintroducing the drift issue #1024 fixed for members (30 l for 50.00 EUR ->
  // unitPrice 1.6667 -> 30 * 1.6667 = 50.01).
  it('persists an explicit totalCost sent alongside unitPrice, without drift', async () => {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()

    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Treasurer total cost test',
        expenseDate: '2026-07-15',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        lineItems: [
          {
            description: 'Fuel',
            date: '2026-07-15',
            airport: 'EFNU',
            quantity: 30,
            unit: 'l',
            unitPrice: 2.0,
            totalCost: 60,
            fuelType: 'JET A-1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)
    const lineItemId = created.body.lineItems[0].id
    await attachTestReceipt(created.body.id)
    await request(app)
      .post(`/expenses/${created.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    // Treasurer corrects the total to 50.00 -> unitPrice 50/30 = 1.6667 (4 dp).
    const res = await request(app)
      .patch(`/expenses/${created.body.id}/edit`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ lineItems: [{ id: lineItemId, unitPrice: 1.6667, totalCost: 50 }] })

    expect(res.status).toBe(200)
    expect(res.body.lineItems[0].totalCost).toBe(50)
    expect(res.body.totalAmount).toBe(50) // not 50.01
  })

  // Regression test: updateExpenseClaim recomputes refuel_outside_finland from the fuel
  // line items' airports, but treasurerEditExpenseClaim didn't — a corrected airport
  // silently left the claim-level flag disagreeing with the actual line items.
  it('recomputes refuelOutsideFinland when the treasurer corrects a fuel line item airport', async () => {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()

    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Refuel outside Finland recompute test',
        currency: 'EUR',
        expenseDate: '2026-07-15',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        lineItems: [
          {
            description: '100 l JET A-1',
            date: '2026-07-16',
            airport: 'EFNU',
            quantity: 100,
            unit: 'l',
            unitPrice: 1.5,
            fuelType: 'JET A-1',
            costCentreCode: 'OH-STL',
            sortOrder: 0,
          },
        ],
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)
    expect(created.body.refuelOutsideFinland).toBe(false)
    const lineItemId = created.body.lineItems[0].id
    await attachTestReceipt(created.body.id)

    const submitted = await request(app)
      .post(`/expenses/${created.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(submitted.status).toBe(200)

    const res = await request(app)
      .patch(`/expenses/${created.body.id}/edit`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ lineItems: [{ id: lineItemId, airport: 'EEPU' }] })

    expect(res.status).toBe(200)
    expect(res.body.refuelOutsideFinland).toBe(true)
  })

  it('rejects a treasurer editing their own claim', async () => {
    // Inserted directly (bypassing POST /expenses + /submit) so this test doesn't need
    // an IBAN — going through the real submit flow would call syncMemberIbanFromClaim
    // and leak a profile IBAN onto the admin token's member row, polluting unrelated
    // tests (e.g. members/api.test.ts's snapshot of that member).
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'misc')
      .executeTakeFirstOrThrow()

    const created = await db
      .insertInto('accts.expenseClaim')
      .values({
        memberId: 'Liisa1', // matches adminToken's memberId — this is the self-edit case
        categoryId: category.id,
        title: 'Self-edit test',
        status: ExpenseClaimStatus.SUBMITTED,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    insertedClaimIds.push(created.id)

    const res = await request(app)
      .patch(`/expenses/${created.id}/edit`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ title: 'Trying to self-edit' })

    expect(res.status).toBe(403)
  })

  it('rejects editing a claim that is not awaiting approval (draft)', async () => {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'misc')
      .executeTakeFirstOrThrow()

    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Draft claim',
        lineItems: [{ description: 'Item', quantity: 1, unit: 'pcs', unitPrice: 10, sortOrder: 0 }],
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)

    const res = await request(app)
      .patch(`/expenses/${created.body.id}/edit`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ title: 'Should not apply' })

    expect(res.status).toBe(409)
  })

  it('rejects a member without EXPENSE_ADMIN', async () => {
    const { claimId } = await createSubmittedClaim()

    const res = await request(app)
      .patch(`/expenses/${claimId}/edit`)
      .set('Cookie', `accessToken=${memberToken}`)
      .send({ title: 'Should not apply' })

    expect(res.status).toBe(403)
  })
})

// ── Tests: multiple attachments (issue #955) ────────────────────────────────────

describe('Expense claim attachments', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
    jest.restoreAllMocks()
  })

  async function createDraftClaim(): Promise<string> {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'misc')
      .executeTakeFirstOrThrow()
    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Attachments test',
        lineItems: [{ description: 'Item', quantity: 1, unit: 'pcs', unitPrice: 10, sortOrder: 0 }],
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)
    return created.body.id
  }

  async function jpegBuffer(): Promise<Buffer> {
    return sharp({
      create: { width: 20, height: 15, channels: 3, background: { r: 10, g: 200, b: 10 } },
    })
      .jpeg()
      .toBuffer()
  }

  it('uploads multiple attachments and lists them on the claim', async () => {
    const claimId = await createDraftClaim()
    const image = await jpegBuffer()

    const res = await request(app)
      .post(`/expenses/${claimId}/attachments`)
      .set('Cookie', `accessToken=${memberToken}`)
      .attach('files', image, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('files', image, { filename: 'b.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(2)

    const claim = await request(app)
      .get(`/expenses/${claimId}`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(claim.body.attachments).toHaveLength(2)
  })

  // Regression test: the rollback deleted every uploaded object but left the attachment
  // rows inserted by earlier iterations, so the claim ended up pointing at files that no
  // longer existed — its preview and approval then failed and the member could not retry.
  it('leaves no attachment rows behind when a later file fails to upload', async () => {
    const claimId = await createDraftClaim()
    const image = await jpegBuffer()

    const deleteSpy = jest.spyOn(storageService, 'deleteFile').mockResolvedValue(undefined)
    const realUpload = storageService.uploadFile.bind(storageService)
    let uploadCount = 0
    jest
      .spyOn(storageService, 'uploadFile')
      .mockImplementation(async (...args: Parameters<typeof storageService.uploadFile>) => {
        if (++uploadCount === 2) throw new Error('Storage unavailable')
        return realUpload(...args)
      })

    const res = await request(app)
      .post(`/expenses/${claimId}/attachments`)
      .set('Cookie', `accessToken=${memberToken}`)
      .attach('files', image, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('files', image, { filename: 'b.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(500)
    // The one object that did make it up is deleted...
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    // ...and no half-written attachment rows survive.
    const claim = await request(app)
      .get(`/expenses/${claimId}`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(claim.body.attachments).toHaveLength(0)
  })

  it('rejects uploads beyond the per-claim attachment limit', async () => {
    const claimId = await createDraftClaim()
    const image = await jpegBuffer()

    let req = request(app)
      .post(`/expenses/${claimId}/attachments`)
      .set('Cookie', `accessToken=${memberToken}`)
    for (let i = 0; i < 11; i++) {
      req = req.attach('files', image, { filename: `${i}.jpg`, contentType: 'image/jpeg' })
    }
    const res = await req
    expect(res.status).toBe(400)
  })

  it('deletes an attachment', async () => {
    const claimId = await createDraftClaim()
    const image = await jpegBuffer()

    const uploaded = await request(app)
      .post(`/expenses/${claimId}/attachments`)
      .set('Cookie', `accessToken=${memberToken}`)
      .attach('files', image, { filename: 'a.jpg', contentType: 'image/jpeg' })
    const attachmentId = uploaded.body[0].id

    const del = await request(app)
      .delete(`/expenses/${claimId}/attachments/${attachmentId}`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(del.status).toBe(204)

    const claim = await request(app)
      .get(`/expenses/${claimId}`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(claim.body.attachments).toHaveLength(0)
  })

  it('rejects another member from uploading, deleting, or previewing attachments', async () => {
    const claimId = await createDraftClaim()
    const otherMemberToken = generateAccessToken({
      memberId: 'Pekka1',
      lastName: 'Other',
      email: 'pekka@mik.fi',
      roles: [],
      permissions: [MIKPermissions.EXPENSE_USER],
      canMakeReservations: false,
    })

    const image = await jpegBuffer()
    const res = await request(app)
      .post(`/expenses/${claimId}/attachments`)
      .set('Cookie', `accessToken=${otherMemberToken}`)
      .attach('files', image, { filename: 'a.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(403)
  })

  it('returns a merged PDF preview, and 404 when there are no attachments', async () => {
    const claimId = await createDraftClaim()

    const empty = await request(app)
      .get(`/expenses/${claimId}/attachments/merged-preview`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(empty.status).toBe(404)

    const image = await jpegBuffer()
    await request(app)
      .post(`/expenses/${claimId}/attachments`)
      .set('Cookie', `accessToken=${memberToken}`)
      .attach('files', image, { filename: 'a.jpg', contentType: 'image/jpeg' })

    // The default test-mode storage mock returns dummy (non-image) bytes for any key —
    // stub a real decodable image here so the merge step has something valid to embed.
    jest.spyOn(storageService, 'downloadFile').mockResolvedValue(image)

    const preview = await request(app)
      .get(`/expenses/${claimId}/attachments/merged-preview`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(preview.status).toBe(200)
    expect(preview.headers['content-type']).toBe('application/pdf')
  })
})

// ── Tests: what actually gets paid on approval (issue #955) ───────────────────
// The balanced fuel price cap was computed for display only; approval still queued
// every raw line item — including club-card ones — so a capped claim was paid its
// uncapped amount and club-card fuel was reimbursed on top.
describe('POST /expenses/:id/approve (fuel reimbursement cap)', () => {
  const insertedClaimIds: string[] = []
  const insertedPriceIds: number[] = []

  afterEach(async () => {
    for (const claimId of insertedClaimIds) {
      await db
        .deleteFrom('accts.outboxSimplbooks')
        .where(sql<boolean>`payload ->> 'claimId' = ${claimId}`)
        .execute()
    }
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expenseClaim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
    if (insertedPriceIds.length > 0) {
      await db.deleteFrom('accts.localFuelPrice').where('id', 'in', insertedPriceIds).execute()
      insertedPriceIds.length = 0
    }
  })

  async function insertLocalPrice(fuelType: string, price: number, validFrom: string) {
    const row = await db
      .insertInto('accts.localFuelPrice')
      .values({
        fuelType: fuelType,
        priceEurPerLitre: price,
        validFrom: validFrom,
        createdBy: 'Juha1',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    insertedPriceIds.push(row.id)
  }

  async function createSubmittedFuelClaim(lineItems: Record<string, unknown>[]): Promise<string> {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', 'fuel')
      .executeTakeFirstOrThrow()

    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Fuel payout test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-07-15',
        lineItems: lineItems.map((item, index) => ({
          date: '2026-07-15',
          airport: 'EFNU',
          unit: 'l',
          fuelType: 'JET A-1',
          costCentreCode: 'OH-STL',
          sortOrder: index,
          ...item,
        })),
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)

    await attachTestReceipt(created.body.id)
    const submitted = await request(app)
      .post(`/expenses/${created.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)
    expect(submitted.status).toBe(200)
    return created.body.id
  }

  async function outboxFor(claimId: string, eventType: SimplbooksEventType) {
    return db
      .selectFrom('accts.outboxSimplbooks')
      .selectAll()
      .where('eventType', '=', eventType)
      .where(sql<boolean>`payload ->> 'claimId' = ${claimId}`)
      .execute()
  }

  it('queues the capped, club-card-free amount for payment, not the raw line items', async () => {
    await insertLocalPrice('JET A-1', 3.0, '2026-01-01')
    // 100 l member-paid @ 4.00 = 400 and 20 l club card @ 4.00 = 80.
    // Cap: 120 l * 3.00 = 360 -> capped; 360 - 80 club card = 280 to the member.
    const claimId = await createSubmittedFuelClaim([
      { description: 'Member paid', quantity: 100, unitPrice: 4.0 },
      { description: 'Club card', quantity: 20, unitPrice: 4.0, paidWithClubCard: true },
    ])

    const res = await request(app)
      .post(`/expenses/${claimId}/approve`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.fuelReimbursementSummary.memberReimbursement).toBe(280)

    const [outbox] = await outboxFor(claimId, SimplbooksEventType.REIMBURSEMENT)
    expect(outbox).toBeDefined()
    const payload = outbox.payload as { lineItems: { description: string; totalCost: number }[] }
    expect(payload.lineItems).toHaveLength(1)
    expect(payload.lineItems[0].description).toBe('Member paid')
    expect(payload.lineItems[0].totalCost).toBe(280)

    // The reason the paid amount differs from the amount claimed is on the claim itself.
    const messages = res.body.messages as { messageType: string; body: string }[]
    expect(messages.some((message) => message.body.includes('280.00 € of 480.00 € claimed'))).toBe(
      true,
    )
  })

  it('queues no reimbursement and invoices the member when club-card fuel exceeded the cap', async () => {
    await insertLocalPrice('JET A-1', 3.0, '2026-01-01')
    // 100 l club card @ 4.00 = 400, cap 100 l * 3.00 = 300 -> member owes 100, gets nothing.
    // The 10 l member-paid row keeps the claim total above zero so it can be submitted.
    const claimId = await createSubmittedFuelClaim([
      { description: 'Club card', quantity: 100, unitPrice: 4.0, paidWithClubCard: true },
      { description: 'Member paid', quantity: 10, unitPrice: 0.01 },
    ])

    const res = await request(app)
      .post(`/expenses/${claimId}/approve`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.fuelReimbursementSummary.memberOwesClub).toBeGreaterThan(0)
    expect(res.body.fuelReimbursementSummary.memberReimbursement).toBe(0)

    expect(await outboxFor(claimId, SimplbooksEventType.REIMBURSEMENT)).toHaveLength(0)

    const [recovery] = await outboxFor(claimId, SimplbooksEventType.CLUB_FUEL_RECOVERY)
    expect(recovery).toBeDefined()
    const payload = recovery.payload as { amount: number; costCentreCode: string }
    expect(payload.amount).toBe(res.body.fuelReimbursementSummary.memberOwesClub)
    expect(payload.costCentreCode).toBe('OH-STL')
  })

  it('leaves a non-fuel claim paying exactly what was claimed', async () => {
    const category = await db
      .selectFrom('accts.expenseCategory')
      .select('id')
      .where('code', '=', CATEGORY_CODE)
      .executeTakeFirstOrThrow()

    const created = await request(app)
      .post('/expenses')
      .set('Cookie', `accessToken=${memberToken}`)
      .send({
        categoryId: category.id,
        title: 'Misc payout test',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Juha Seppälä',
        expenseDate: '2026-07-15',
        lineItems: [
          { description: 'Landing fees', quantity: 2, unit: 'pcs', unitPrice: 15, sortOrder: 0 },
        ],
      })
    expect(created.status).toBe(201)
    insertedClaimIds.push(created.body.id)

    await attachTestReceipt(created.body.id)
    await request(app)
      .post(`/expenses/${created.body.id}/submit`)
      .set('Cookie', `accessToken=${memberToken}`)

    const res = await request(app)
      .post(`/expenses/${created.body.id}/approve`)
      .set('Cookie', `accessToken=${adminToken}`)
    expect(res.status).toBe(200)

    const [outbox] = await outboxFor(created.body.id, SimplbooksEventType.REIMBURSEMENT)
    const payload = outbox.payload as { lineItems: { quantity: number; unitPrice: number }[] }
    expect(payload.lineItems).toEqual([
      expect.objectContaining({ description: 'Landing fees', quantity: 2, unitPrice: 15 }),
    ])
  })
})
