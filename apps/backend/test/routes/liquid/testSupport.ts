import 'dotenv/config'
import cookieParser from 'cookie-parser'
import express, { type Router } from 'express'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { MIKPermissions } from '@mik/contracts/members'

/**
 * Shared setup for the liquid suites.
 *
 * The identity triad matches the rest of the backend suite — an admin, an
 * ordinary member, and a member with no permissions at all — plus a *second*
 * ordinary member, which this feature needs and the others mostly don't: half
 * the lock rules are about whether a record is yours, and one member can't
 * demonstrate that.
 */

export const mountRouter = (path: string, router: Router) => {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(path, router)
  app.use(problemErrorHandler)
  return app
}

const token = (memberId: string, lastName: string, permissions: MIKPermissions[]) =>
  generateAccessToken({
    memberId,
    lastName,
    email: `${memberId.toLowerCase()}@mik.fi`,
    roles: [],
    permissions,
    canMakeReservations: false,
  })

/** Matti1 — an ordinary flying member, and the owner of most test records. */
export const memberToken = token('Matti1', 'Virtanen', [MIKPermissions.LIQUID_USER])

/** Pekka1 — another ordinary member, for the "not yours" half of the lock rules. */
export const otherMemberToken = token('Pekka1', 'Hämäläinen', [MIKPermissions.LIQUID_USER])

/** k1mnimda — the liquid administrator. */
export const adminToken = token('k1mnimda', 'Admin', [
  MIKPermissions.LIQUID_ADMIN,
  MIKPermissions.LIQUID_USER,
  MIKPermissions.EXPENSE_ADMIN,
  MIKPermissions.FUEL_PRICES_ADMIN,
])

/** Liisa1 — signed in, but with nothing granted. */
export const noAccessToken = token('Liisa1', 'Korhonen', [])

export const asMember = `accessToken=${memberToken}`
export const asOtherMember = `accessToken=${otherMemberToken}`
export const asAdmin = `accessToken=${adminToken}`
export const asNobody = `accessToken=${noAccessToken}`

// ─── Test data the suites lean on ─────────────────────────────────────────────
// Real rows from sql/schema/testdata, so foreign keys hold.

/** Takes Jet A-1 only. */
export const JET_AIRCRAFT = 'OH-STL'
/** Takes MOGAS 98E5, MOGAS 95E10 and 100LL. */
export const PISTON_AIRCRAFT = 'OH-IHQ'
export const HOME = 'EFNU'
/** Pärnu — the only non-EF airfield in the test data, so "abroad" means this. */
export const ABROAD = 'EEPU'

/** A NEW flight in OH-STL billed to Matti1 — still editable, so linkable. */
export const NEW_JET_FLIGHT = 'mikify'
/** A VALIDATED flight in OH-IHQ billed to Matti1 — locks a member out. */
export const VALIDATED_PISTON_FLIGHT = 'ihq3fn1'
/** A NEW flight in OH-STL billed to someone else. */
export const OTHER_MEMBERS_FLIGHT = 'mass199'

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Everything a liquid suite creates, torn down between tests.
 *
 * Records are hard-deleted here even though the application only ever soft-
 * deletes them: the audit trigger's rows have no FK, so they are removed first
 * and by record id. Order matters — a record references a canister and a QR
 * code, so those go last.
 */
export const trackedRecordIds: string[] = []
export const trackedCanisterIds: string[] = []
export const trackedQrIds: string[] = []
export const trackedBatchIds: string[] = []
export const trackedFuelTax: { taxYear: number; fuelType: string }[] = []

export const cleanupLiquid = async (): Promise<void> => {
  if (trackedRecordIds.length) {
    await db.deleteFrom('liquid.recordAudit').where('recordId', 'in', trackedRecordIds).execute()
    await db.deleteFrom('liquid.record').where('recordId', 'in', trackedRecordIds).execute()
    trackedRecordIds.length = 0
  }
  if (trackedQrIds.length) {
    await db.deleteFrom('liquid.qrCode').where('qrId', 'in', trackedQrIds).execute()
    trackedQrIds.length = 0
  }
  if (trackedBatchIds.length) {
    // A batch's codes may have been created by the route rather than tracked
    // individually, so clear by batch before the batch itself.
    await db.deleteFrom('liquid.qrCode').where('batchId', 'in', trackedBatchIds).execute()
    await db.deleteFrom('liquid.qrBatch').where('batchId', 'in', trackedBatchIds).execute()
    trackedBatchIds.length = 0
  }
  if (trackedCanisterIds.length) {
    await db
      .deleteFrom('liquid.oilCanister')
      .where('canisterId', 'in', trackedCanisterIds)
      .execute()
    trackedCanisterIds.length = 0
  }
  for (const { taxYear, fuelType } of trackedFuelTax) {
    await db
      .deleteFrom('accts.fuelTax')
      .where('taxYear', '=', taxYear)
      .where('fuelType', '=', fuelType)
      .execute()
  }
  trackedFuelTax.length = 0
}

/** Inserts a canister directly, for suites that are not testing the create route. */
export const insertCanister = async (
  overrides: Partial<{
    clubCanisterRef: string
    aircraftRegistration: string
    isEmpty: boolean
    make: string
  }> = {},
): Promise<string> => {
  const row = await db
    .insertInto('liquid.oilCanister')
    .values({
      clubCanisterRef: overrides.clubCanisterRef ?? `TEST-${Date.now()}-${Math.random()}`,
      batchNumber: 'B-TEST',
      make: overrides.make ?? 'Aeroshell',
      modelViscosity: 'W100',
      aircraftRegistration: overrides.aircraftRegistration ?? PISTON_AIRCRAFT,
      initialLitres: 1,
      remainingLitres: 1,
      isEmpty: overrides.isEmpty ?? false,
      createdAt: new Date(),
      createdBy: 'k1mnimda',
      updatedAt: new Date(),
      updatedBy: 'k1mnimda',
    })
    .returning('canisterId')
    .executeTakeFirstOrThrow()
  trackedCanisterIds.push(row.canisterId)
  return row.canisterId
}

/**
 * Inserts a record directly, bypassing the API.
 *
 * Needed for the states the API refuses to create: a record older than the
 * edit window, one already attached to a claim, one belonging to another
 * member. `createdAt` is settable for exactly that reason.
 */
export const insertRecord = async (
  overrides: Partial<{
    memberId: string
    liquidType: 'FUEL' | 'OIL'
    aircraftRegistration: string
    airport: string | null
    fuelType: string | null
    providerCode: string
    quantityLitres: number
    totalCost: number | null
    ccy: string
    fxRate: number | null
    taxIncludedAbroad: boolean
    recordedAt: Date
    createdAt: Date
    flightLogId: string | null
    expenseClaimId: string | null
    oilCanisterId: string | null
    oilSource: 'CANISTER' | 'OTHER'
    taxAdjustedPricePerLitre: number | null
  }> = {},
): Promise<string> => {
  const liquidType = overrides.liquidType ?? 'FUEL'
  const createdAt = overrides.createdAt ?? new Date()

  let providerId: number | null = null
  if (liquidType === 'FUEL') {
    const provider = await db
      .selectFrom('liquid.fuelProvider')
      .select(['providerId'])
      .where('code', '=', overrides.providerCode ?? 'LOKKI')
      .executeTakeFirstOrThrow()
    providerId = provider.providerId
  }

  const row = await db
    .insertInto('liquid.record')
    .values({
      liquidType,
      aircraftRegistration: overrides.aircraftRegistration ?? JET_AIRCRAFT,
      memberId: overrides.memberId ?? 'Matti1',
      recordedAt: overrides.recordedAt ?? createdAt,
      airport: liquidType === 'FUEL' ? (overrides.airport ?? HOME) : (overrides.airport ?? null),
      fuelType: liquidType === 'FUEL' ? (overrides.fuelType ?? 'JET A-1') : null,
      providerId,
      quantityLitres: overrides.quantityLitres ?? 100,
      totalCost: overrides.totalCost ?? null,
      ccy: overrides.ccy ?? 'EUR',
      fxRate: overrides.fxRate ?? null,
      taxIncludedAbroad: overrides.taxIncludedAbroad ?? false,
      oilSource: liquidType === 'OIL' ? (overrides.oilSource ?? 'CANISTER') : null,
      oilCanisterId: overrides.oilCanisterId ?? null,
      oilMake: liquidType === 'OIL' && overrides.oilSource === 'OTHER' ? 'Aeroshell' : null,
      oilModelViscosity: liquidType === 'OIL' && overrides.oilSource === 'OTHER' ? 'W100' : null,
      oilBatchNumber: liquidType === 'OIL' && overrides.oilSource === 'OTHER' ? 'B-1' : null,
      flightLogId: overrides.flightLogId ?? null,
      expenseClaimId: overrides.expenseClaimId ?? null,
      taxAdjustedPricePerLitre: overrides.taxAdjustedPricePerLitre ?? null,
      source: 'MANUAL',
      createdAt,
      createdBy: overrides.memberId ?? 'Matti1',
      updatedAt: createdAt,
      updatedBy: overrides.memberId ?? 'Matti1',
    })
    .returning('recordId')
    .executeTakeFirstOrThrow()

  trackedRecordIds.push(row.recordId)
  return row.recordId
}

/**
 * A receipt attached directly to a record, for the "already has a receipt"
 * half of the claim-attachment sync tests — bypassing the upload route, which
 * needs a real image buffer and multer.
 */
export const insertRecordAttachment = async (
  recordId: string,
  overrides: Partial<{
    storageKey: string
    fileName: string
    fileSize: number
    mimeType: string
  }> = {},
): Promise<number> => {
  const row = await db
    .insertInto('liquid.recordAttachment')
    .values({
      recordId,
      storageKey: overrides.storageKey ?? `liquid-receipts/${recordId}/${Date.now()}_receipt.jpg`,
      fileName: overrides.fileName ?? 'receipt.jpg',
      fileSize: overrides.fileSize ?? 1234,
      mimeType: overrides.mimeType ?? 'image/jpeg',
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

/** A real draft expense claim, for the "claim-linked is immutable" cases. */
export const insertDraftClaim = async (memberId = 'Matti1'): Promise<string> => {
  const category = await db
    .selectFrom('accts.expenseCategory')
    .select(['id'])
    .where('code', '=', 'fuel')
    .executeTakeFirstOrThrow()

  const row = await db
    .insertInto('accts.expenseClaim')
    .values({
      memberId,
      categoryId: category.id,
      title: 'LIQUID-TEST claim',
      status: 'DRAFT',
      ccy: 'EUR',
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  trackedClaimIds.push(row.id)
  return row.id
}

export const trackedClaimIds: string[] = []

export const cleanupClaims = async (): Promise<void> => {
  if (!trackedClaimIds.length) return
  // The records reference the claim, so they let go of it first.
  await db
    .updateTable('liquid.record')
    .set({ expenseClaimId: null })
    .where('expenseClaimId', 'in', trackedClaimIds)
    .execute()
  await db.deleteFrom('accts.expenseClaim').where('id', 'in', trackedClaimIds).execute()
  trackedClaimIds.length = 0
}

/** Days ago, as a Date — for the edit-window cases. */
export const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000)
