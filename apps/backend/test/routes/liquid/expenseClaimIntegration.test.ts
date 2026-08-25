import 'dotenv/config'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import sharp from 'sharp'

import { db } from '../../../src/db/connection.ts'
import { router as expenseRoutes } from '../../../src/routes/expenses/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { JET_A1 } from '@mik/contracts/liquid'
import {
  ABROAD,
  cleanupLiquid,
  daysAgo,
  HOME,
  insertRecord,
  insertRecordAttachment,
  JET_AIRCRAFT,
  NEW_JET_FLIGHT,
  trackedFuelTax,
} from './testSupport.ts'

/**
 * The expense-claim half of #1119: a fuel claim is assembled from records the
 * member already reported, and the server derives every figure from them.
 *
 * These go through the real expense routes rather than the liquid ones, because
 * the behaviour under test is the *claim's*: what it does with a selection of
 * records, and what it refuses.
 */

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/expenses', expenseRoutes)
app.use(problemErrorHandler)

/**
 * Juha1, not Matti1 — deliberately, and for the same reason
 * `test/routes/expenses/api.test.ts` chose him.
 *
 * Creating a claim syncs its IBAN onto the member's profile
 * (`syncMemberIbanFromClaim`), and `test/routes/members/api.test.ts` snapshots
 * Matti1's whole profile. A claim filed as Matti1 rewrites his IBAN and breaks
 * that snapshot from three suites away. The profile is restored below as well, so
 * this suite does not depend on nobody else ever snapshotting Juha1.
 */
const CLAIMANT = 'Juha1'

const memberToken = generateAccessToken({
  memberId: CLAIMANT,
  lastName: 'Seppälä',
  email: 'juha1@mik.fi',
  roles: [],
  permissions: [MIKPermissions.EXPENSE_USER],
  canMakeReservations: false,
})
const asMember = `accessToken=${memberToken}`

const TREASURER = 'k1mnimda'
const treasurerToken = generateAccessToken({
  memberId: TREASURER,
  lastName: 'Admin',
  email: 'k1mnimda@mik.fi',
  roles: [],
  permissions: [MIKPermissions.EXPENSE_ADMIN],
  canMakeReservations: false,
})
const asTreasurer = `accessToken=${treasurerToken}`

const attachTestReceipt = async (claimId: string): Promise<void> => {
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 10, g: 200, b: 10 } },
  })
    .jpeg()
    .toBuffer()
  const res = await request(app)
    .post(`/expenses/${claimId}/attachments`)
    .set('Cookie', asMember)
    .attach('files', image, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
  expect(res.status).toBe(201)
}

const createdClaimIds: string[] = []

const cleanup = async () => {
  // Undo the IBAN the claim sync wrote onto the claimant's profile.
  await db
    .updateTable('member.register')
    .set({ iban: null, ibanAccountName: null })
    .where('memberId', '=', CLAIMANT)
    .execute()

  if (createdClaimIds.length) {
    await db
      .updateTable('liquid.record')
      .set({ expenseClaimId: null })
      .where('expenseClaimId', 'in', createdClaimIds)
      .execute()
    await db.deleteFrom('accts.expenseClaim').where('id', 'in', createdClaimIds).execute()
    createdClaimIds.length = 0
  }
  await cleanupLiquid()
}

beforeEach(cleanup)
afterAll(cleanup)

const fuelCategoryId = async (): Promise<number> => {
  const row = await db
    .selectFrom('accts.expenseCategory')
    .select(['id'])
    .where('code', '=', 'fuel')
    .executeTakeFirstOrThrow()
  return row.id
}

const miscCategoryId = async (): Promise<number> => {
  const row = await db
    .selectFrom('accts.expenseCategory')
    .select(['id'])
    .where('code', '=', 'misc')
    .executeTakeFirstOrThrow()
  return row.id
}

/** A fuelling the member paid for away from home, so it can be claimed. */
const aPaidFuelling = (overrides: Parameters<typeof insertRecord>[0] = {}) =>
  insertRecord({
    memberId: CLAIMANT,
    airport: ABROAD,
    providerCode: 'AIRBP',
    totalCost: 400,
    quantityLitres: 200,
    ...overrides,
  })

const createClaim = async (body: object) => {
  const res = await request(app).post('/expenses').set('Cookie', asMember).send(body)
  if (res.status === 201) createdClaimIds.push(res.body.id)
  return res
}

const aClaim = async (liquidRecordIds: string[], overrides: object = {}) => ({
  categoryId: await fuelCategoryId(),
  aircraftId: JET_AIRCRAFT,
  title: 'LIQUID-TEST fuel claim',
  expenseDate: '2026-06-01',
  iban: 'FI2112345600000785',
  ibanAccountName: 'Juha Seppälä',
  // Deliberately empty: the server derives the items from the records, and a
  // claim that needed both would defeat the purpose.
  lineItems: [],
  liquidRecordIds,
  ...overrides,
})

describe('building a fuel claim from liquid records', () => {
  it('derives a line item per fuelling from the record, not the request', async () => {
    const recordId = await aPaidFuelling()

    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(201)
    expect(res.body.lineItems).toHaveLength(1)
    expect(res.body.lineItems[0]).toMatchObject({
      quantity: 200,
      unit: 'l',
      unitPrice: 2,
      totalCost: 400,
      airport: ABROAD,
      fuelType: JET_A1,
    })
    // The cost centre codes are aircraft registrations, so a derived item
    // carries the one a hand-entered fuel item is required to have.
    expect(res.body.lineItems[0].costCentreCode).toBe(JET_AIRCRAFT)
  })

  it('ignores line items the client sent alongside a record', async () => {
    // The whole point: the member reports a fuelling once, and a cost typed into
    // the claim form cannot disagree with what they reported at the pump.
    const recordId = await aPaidFuelling({ totalCost: 400, quantityLitres: 200 })

    const res = await createClaim(
      await aClaim([recordId], {
        lineItems: [
          {
            description: 'Fuel, honest',
            quantity: 999,
            unit: 'l',
            unitPrice: 99,
            totalCost: 98_901,
            sortOrder: 0,
          },
        ],
      }),
    )

    expect(res.status).toBe(201)
    expect(res.body.lineItems).toHaveLength(1)
    expect(res.body.lineItems[0].totalCost).toBe(400)
    expect(res.body.lineItems[0].quantity).toBe(200)
  })

  it('bundles several fuellings into one claim', async () => {
    const ids = [
      await aPaidFuelling({ totalCost: 100, quantityLitres: 50 }),
      await aPaidFuelling({ totalCost: 200, quantityLitres: 100 }),
      await aPaidFuelling({ totalCost: 300, quantityLitres: 150 }),
    ]

    const res = await createClaim(await aClaim(ids))

    expect(res.status).toBe(201)
    expect(res.body.lineItems).toHaveLength(3)
    expect(res.body.fuelLitres).toBe(300)
    expect(res.body.fuelType).toBe(JET_A1)
  })

  it('counts a record picked twice once, rather than doubling the claim', async () => {
    // The ids are consumed twice — to derive the line items and to link the
    // records — and only the link collapses duplicates on its own. Without the
    // schema treating the selection as a set, one id sent twice would bill the
    // club for a fuelling that happened once.
    const recordId = await aPaidFuelling({ totalCost: 400, quantityLitres: 200 })

    const res = await createClaim(await aClaim([recordId, recordId]))

    expect(res.status).toBe(201)
    expect(res.body.lineItems).toHaveLength(1)
    expect(res.body.fuelLitres).toBe(200)
    expect(res.body.lineItems[0].totalCost).toBe(400)
  })

  it('leaves the claim-level fuel type unset when a trip mixed fuels', async () => {
    const ids = [
      await aPaidFuelling(),
      await aPaidFuelling({
        aircraftRegistration: 'OH-IHQ',
        fuelType: '100LL',
        totalCost: 250,
        quantityLitres: 100,
      }),
    ]

    const res = await createClaim(await aClaim(ids))

    expect(res.status).toBe(201)
    expect(res.body.fuelType).toBeNull()
    // The litres still add up, and each line item keeps its own fuel type.
    expect(res.body.fuelLitres).toBe(300)
    expect(res.body.lineItems.map((li: { fuelType: string }) => li.fuelType).sort()).toEqual([
      '100LL',
      JET_A1,
    ])
  })

  it('marks the claim as refuelled outside Finland from the record’s airport', async () => {
    const recordId = await aPaidFuelling({ airport: ABROAD })
    const res = await createClaim(await aClaim([recordId]))
    expect(res.body.refuelOutsideFinland).toBe(true)
  })

  it('locks the record once it is on the claim', async () => {
    const recordId = await aPaidFuelling()
    const claim = await createClaim(await aClaim([recordId]))

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()

    expect(row.expenseClaimId).toBe(claim.body.id)
    expect(row.claimLinkedAt).not.toBeNull()
    // And the paid figures are frozen with it.
    expect(Number(row.originalPaidTotal)).toBe(400)
    expect(Number(row.originalPricePerLitre)).toBe(2)
  })

  it('freezes the fuel tax that applied, so a later rate change cannot move it', async () => {
    const year = new Date().getUTCFullYear()
    trackedFuelTax.push({ taxYear: year, fuelType: JET_A1 })
    await db
      .insertInto('accts.fuelTax')
      .values({
        taxYear: year,
        fuelType: JET_A1,
        rateEurPerLitre: 0.25,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()

    const recordId = await aPaidFuelling({ recordedAt: new Date() })
    await createClaim(await aClaim([recordId]))

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()

    expect(Number(row.fuelTaxRateApplied)).toBe(0.25)
    expect(Number(row.taxAdjustedPricePerLitre)).toBe(2.25)
    expect(row.fuelTaxYear).toBe(year)
  })
})

describe('what a fuel claim refuses', () => {
  it('rejects an EFNU fuelling with no cost — there is nothing to reimburse', async () => {
    const recordId = await insertRecord({ memberId: CLAIMANT, airport: HOME, totalCost: null })
    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('no cost recorded')
  })

  it('rejects a record already on another claim', async () => {
    const recordId = await aPaidFuelling()
    await createClaim(await aClaim([recordId]))

    const second = await createClaim(await aClaim([recordId], { title: 'LIQUID-TEST second' }))
    expect(second.status).toBe(409)
    expect(second.body.detail).toContain('already attached')
  })

  it('rejects another member’s record', async () => {
    const recordId = await aPaidFuelling({ memberId: 'Matti1' })
    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('another member')
  })

  it('rejects a deleted record', async () => {
    const recordId = await aPaidFuelling()
    await db
      .updateTable('liquid.record')
      .set({ deletedAt: new Date(), deletedBy: CLAIMANT, updatedBy: CLAIMANT })
      .where('recordId', '=', recordId)
      .execute()

    const res = await createClaim(await aClaim([recordId]))
    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('no longer exists')
  })

  it('rejects an oil record — only fuel is claimable', async () => {
    const recordId = await insertRecord({
      memberId: CLAIMANT,
      liquidType: 'OIL',
      oilSource: 'OTHER',
      airport: null,
      quantityLitres: 0.5,
    })
    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('Only fuel records')
  })

  it('rejects a record that does not exist', async () => {
    const res = await createClaim(await aClaim(['00000000-0000-4000-8000-000000000000']))
    expect(res.status).toBe(400)
  })

  it('rejects fuel records selected on a non-fuel category', async () => {
    // A fuel-derived claim carries the approval routing / reimbursement caps /
    // reporting that only the 'fuel' category has — accepting liquidRecordIds
    // on 'misc' would attach real fuel line items to a claim none of that
    // applies to.
    const recordId = await aPaidFuelling()
    const res = await createClaim(await aClaim([recordId], { categoryId: await miscCategoryId() }))

    expect(res.status).toBe(400)
    expect(res.body.detail).toContain('fuel expense claim')
  })

  it('rejects a fuel record past its edit window — the same lock a direct edit enforces', async () => {
    const recordId = await aPaidFuelling({ createdAt: daysAgo(8) })
    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(409)
    expect(res.body.detail).toContain('more than a week old')
  })

  it('rejects a fuel record whose flight log has been validated', async () => {
    const recordId = await aPaidFuelling({ flightLogId: 'ihq3fn1' })
    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(409)
    expect(res.body.detail).toContain('validated flight log')
  })
})

describe('editing a fuel claim', () => {
  const updateClaim = (claimId: string, body: object) =>
    request(app).put(`/expenses/${claimId}`).set('Cookie', asMember).send(body)

  it('keeps its own records selectable rather than calling them already claimed', async () => {
    const recordId = await aPaidFuelling()
    const claim = await createClaim(await aClaim([recordId]))

    const updated = await updateClaim(
      claim.body.id,
      await aClaim([recordId], { title: 'LIQUID-TEST edited' }),
    )

    expect(updated.status).toBe(200)
    expect(updated.body.lineItems).toHaveLength(1)
  })

  it('releases a record the member removed, so it can go on another claim', async () => {
    const keep = await aPaidFuelling({ totalCost: 100, quantityLitres: 50 })
    const drop = await aPaidFuelling({ totalCost: 200, quantityLitres: 100 })
    const claim = await createClaim(await aClaim([keep, drop]))

    await updateClaim(claim.body.id, await aClaim([keep]))

    const released = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', drop)
      .executeTakeFirstOrThrow()

    expect(released.expenseClaimId).toBeNull()
    // The frozen prices go with the link: they described this claim's figures.
    expect(released.taxAdjustedPricePerLitre).toBeNull()
    expect(released.claimLinkedAt).toBeNull()
  })

  it('clears the derived fuel details when the member removes the last record', async () => {
    // An empty selection is a selection. The records are released either way,
    // so a claim that kept its derived line items would be showing litres, a
    // cost and a fuel type belonging to no record at all — and it is the claim
    // that the club reimburses against.
    const recordId = await aPaidFuelling()
    const claim = await createClaim(await aClaim([recordId]))
    expect(claim.body.lineItems).toHaveLength(1)

    const updated = await updateClaim(claim.body.id, await aClaim([]))

    expect(updated.status).toBe(200)
    expect(updated.body.lineItems).toHaveLength(0)
    expect(updated.body.fuelLitres).toBeNull()
    expect(updated.body.fuelType).toBeNull()

    const released = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()
    expect(released.expenseClaimId).toBeNull()
  })

  it('leaves a hand-entered claim alone when it sends no selection at all', async () => {
    // The other half of the distinction: an absent `liquidRecordIds` means the
    // claim is not record-backed, and its typed line items must survive.
    const claim = await createClaim(
      await aClaim([], {
        liquidRecordIds: undefined,
        lineItems: [
          {
            description: 'LIQUID-TEST hand-entered fuel',
            date: '2026-06-01',
            quantity: 100,
            unit: 'l',
            unitPrice: 2,
            totalCost: 200,
            sortOrder: 0,
            costCentreCode: JET_AIRCRAFT,
            airport: ABROAD,
            fuelType: JET_A1,
            paidWithClubCard: false,
          },
        ],
      }),
    )

    expect(claim.status).toBe(201)
    const updated = await updateClaim(claim.body.id, { title: 'LIQUID-TEST retitled' })

    expect(updated.status).toBe(200)
    expect(updated.body.lineItems).toHaveLength(1)
    expect(updated.body.lineItems[0].description).toBe('LIQUID-TEST hand-entered fuel')
  })

  it('releases every record when the claim is deleted', async () => {
    // Otherwise the record is stranded: claim-linked records are immutable for
    // everyone, so nobody could edit, claim or delete it ever again.
    const recordId = await aPaidFuelling()
    const claim = await createClaim(await aClaim([recordId]))

    const deleted = await request(app).delete(`/expenses/${claim.body.id}`).set('Cookie', asMember)
    expect(deleted.status).toBe(204)
    createdClaimIds.length = 0

    const row = await db
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', '=', recordId)
      .executeTakeFirstOrThrow()

    expect(row.expenseClaimId).toBeNull()
    expect(row.originalPaidTotal).toBeNull()
  })
})

describe('treasurer editing a fuel-record-derived claim', () => {
  it('refuses to let a treasurer diverge quantity/unitPrice/totalCost from the linked record', async () => {
    const recordId = await aPaidFuelling({ totalCost: 400, quantityLitres: 200 })
    const claim = await createClaim(await aClaim([recordId]))
    await attachTestReceipt(claim.body.id)

    const submitted = await request(app)
      .post(`/expenses/${claim.body.id}/submit`)
      .set('Cookie', asMember)
    expect(submitted.status).toBe(200)

    const lineItemId = claim.body.lineItems[0].id
    const res = await request(app)
      .patch(`/expenses/${claim.body.id}/edit`)
      .set('Cookie', asTreasurer)
      .send({ lineItems: [{ id: lineItemId, totalCost: 999 }] })

    expect(res.status).toBe(409)
    expect(res.body.detail).toContain('linked fuel record')

    // The stored line item, and the frozen record it came from, are both untouched.
    const detail = await request(app).get(`/expenses/${claim.body.id}`).set('Cookie', asMember)
    expect(detail.body.lineItems[0].totalCost).toBe(400)
  })

  it('still lets a treasurer fix a non-money field on a fuel-record-derived line item', async () => {
    const recordId = await aPaidFuelling({ totalCost: 400, quantityLitres: 200 })
    const claim = await createClaim(await aClaim([recordId]))
    await attachTestReceipt(claim.body.id)

    const submitted = await request(app)
      .post(`/expenses/${claim.body.id}/submit`)
      .set('Cookie', asMember)
    expect(submitted.status).toBe(200)

    const lineItemId = claim.body.lineItems[0].id
    const res = await request(app)
      .patch(`/expenses/${claim.body.id}/edit`)
      .set('Cookie', asTreasurer)
      .send({ lineItems: [{ id: lineItemId, costCentreCode: JET_AIRCRAFT }] })

    expect(res.status).toBe(200)
  })
})

describe('deriving the claim’s flight link from records (#1119 follow-up)', () => {
  const updateClaim = (claimId: string, body: object) =>
    request(app).put(`/expenses/${claimId}`).set('Cookie', asMember).send(body)

  it('derives flightLogId when every selected record was on the same flight', async () => {
    const recordId = await aPaidFuelling({ flightLogId: NEW_JET_FLIGHT })
    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(201)
    expect(res.body.flightLogId).toBe(NEW_JET_FLIGHT)
  })

  it('leaves flightLogId unset when no selected record has one', async () => {
    const recordId = await aPaidFuelling()
    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(201)
    expect(res.body.flightLogId).toBeUndefined()
  })

  it('leaves flightLogId unset when the selected records disagree on their flight', async () => {
    const ids = [
      await aPaidFuelling({ flightLogId: NEW_JET_FLIGHT }),
      await aPaidFuelling({ totalCost: 200, quantityLitres: 100 }),
    ]
    const res = await createClaim(await aClaim(ids))

    expect(res.status).toBe(201)
    expect(res.body.flightLogId).toBeUndefined()
  })

  it('ignores a client-supplied flightLogId for a fuel claim — it is always derived', async () => {
    const recordId = await aPaidFuelling()
    const res = await createClaim(await aClaim([recordId], { flightLogId: NEW_JET_FLIGHT }))

    expect(res.status).toBe(201)
    // The record itself carries no flight link, so nothing to derive from —
    // the client's own flightLogId must not leak through.
    expect(res.body.flightLogId).toBeUndefined()
  })

  it('re-derives flightLogId when the record selection changes on an update', async () => {
    const withFlight = await aPaidFuelling({ flightLogId: NEW_JET_FLIGHT })
    const withoutFlight = await aPaidFuelling({ totalCost: 200, quantityLitres: 100 })
    const claim = await createClaim(await aClaim([withFlight]))
    expect(claim.body.flightLogId).toBe(NEW_JET_FLIGHT)

    const updated = await updateClaim(claim.body.id, await aClaim([withoutFlight]))

    expect(updated.status).toBe(200)
    expect(updated.body.flightLogId).toBeUndefined()
  })
})

describe('copying a fuelling’s own receipt onto the claim (#1119 follow-up)', () => {
  const updateClaim = (claimId: string, body: object) =>
    request(app).put(`/expenses/${claimId}`).set('Cookie', asMember).send(body)

  it('copies a receipt attached to the record onto the new claim', async () => {
    const recordId = await aPaidFuelling()
    const attachmentId = await insertRecordAttachment(recordId, { fileName: 'pump-receipt.jpg' })

    const res = await createClaim(await aClaim([recordId]))

    expect(res.status).toBe(201)
    const detail = await request(app).get(`/expenses/${res.body.id}`).set('Cookie', asMember)
    expect(detail.body.attachments).toHaveLength(1)
    expect(detail.body.attachments[0]).toMatchObject({
      fileName: 'pump-receipt.jpg',
      sourceLiquidAttachmentId: attachmentId,
    })
  })

  it('does not duplicate the copy when the claim is saved again', async () => {
    const recordId = await aPaidFuelling()
    await insertRecordAttachment(recordId)
    const claim = await createClaim(await aClaim([recordId]))

    const updated = await updateClaim(
      claim.body.id,
      await aClaim([recordId], { title: 'LIQUID-TEST resaved' }),
    )

    expect(updated.status).toBe(200)
    const detail = await request(app).get(`/expenses/${claim.body.id}`).set('Cookie', asMember)
    expect(detail.body.attachments).toHaveLength(1)
  })

  it('keeps a copied receipt on the claim even after its record is deselected', async () => {
    const withReceipt = await aPaidFuelling()
    await insertRecordAttachment(withReceipt)
    const other = await aPaidFuelling({ totalCost: 200, quantityLitres: 100 })
    const claim = await createClaim(await aClaim([withReceipt, other]))

    const updated = await updateClaim(claim.body.id, await aClaim([other]))

    expect(updated.status).toBe(200)
    const detail = await request(app).get(`/expenses/${claim.body.id}`).set('Cookie', asMember)
    expect(detail.body.attachments).toHaveLength(1)
  })

  it('stops copying once the claim already has the maximum number of attachments', async () => {
    // No receipt on the record yet, so nothing is copied at creation — the cap
    // is filled with ordinary attachments first, and only then does the
    // record gain a receipt for a re-save to (fail to) copy.
    const recordId = await aPaidFuelling()
    const claim = await createClaim(await aClaim([recordId]))

    for (let i = 1; i <= 10; i++) {
      await db
        .insertInto('accts.expenseClaimAttachment')
        .values({
          claimId: claim.body.id,
          storageKey: `expense-receipts/${claim.body.id}/filler-${i}.jpg`,
          fileName: `filler-${i}.jpg`,
          fileSize: 1,
          mimeType: 'image/jpeg',
          sortOrder: i,
        })
        .execute()
    }
    await insertRecordAttachment(recordId)

    const updated = await updateClaim(
      claim.body.id,
      await aClaim([recordId], { title: 'LIQUID-TEST at cap' }),
    )

    expect(updated.status).toBe(200)
    const detail = await request(app).get(`/expenses/${claim.body.id}`).set('Cookie', asMember)
    expect(detail.body.attachments).toHaveLength(10)
    // The record's own receipt was never appended past the cap.
    expect(
      detail.body.attachments.some((a: { fileName: string }) => a.fileName === 'receipt.jpg'),
    ).toBe(false)
  })
})
