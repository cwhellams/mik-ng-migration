import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/liquid/api.ts'
import { JET_A1 } from '@mik/contracts/liquid'
import {
  ABROAD,
  asAdmin,
  asMember,
  asNobody,
  cleanupClaims,
  cleanupLiquid,
  HOME,
  insertDraftClaim,
  insertRecord,
  JET_AIRCRAFT,
  mountRouter,
  PISTON_AIRCRAFT,
  trackedFuelTax,
} from './testSupport.ts'
import { linkRecordsToClaim } from '../../../src/db/liquid-queries.ts'

const app = mountRouter('/liquid', router)

const cleanup = async () => {
  await cleanupClaims()
  await cleanupLiquid()
}

beforeEach(cleanup)
afterAll(cleanup)

/** Configures a rate and tracks it so the next test starts from no tax. */
const setRate = async (taxYear: number, fuelType: string, rate: number) => {
  trackedFuelTax.push({ taxYear, fuelType })
  return request(app)
    .put('/liquid/fuel-tax')
    .set('Cookie', asAdmin)
    .send({ taxYear, fuelType, rateEurPerLitre: rate })
}

const THIS_YEAR = new Date().getUTCFullYear()

// ─── Fuel tax configuration ───────────────────────────────────────────────────

describe('fuel tax configuration', () => {
  it('lets any expense or liquid user read the configured rates', async () => {
    // The claim form has to show what will be applied.
    const res = await request(app).get('/liquid/fuel-tax').set('Cookie', asMember)
    expect(res.status).toBe(200)
  })

  it('rejects a member with no permissions', async () => {
    const res = await request(app).get('/liquid/fuel-tax').set('Cookie', asNobody)
    expect(res.status).toBe(403)
  })

  it('refuses an ordinary member setting a rate', async () => {
    const res = await request(app)
      .put('/liquid/fuel-tax')
      .set('Cookie', asMember)
      .send({ taxYear: 2030, fuelType: JET_A1, rateEurPerLitre: 0.1 })
    expect(res.status).toBe(403)
  })

  it('stores a rate per year and fuel type', async () => {
    const res = await setRate(2031, JET_A1, 0.1234)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      taxYear: 2031,
      fuelType: JET_A1,
      rateEurPerLitre: 0.1234,
      updatedBy: 'k1mnimda',
    })
  })

  it('upserts rather than duplicating a year', async () => {
    await setRate(2032, JET_A1, 0.1)
    const updated = await setRate(2032, JET_A1, 0.2)

    expect(updated.body.rateEurPerLitre).toBe(0.2)

    const rows = await db
      .selectFrom('accts.fuelTax')
      .selectAll()
      .where('taxYear', '=', 2032)
      .where('fuelType', '=', JET_A1)
      .execute()
    expect(rows).toHaveLength(1)
  })

  it('keeps different fuel types of the same year apart', async () => {
    // "rate per year per fuel type" — the club's own answer on #1119.
    await setRate(2033, JET_A1, 0.3)
    await setRate(2033, '100LL', 0.4)

    const res = await request(app).get('/liquid/fuel-tax').set('Cookie', asAdmin)
    const forYear = (res.body as { taxYear: number; fuelType: string; rateEurPerLitre: number }[])
      .filter((r) => r.taxYear === 2033)
      .map((r) => [r.fuelType, r.rateEurPerLitre])

    expect(forYear).toEqual(
      expect.arrayContaining([
        ['100LL', 0.4],
        [JET_A1, 0.3],
      ]),
    )
  })

  it('rejects a fuel type the club does not stock', async () => {
    // A typo would otherwise create a rate that silently never applies.
    const res = await request(app)
      .put('/liquid/fuel-tax')
      .set('Cookie', asAdmin)
      .send({ taxYear: 2034, fuelType: 'PARAFFIN', rateEurPerLitre: 0.1 })

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('Unknown fuel type')
  })

  it('rejects a negative rate', async () => {
    const res = await request(app)
      .put('/liquid/fuel-tax')
      .set('Cookie', asAdmin)
      .send({ taxYear: 2035, fuelType: JET_A1, rateEurPerLitre: -1 })
    expect(res.status).toBe(400)
  })

  it('deletes a rate', async () => {
    await setRate(2036, JET_A1, 0.1)
    const res = await request(app)
      .delete(`/liquid/fuel-tax/2036/${encodeURIComponent(JET_A1)}`)
      .set('Cookie', asAdmin)

    expect(res.status).toBe(204)
    const rows = await db
      .selectFrom('accts.fuelTax')
      .selectAll()
      .where('taxYear', '=', 2036)
      .execute()
    expect(rows).toHaveLength(0)
  })

  it('starts with no rates configured, so nothing is adjusted by default', async () => {
    // Deliberate: inventing a rate in a migration would move real money.
    const res = await request(app).get('/liquid/fuel-tax').set('Cookie', asAdmin)
    const seeded = (res.body as { createdBy: string }[]).filter((r) => r.createdBy === 'system')
    expect(seeded).toHaveLength(0)
  })
})

// ─── Freezing the pricing onto a claimed record ────────────────────────────────

describe('freezing pricing when a record joins a claim', () => {
  it('copies the paid figures, the adjusted price and the rate onto the record', async () => {
    await setRate(THIS_YEAR, JET_A1, 0.1)
    const recordId = await insertRecord({
      airport: ABROAD,
      totalCost: 400,
      quantityLitres: 200,
      providerCode: 'AIRBP',
      // Bought abroad but *not* flagged, so Finnish tax applies.
      taxIncludedAbroad: false,
      recordedAt: new Date(),
    })
    const claimId = await insertDraftClaim()

    const result = await linkRecordsToClaim([recordId], claimId, 'Matti1')
    expect(result.linked).toEqual([recordId])

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()

    expect(Number(row.originalPaidTotal)).toBe(400)
    expect(Number(row.originalPricePerLitre)).toBe(2)
    expect(Number(row.taxAdjustedPricePerLitre)).toBe(2.1)
    expect(row.fuelTaxYear).toBe(THIS_YEAR)
    expect(Number(row.fuelTaxRateApplied)).toBe(0.1)
    expect(row.claimLinkedAt).not.toBeNull()
  })

  it('adds no Finnish tax to fuel flagged as bought abroad', async () => {
    await setRate(THIS_YEAR, JET_A1, 0.1)
    const recordId = await insertRecord({
      airport: ABROAD,
      totalCost: 400,
      quantityLitres: 200,
      providerCode: 'AIRBP',
      taxIncludedAbroad: true,
    })
    const claimId = await insertDraftClaim()
    await linkRecordsToClaim([recordId], claimId, 'Matti1')

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()

    expect(Number(row.taxAdjustedPricePerLitre)).toBe(2)
    expect(row.fuelTaxRateApplied).toBeNull()
  })

  it('does not move a settled claim when the rate is later corrected', async () => {
    // The whole reason the rate is copied onto the row rather than looked up on
    // read: "This must remain auditable after future tax-rate changes."
    await setRate(THIS_YEAR, JET_A1, 0.1)
    const recordId = await insertRecord({
      airport: ABROAD,
      totalCost: 400,
      quantityLitres: 200,
      providerCode: 'AIRBP',
    })
    const claimId = await insertDraftClaim()
    await linkRecordsToClaim([recordId], claimId, 'Matti1')

    await setRate(THIS_YEAR, JET_A1, 0.9)

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()

    expect(Number(row.fuelTaxRateApplied)).toBe(0.1)
    expect(Number(row.taxAdjustedPricePerLitre)).toBe(2.1)
  })

  it('refuses to move a record onto a second claim', async () => {
    // "A fuel record may be attached to only one expense claim."
    const recordId = await insertRecord({ totalCost: 200, airport: ABROAD, providerCode: 'AIRBP' })
    const first = await insertDraftClaim()
    const second = await insertDraftClaim()

    await linkRecordsToClaim([recordId], first, 'Matti1')
    const result = await linkRecordsToClaim([recordId], second, 'Matti1')

    expect(result.linked).toEqual([])
    expect(result.rejected).toEqual([recordId])
  })

  it('bundles several fuellings onto one claim', async () => {
    // Following #1107: a trip with three fuellings is one claim.
    const ids = await Promise.all([
      insertRecord({ totalCost: 100, airport: ABROAD, providerCode: 'AIRBP' }),
      insertRecord({ totalCost: 200, airport: ABROAD, providerCode: 'AIRBP' }),
      insertRecord({ totalCost: 300, airport: ABROAD, providerCode: 'AIRBP' }),
    ])
    const claimId = await insertDraftClaim()

    const result = await linkRecordsToClaim(ids, claimId, 'Matti1')
    expect(result.linked.sort()).toEqual([...ids].sort())
  })

  it('leaves a deleted record out of a claim', async () => {
    const recordId = await insertRecord({ totalCost: 200, airport: ABROAD, providerCode: 'AIRBP' })
    await request(app).delete(`/liquid/records/${recordId}`).set('Cookie', asMember)

    const claimId = await insertDraftClaim()
    const result = await linkRecordsToClaim([recordId], claimId, 'Matti1')
    expect(result.rejected).toEqual([recordId])
  })

  it('applies no adjustment when no rate is configured for that fuel type', async () => {
    const recordId = await insertRecord({
      aircraftRegistration: PISTON_AIRCRAFT,
      fuelType: '100LL',
      providerCode: 'AIRBP',
      airport: ABROAD,
      totalCost: 250,
      quantityLitres: 100,
    })
    const claimId = await insertDraftClaim()
    await linkRecordsToClaim([recordId], claimId, 'Matti1')

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()

    expect(Number(row.taxAdjustedPricePerLitre)).toBe(2.5)
    expect(row.fuelTaxRateApplied).toBeNull()
  })
})

// ─── The fuel price comparison report ─────────────────────────────────────────

describe('GET /liquid/reports/fuel-price-comparison', () => {
  const range = { from: '2026-01-01', to: '2026-12-31' }

  const runReport = (cookie: string, reference: string[] = [], extra = {}) =>
    request(app)
      .get('/liquid/reports/fuel-price-comparison')
      .query({ ...range, reference, ...extra })
      .set('Cookie', cookie)

  const inRange = (overrides: Parameters<typeof insertRecord>[0] = {}) =>
    insertRecord({ recordedAt: new Date('2026-06-01T10:00:00.000Z'), ...overrides })

  it('rejects a member with no permissions', async () => {
    const res = await runReport(asNobody)
    expect(res.status).toBe(403)
  })

  it('flags a fuelling above the entered reference price', async () => {
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 500,
      quantityLitres: 200, // 2.50 €/l
    })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])

    expect(res.status).toBe(200)
    expect(res.body.rows).toHaveLength(1)
    expect(res.body.rows[0]).toMatchObject({
      paidPricePerLitre: 2.5,
      referencePrice: 2.1,
      comparable: true,
      exceedsReference: true,
      deltaPerLitre: 0.4,
    })
    expect(res.body.summary).toMatchObject({
      total: 1,
      comparable: 1,
      exceeding: 1,
      exceedingLitres: 200,
      excessCostEur: 80,
    })
  })

  it('does not flag a fuelling at or under the reference price', async () => {
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 400,
      quantityLitres: 200, // 2.00 €/l
    })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])
    expect(res.body.rows[0]).toMatchObject({ exceedsReference: false, deltaPerLitre: -0.1 })
    expect(res.body.summary.exceeding).toBe(0)
  })

  it('lists an EFNU fuelling with no cost, but does not compare it', async () => {
    // "EFNU records without recorded cost are not compared against the runtime
    // reference price." Listed, not dropped — silently omitting them would make
    // an empty result read as "nothing was over the reference".
    await inRange({ airport: HOME, totalCost: null })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])

    expect(res.body.rows).toHaveLength(1)
    expect(res.body.rows[0]).toMatchObject({
      totalCost: null,
      comparable: false,
      exceedsReference: false,
      deltaPerLitre: null,
    })
    expect(res.body.summary).toMatchObject({ total: 1, comparable: 0, exceeding: 0 })
  })

  it('does not compare a fuel type nobody gave a reference price for', async () => {
    await inRange({ airport: ABROAD, providerCode: 'AIRBP', totalCost: 500, quantityLitres: 200 })

    const res = await runReport(asAdmin, ['100LL:2.95'])
    expect(res.body.rows[0]).toMatchObject({ comparable: false, referencePrice: null })
  })

  it('adds Finnish fuel tax before comparing an untaxed Finnish purchase', async () => {
    // "Respect the fuel's tax status ... when comparing."
    await setRate(2026, JET_A1, 0.5)
    await inRange({
      airport: 'EFHK',
      providerCode: 'AIRBP',
      totalCost: 400,
      quantityLitres: 200, // 2.00 €/l paid, 2.50 €/l with tax
    })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])

    expect(res.body.rows[0]).toMatchObject({
      paidPricePerLitre: 2,
      taxAdjustedPricePerLitre: 2.5,
      exceedsReference: true,
    })
  })

  it('leaves fuel bought abroad untaxed when comparing', async () => {
    await setRate(2026, JET_A1, 0.5)
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 400,
      quantityLitres: 200,
      taxIncludedAbroad: true,
    })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])
    expect(res.body.rows[0]).toMatchObject({
      taxAdjustedPricePerLitre: 2,
      exceedsReference: false,
    })
  })

  it('compares on the price frozen at claim time, not a recomputed one', async () => {
    // The claim was settled on the stored figure; the report must not tell a
    // different story from the payment.
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 1000,
      quantityLitres: 200, // 5.00 €/l live
      taxAdjustedPricePerLitre: 2.0, // but 2.00 €/l when the claim was made
    })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])
    expect(res.body.rows[0]).toMatchObject({
      storedTaxAdjustedPricePerLitre: 2,
      exceedsReference: false,
    })
  })

  it('converts a foreign-currency purchase before comparing', async () => {
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 5000,
      quantityLitres: 200, // 25 SEK/l
      ccy: 'SEK',
      fxRate: 0.1, // = 2.50 €/l
    })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])
    expect(res.body.rows[0]).toMatchObject({
      ccy: 'SEK',
      paidPricePerLitre: 25,
      taxAdjustedPricePerLitre: 2.5,
      exceedsReference: true,
    })
  })

  it('includes the last day of the range', async () => {
    // `to` names a day, so an evening fuelling on it is inside what was asked for.
    await insertRecord({
      recordedAt: new Date('2026-12-31T18:00:00.000Z'),
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 100,
    })
    const res = await runReport(asAdmin)
    expect(res.body.rows).toHaveLength(1)
  })

  it('excludes records outside the range', async () => {
    await insertRecord({ recordedAt: new Date('2025-12-31T23:00:00.000Z'), airport: HOME })
    await insertRecord({ recordedAt: new Date('2027-01-01T01:00:00.000Z'), airport: HOME })
    const res = await runReport(asAdmin)
    expect(res.body.rows).toHaveLength(0)
  })

  it('excludes oil, which has no litre price to compare', async () => {
    await inRange({ liquidType: 'OIL', oilSource: 'OTHER', airport: null, quantityLitres: 0.5 })
    const res = await runReport(asAdmin)
    expect(res.body.rows).toHaveLength(0)
  })

  it('excludes soft-deleted records', async () => {
    const recordId = await inRange({ airport: ABROAD, providerCode: 'AIRBP', totalCost: 500 })
    await request(app).delete(`/liquid/records/${recordId}`).set('Cookie', asMember)

    const res = await runReport(asAdmin)
    expect(res.body.rows).toHaveLength(0)
  })

  it('sees a fuelling nobody ever claimed — the point of reading liquid records', async () => {
    // The report this replaces derived fuellings from expense line items, so an
    // unclaimed fuelling was invisible to it.
    await inRange({ airport: ABROAD, providerCode: 'AIRBP', totalCost: 500, quantityLitres: 200 })
    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])

    expect(res.body.rows[0].expenseClaimId).toBeNull()
    expect(res.body.rows[0].exceedsReference).toBe(true)
  })

  it('narrows to one aircraft', async () => {
    await inRange({ aircraftRegistration: JET_AIRCRAFT, airport: HOME })
    await inRange({
      aircraftRegistration: PISTON_AIRCRAFT,
      fuelType: 'MOGAS 98E5',
      providerCode: 'MPL',
      airport: HOME,
    })

    const res = await runReport(asAdmin, [], { aircraftRegistration: JET_AIRCRAFT })
    expect(res.body.rows).toHaveLength(1)
    expect(res.body.rows[0].aircraftRegistration).toBe(JET_AIRCRAFT)
  })

  it('rejects a malformed reference price rather than ignoring it', async () => {
    const res = await runReport(asAdmin, ['JET A-1:free'])
    expect(res.status).toBe(400)
  })

  it('requires a date range', async () => {
    const res = await request(app)
      .get('/liquid/reports/fuel-price-comparison')
      .set('Cookie', asAdmin)
    expect(res.status).toBe(400)
  })

  it('sums the excess across several fuellings', async () => {
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 500,
      quantityLitres: 200, // 2.50, +0.40 over
    })
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 660,
      quantityLitres: 200, // 3.30, +1.20 over
    })
    await inRange({
      airport: ABROAD,
      providerCode: 'AIRBP',
      totalCost: 200,
      quantityLitres: 200, // 1.00, under
    })

    const res = await runReport(asAdmin, [`${JET_A1}:2.10`])

    expect(res.body.summary).toMatchObject({
      total: 3,
      comparable: 3,
      exceeding: 2,
      exceedingLitres: 400,
      // 0.40 × 200 + 1.20 × 200
      excessCostEur: 320,
    })
  })
})
