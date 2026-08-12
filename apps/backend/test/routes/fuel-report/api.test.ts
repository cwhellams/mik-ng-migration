import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import fuelReportRoutes from '../../../src/routes/fuel-report/api.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/fuel-report', fuelReportRoutes)
app.use(problemErrorHandler)

const memberToken = generateAccessToken({
  memberId: 'Juha1',
  lastName: 'Seppälä',
  email: 'juha@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FUEL_PRICES_USER],
  canMakeReservations: false,
})

const noAccessToken = generateAccessToken({
  memberId: 'Juha1',
  lastName: 'Seppälä',
  email: 'juha@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

const MEMBER_ID = 'Juha1'

async function fuelCategoryId(): Promise<number> {
  const category = await db
    .selectFrom('accts.expense_category')
    .select('id')
    .where('code', '=', 'fuel')
    .executeTakeFirstOrThrow()
  return category.id
}

async function miscCategoryId(): Promise<number> {
  const category = await db
    .selectFrom('accts.expense_category')
    .select('id')
    .where('code', '=', 'misc')
    .executeTakeFirstOrThrow()
  return category.id
}

async function insertClaimWithLineItem(
  categoryId: number,
  status: ExpenseClaimStatus,
  line: {
    airport?: string | null
    fuelDate?: string | null
    quantity: number
    unitPrice: number
    ccy?: string
    fxRate?: number | null
  },
): Promise<string> {
  const claim = await db
    .insertInto('accts.expense_claim')
    .values({
      member_id: MEMBER_ID,
      category_id: categoryId,
      title: 'Fuel report test',
      status,
      ccy: line.ccy ?? 'EUR',
      fx_rate: line.fxRate ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  await db
    .insertInto('accts.expense_claim_line_item')
    .values({
      claim_id: claim.id,
      description: 'Fuel report test line',
      quantity: line.quantity,
      unit: 'l',
      unit_price: line.unitPrice,
      fuel_type: 'JetA1',
      airport: line.airport ?? null,
      fuel_date: line.fuelDate ?? null,
    })
    .execute()

  return claim.id
}

describe('GET /fuel-report', () => {
  const insertedClaimIds: string[] = []

  afterEach(async () => {
    if (insertedClaimIds.length > 0) {
      await db.deleteFrom('accts.expense_claim').where('id', 'in', insertedClaimIds).execute()
      insertedClaimIds.length = 0
    }
  })

  it('rejects a caller without fuelPrices access', async () => {
    const res = await request(app).get('/fuel-report').set('Cookie', `accessToken=${noAccessToken}`)

    expect(res.status).toBe(403)
  })

  it('includes a submitted fuel line item with airport and date, computing price per litre', async () => {
    const categoryId = await fuelCategoryId()
    const claimId = await insertClaimWithLineItem(categoryId, ExpenseClaimStatus.SUBMITTED, {
      airport: 'EFNU',
      fuelDate: '2026-05-03',
      quantity: 60.26,
      unitPrice: 1.2473,
    })
    insertedClaimIds.push(claimId)

    const res = await request(app).get('/fuel-report').set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
    const entry = res.body.data.find((e: { airportIdent: string }) => e.airportIdent === 'EFNU')
    expect(entry).toBeDefined()
    expect(entry.date).toBe('2026-05-03')
    expect(entry.litres).toBeCloseTo(60.26)
    expect(entry.fuelType).toBe('JetA1')
    expect(entry.pricePerLitreEur).toBeCloseTo(1.2473)
  })

  it('converts non-EUR claims to EUR using the claim fx rate', async () => {
    const categoryId = await fuelCategoryId()
    const claimId = await insertClaimWithLineItem(categoryId, ExpenseClaimStatus.APPROVED, {
      airport: 'EFNU',
      fuelDate: '2026-05-04',
      quantity: 50,
      unitPrice: 2,
      ccy: 'SEK',
      fxRate: 0.09,
    })
    insertedClaimIds.push(claimId)

    const res = await request(app).get('/fuel-report').set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
    const entry = res.body.data.find(
      (e: { date: string; airportIdent: string }) =>
        e.date === '2026-05-04' && e.airportIdent === 'EFNU',
    )
    expect(entry).toBeDefined()
    expect(entry.pricePerLitreEur).toBeCloseTo(0.18)
  })

  it('excludes draft and rejected claims, and claims without an airport', async () => {
    const categoryId = await fuelCategoryId()
    const draftId = await insertClaimWithLineItem(categoryId, ExpenseClaimStatus.DRAFT, {
      airport: 'EFNU',
      fuelDate: '2026-05-05',
      quantity: 10,
      unitPrice: 1,
    })
    const rejectedId = await insertClaimWithLineItem(categoryId, ExpenseClaimStatus.REJECTED, {
      airport: 'EFNU',
      fuelDate: '2026-05-06',
      quantity: 10,
      unitPrice: 1,
    })
    const noAirportId = await insertClaimWithLineItem(categoryId, ExpenseClaimStatus.SUBMITTED, {
      airport: null,
      fuelDate: '2026-05-07',
      quantity: 10,
      unitPrice: 1,
    })
    insertedClaimIds.push(draftId, rejectedId, noAirportId)

    const res = await request(app).get('/fuel-report').set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
    const dates = res.body.data.map((e: { date: string }) => e.date)
    expect(dates).not.toContain('2026-05-05')
    expect(dates).not.toContain('2026-05-06')
    expect(dates).not.toContain('2026-05-07')
  })

  it('excludes non-fuel category claims even with an airport set', async () => {
    const categoryId = await miscCategoryId()
    const claimId = await insertClaimWithLineItem(categoryId, ExpenseClaimStatus.SUBMITTED, {
      airport: 'EFNU',
      fuelDate: '2026-05-08',
      quantity: 1,
      unitPrice: 1,
    })
    insertedClaimIds.push(claimId)

    const res = await request(app).get('/fuel-report').set('Cookie', `accessToken=${memberToken}`)

    expect(res.status).toBe(200)
    const dates = res.body.data.map((e: { date: string }) => e.date)
    expect(dates).not.toContain('2026-05-08')
  })
})
