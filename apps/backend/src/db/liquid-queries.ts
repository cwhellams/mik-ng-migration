import { sql, type ExpressionBuilder, type Kysely, type Transaction } from 'kysely'

import { db, type DbRow } from './connection.ts'
import { auditCreate, auditUpdate, mapAudit } from './audit.ts'
import { noExtraKeys } from './rowToContract.ts'
import type { DB } from './schema.d.ts'
import { FlightLogStatus } from '@mik/contracts/flight-log'
import {
  compareToReferencePrice,
  computeLiquidFuelPricing,
  deriveTaxIncludedAbroad,
  LIQUID_LINK_WINDOW_HOURS,
  LiquidRecordSource,
  LiquidType,
  OilSource,
  QrTargetType,
  type ClaimableFuelSummary,
  type CreateLiquidRecord,
  type CreateOilCanisterRequest,
  type FuelPriceComparisonQuery,
  type FuelPriceComparisonResponse,
  type FuelPriceComparisonRow,
  type FuelProvider,
  type FuelTax,
  type LiquidPrefill,
  type LiquidRecord,
  type LiquidRecordFilter,
  type OilCanister,
  type OilCanisterFilter,
  type QrBatch,
  type QrCode,
  type UpdateLiquidRecordRequest,
  type UpdateOilCanisterRequest,
  type UpsertFuelTaxRequest,
} from '@mik/contracts/liquid'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'
import { toHelsinki } from '@mik/contracts/date'

type Executor = Kysely<DB> | Transaction<DB>

/**
 * `DB` with the `r` alias the record queries use, so a shared `where` callback
 * can be typed. Kysely resolves aliases inside a single builder chain, but an
 * `ExpressionBuilder` written out by hand has to be told about them.
 */
type WithRecordAlias = DB & { r: DB['liquid.record'] }

// ─── Mappers ──────────────────────────────────────────────────────────────────

const toIso = (value: Date | string | null): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const num = (value: number | null | undefined): number | null =>
  value == null ? null : Number(value)

/**
 * The record as the list/detail endpoints return it: the row plus the four
 * human-readable names a client would otherwise need four more requests for
 * (airport, provider, canister ref) and the linked flight log's status, which
 * the lock rules need and the row itself does not carry.
 */
type RecordRow = DbRow<'liquid.record'> & {
  airportName: string | null
  providerName: string | null
  oilCanisterRef: string | null
  flightLogStatus: FlightLogStatus | null
  attachmentCount: string
}

const mapRecord = (row: RecordRow): LiquidRecord => ({
  recordId: row.recordId,
  liquidType: row.liquidType as LiquidType,
  aircraftRegistration: row.aircraftRegistration,
  memberId: row.memberId,
  recordedAt: toIso(row.recordedAt)!,
  airport: row.airport,
  airportName: row.airportName,
  fuelType: row.fuelType,
  providerId: row.providerId,
  providerName: row.providerName,
  quantityLitres: Number(row.quantityLitres),
  totalCost: num(row.totalCost),
  ccy: row.ccy,
  fxRate: num(row.fxRate),
  taxIncludedAbroad: row.taxIncludedAbroad,
  oilSource: row.oilSource as OilSource | null,
  oilCanisterId: row.oilCanisterId,
  oilCanisterRef: row.oilCanisterRef,
  oilMake: row.oilMake,
  oilModelViscosity: row.oilModelViscosity,
  oilBatchNumber: row.oilBatchNumber,
  remainingLitres: num(row.remainingLitres),
  markCanisterEmpty: row.markCanisterEmpty,
  flightLogId: row.flightLogId,
  flightLogStatus: row.flightLogStatus,
  expenseClaimId: row.expenseClaimId,
  qrId: row.qrId,
  source: row.source as LiquidRecordSource,
  originalPaidTotal: num(row.originalPaidTotal),
  originalPricePerLitre: num(row.originalPricePerLitre),
  taxAdjustedPricePerLitre: num(row.taxAdjustedPricePerLitre),
  fuelTaxYear: row.fuelTaxYear,
  fuelTaxRateApplied: num(row.fuelTaxRateApplied),
  claimLinkedAt: toIso(row.claimLinkedAt),
  deletedAt: toIso(row.deletedAt),
  deletedBy: row.deletedBy,
  attachmentCount: Number(row.attachmentCount),
  ...mapAudit(row),
})

const mapProvider = (row: DbRow<'liquid.fuelProvider'>): FuelProvider =>
  noExtraKeys({
    providerId: row.providerId,
    code: row.code,
    name: row.name,
    defaultAirport: row.defaultAirport,
    fuelTypes: row.fuelTypes,
    requiresTotalCost: row.requiresTotalCost,
    requiresClaim: row.requiresClaim,
    isHomeBase: row.isHomeBase,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  })

const mapCanister = (
  row: DbRow<'liquid.oilCanister'> & { qrCode: string | null },
): OilCanister => ({
  canisterId: row.canisterId,
  clubCanisterRef: row.clubCanisterRef,
  batchNumber: row.batchNumber,
  // A DATE column, which connection.ts's parser list hands back as a plain
  // 'YYYY-MM-DD' string rather than a Date — no conversion wanted.
  manufacturingDate: row.manufacturingDate,
  make: row.make,
  modelViscosity: row.modelViscosity,
  aircraftRegistration: row.aircraftRegistration,
  initialLitres: num(row.initialLitres),
  remainingLitres: num(row.remainingLitres),
  isOpened: row.isOpened,
  openedAt: toIso(row.openedAt),
  isEmpty: row.isEmpty,
  emptiedAt: toIso(row.emptiedAt),
  qrCode: row.qrCode,
  ...mapAudit(row),
})

const mapQrCode = (
  row: DbRow<'liquid.qrCode'> & { batchLabel: string | null; targetLabel: string | null },
): QrCode => ({
  qrId: row.qrId,
  code: row.code,
  batchId: row.batchId,
  batchLabel: row.batchLabel,
  targetType: row.targetType as QrTargetType | null,
  targetId: row.targetId,
  targetLabel: row.targetLabel,
  assignedAt: toIso(row.assignedAt),
  assignedBy: row.assignedBy,
  ...mapAudit(row),
})

const mapFuelTax = (row: DbRow<'accts.fuelTax'>): FuelTax =>
  noExtraKeys({
    ...row,
    rateEurPerLitre: Number(row.rateEurPerLitre),
    ...mapAudit(row),
  })

// ─── Reference data ───────────────────────────────────────────────────────────

export async function getFuelProviders(includeInactive = false): Promise<FuelProvider[]> {
  const rows = await db
    .selectFrom('liquid.fuelProvider')
    .selectAll()
    .$if(!includeInactive, (qb) => qb.where('isActive', '=', true))
    .orderBy('sortOrder', 'asc')
    .execute()
  return rows.map(mapProvider)
}

/** The fuel types an aircraft is allowed to take — `flight.aircraft.fuel_types`. */
export async function getAircraftFuelTypes(registration: string): Promise<string[] | undefined> {
  const row = await db
    .selectFrom('flight.aircraft')
    .select(['fuelTypes'])
    .where('registration', '=', registration)
    .executeTakeFirst()
  return row?.fuelTypes ?? undefined
}

// ─── Liquid records ───────────────────────────────────────────────────────────

const recordSelect = (qb: Executor) =>
  qb
    .selectFrom('liquid.record as r')
    .leftJoin('static.airfields as af', 'af.ident', 'r.airport')
    .leftJoin('liquid.fuelProvider as p', 'p.providerId', 'r.providerId')
    .leftJoin('liquid.oilCanister as oc', 'oc.canisterId', 'r.oilCanisterId')
    .leftJoin('flight.logs as fl', 'fl.flightId', 'r.flightLogId')
    .selectAll('r')
    .select((eb) => [
      'af.name as airportName',
      'p.name as providerName',
      'oc.clubCanisterRef as oilCanisterRef',
      'fl.status as flightLogStatus',
      // Correlated rather than a join: a record with several attachments would
      // otherwise duplicate its row once per attachment.
      eb
        .selectFrom('liquid.recordAttachment as la')
        .whereRef('la.recordId', '=', 'r.recordId')
        .select((eb2) => eb2.fn.count<string>('la.id').as('c'))
        .as('attachmentCount'),
    ])

export async function getLiquidRecordById(
  recordId: string,
  executor: Executor = db,
): Promise<LiquidRecord | undefined> {
  const row = await recordSelect(executor).where('r.recordId', '=', recordId).executeTakeFirst()
  return row ? mapRecord(row as RecordRow) : undefined
}

export async function listLiquidRecords(
  filter: LiquidRecordFilter,
): Promise<{ records: LiquidRecord[]; total: number }> {
  // The page and the count must apply the same predicates, or the member sees a
  // total that doesn't match the rows. Kysely's builders are immutable and each
  // .where() returns a differently-typed builder, so the two are kept in step by
  // sharing this list of expressions rather than by a generic helper full of casts.
  const predicates = (eb: ExpressionBuilder<WithRecordAlias, 'r'>) => {
    const conditions = [
      filter.liquidType ? eb('r.liquidType', '=', filter.liquidType) : null,
      filter.aircraftRegistration
        ? eb('r.aircraftRegistration', '=', filter.aircraftRegistration)
        : null,
      filter.memberId ? eb('r.memberId', '=', filter.memberId) : null,
      filter.from ? eb('r.recordedAt', '>=', new Date(filter.from)) : null,
      filter.to ? eb('r.recordedAt', '<=', new Date(filter.to)) : null,
      filter.unclaimed ? eb('r.expenseClaimId', 'is', null) : null,
      filter.unlinked ? eb('r.flightLogId', 'is', null) : null,
      filter.flightLogId ? eb('r.flightLogId', '=', filter.flightLogId) : null,
      filter.includeDeleted ? null : eb('r.deletedAt', 'is', null),
    ].filter((c): c is Exclude<typeof c, null> => c !== null)
    return eb.and(conditions)
  }

  const rows = await recordSelect(db)
    .where(predicates)
    .orderBy('r.recordedAt', 'desc')
    .orderBy('r.recordId', 'desc')
    .limit(filter.limit)
    .offset(filter.offset)
    .execute()

  const counted = await db
    .selectFrom('liquid.record as r')
    .select(db.fn.countAll<string>().as('total'))
    .where(predicates)
    .executeTakeFirst()

  return {
    records: rows.map((row) => mapRecord(row as RecordRow)),
    total: Number(counted?.total ?? 0),
  }
}

/**
 * "Suggest the aircraft's most recent eligible liquid records when linking."
 *
 * Eligible means: same aircraft, same liquid, not already on a flight log, not
 * on a claim (claim-linked records are immutable, so linking one would be
 * rejected anyway), and not deleted. Not restricted to the caller's own
 * records — "fuel now, fly later, maybe a different person" is the normal
 * flow — but someone else's record only surfaces within
 * `LIQUID_LINK_WINDOW_HOURS`, so this doesn't turn into "browse every unlinked
 * fuelling anyone ever reported." The caller's own older records still show:
 * it is still their fuel to eventually link.
 */
export async function getLinkableRecords(
  aircraftRegistration: string,
  liquidType: LiquidType,
  memberId: string,
  limit = 10,
): Promise<LiquidRecord[]> {
  const linkWindowStart = new Date(Date.now() - LIQUID_LINK_WINDOW_HOURS * 60 * 60 * 1000)
  const rows = await recordSelect(db)
    .where('r.aircraftRegistration', '=', aircraftRegistration)
    .where('r.liquidType', '=', liquidType)
    .where((eb) =>
      eb.or([eb('r.memberId', '=', memberId), eb('r.recordedAt', '>=', linkWindowStart)]),
    )
    .where('r.flightLogId', 'is', null)
    .where('r.expenseClaimId', 'is', null)
    .where('r.deletedAt', 'is', null)
    .orderBy('r.recordedAt', 'desc')
    .limit(limit)
    .execute()
  return rows.map((row) => mapRecord(row as RecordRow))
}

export async function getRecordsForFlightLog(flightLogId: string): Promise<LiquidRecord[]> {
  const rows = await recordSelect(db)
    .where('r.flightLogId', '=', flightLogId)
    .where('r.deletedAt', 'is', null)
    .orderBy('r.liquidType', 'asc')
    .execute()
  return rows.map((row) => mapRecord(row as RecordRow))
}

export async function getRecordsForClaim(claimId: string): Promise<LiquidRecord[]> {
  const rows = await recordSelect(db)
    .where('r.expenseClaimId', '=', claimId)
    .orderBy('r.recordedAt', 'asc')
    .execute()
  return rows.map((row) => mapRecord(row as RecordRow))
}

/**
 * The fuel-tax rate in force for a record: the row for that calendar year and
 * fuel type, or null when the treasurer hasn't configured one.
 *
 * Deliberately an exact year match rather than "most recent year at or before".
 * A fuel tax is legislated per year; falling back to an older year would apply a
 * superseded rate silently, where returning null applies none and is visible.
 */
export async function getFuelTaxRate(
  taxYear: number,
  fuelType: string,
  executor: Executor = db,
): Promise<number | null> {
  const row = await executor
    .selectFrom('accts.fuelTax')
    .select(['rateEurPerLitre'])
    .where('taxYear', '=', taxYear)
    .where('fuelType', '=', fuelType)
    .executeTakeFirst()
  return row ? Number(row.rateEurPerLitre) : null
}

export async function createLiquidRecord(
  data: CreateLiquidRecord,
  memberId: string,
  qrId: string | null,
): Promise<LiquidRecord> {
  const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date()

  return db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('liquid.record')
      .values({
        liquidType: data.liquidType,
        aircraftRegistration: data.aircraftRegistration,
        memberId,
        recordedAt,
        airport: data.airport ?? null,
        fuelType: data.fuelType ?? null,
        providerId: data.providerId ?? null,
        quantityLitres: data.quantityLitres,
        totalCost: data.totalCost ?? null,
        ccy: data.ccy,
        fxRate: data.fxRate ?? null,
        // Explicit wins; otherwise the ICAO/fuel-type rule decides.
        taxIncludedAbroad:
          data.taxIncludedAbroad ?? deriveTaxIncludedAbroad(data.airport, data.fuelType),
        oilSource: data.oilSource ?? null,
        oilCanisterId: data.oilCanisterId ?? null,
        oilMake: data.oilMake ?? null,
        oilModelViscosity: data.oilModelViscosity ?? null,
        oilBatchNumber: data.oilBatchNumber ?? null,
        remainingLitres: data.remainingLitres ?? null,
        markCanisterEmpty: data.markCanisterEmpty,
        flightLogId: data.flightLogId ?? null,
        qrId,
        source: data.source,
        ...auditCreate(memberId),
      })
      .returning('recordId')
      .executeTakeFirstOrThrow()

    if (data.liquidType === LiquidType.OIL && data.oilCanisterId) {
      await applyCanisterUsage(trx, data.oilCanisterId, data.markCanisterEmpty, memberId)
    }

    return (await getLiquidRecordById(inserted.recordId, trx))!
  })
}

/**
 * "Mark a canister as opened upon first use. Allow marking it empty after use."
 *
 * `remaining_litres` is deliberately untouched: the issue is explicit that the
 * member's reported remaining quantity is informational and is never enforced
 * against reported usage, so nothing here decrements stock.
 */
async function applyCanisterUsage(
  trx: Transaction<DB>,
  canisterId: string,
  markEmpty: boolean,
  actor: string,
): Promise<void> {
  const now = new Date()
  await trx
    .updateTable('liquid.oilCanister')
    .set({
      isOpened: true,
      openedAt: sql`COALESCE(opened_at, ${now})`,
      ...(markEmpty ? { isEmpty: true, emptiedAt: now } : {}),
      ...auditUpdate(actor, now),
    })
    .where('canisterId', '=', canisterId)
    .execute()
}

export async function updateLiquidRecord(
  recordId: string,
  data: UpdateLiquidRecordRequest,
  actor: string,
): Promise<LiquidRecord> {
  return db.transaction().execute(async (trx) => {
    // Only keys the caller actually sent reach the statement: an absent key must
    // leave the column alone, which is why UpdateLiquidRecordSchema applies no
    // defaults of its own.
    const patch: Record<string, unknown> = {}
    const set = <K extends keyof UpdateLiquidRecordRequest>(key: K, column = key as string) => {
      if (data[key] !== undefined) patch[column] = data[key]
    }

    if (data.recordedAt !== undefined) patch.recordedAt = new Date(data.recordedAt)
    set('aircraftRegistration')
    set('airport')
    set('fuelType')
    set('providerId')
    set('quantityLitres')
    set('totalCost')
    set('ccy')
    set('fxRate')
    set('taxIncludedAbroad')
    set('oilCanisterId')
    set('oilMake')
    set('oilModelViscosity')
    set('oilBatchNumber')
    set('remainingLitres')
    set('markCanisterEmpty')
    set('flightLogId')

    if (Object.keys(patch).length > 0) {
      await trx
        .updateTable('liquid.record')
        .set({ ...patch, ...auditUpdate(actor) } as never)
        .where('recordId', '=', recordId)
        .execute()
    }

    if (data.markCanisterEmpty === true) {
      const row = await trx
        .selectFrom('liquid.record')
        .select(['oilCanisterId'])
        .where('recordId', '=', recordId)
        .executeTakeFirst()
      if (row?.oilCanisterId) await applyCanisterUsage(trx, row.oilCanisterId, true, actor)
    }

    return (await getLiquidRecordById(recordId, trx))!
  })
}

/**
 * Soft delete. A hard DELETE would leave an audit row but break the FK trail
 * from any claim or flight log that referenced the record, so the row stays and
 * every read filters on `deleted_at`.
 */
export async function softDeleteLiquidRecord(recordId: string, actor: string): Promise<void> {
  const now = new Date()
  await db
    .updateTable('liquid.record')
    .set({ deletedAt: now, deletedBy: actor, ...auditUpdate(actor, now) })
    .where('recordId', '=', recordId)
    .where('deletedAt', 'is', null)
    .execute()
}

/**
 * Links records to a claim and freezes their pricing.
 *
 * The freeze is the point: `accts.fuel_tax` is editable, and a rate corrected in
 * March must not move a claim approved in February. Everything the calculation
 * used — the paid total, the paid litre price, the resulting tax-adjusted price,
 * the year and the rate — is copied onto the row here and never recomputed.
 *
 * The `expense_claim_id IS NULL` guard is what enforces "a fuel record may be
 * attached to only one expense claim" against two concurrent submissions: the
 * second one updates no rows and is reported as a conflict rather than silently
 * stealing the record.
 */
export async function linkRecordsToClaim(
  recordIds: string[],
  claimId: string,
  actor: string,
  executor?: Transaction<DB>,
): Promise<{ linked: string[]; rejected: string[] }> {
  if (recordIds.length === 0) return { linked: [], rejected: [] }

  // Joins the caller's transaction when there is one, so a claim and the records
  // it is built from are saved or not saved together. The expense claim routes
  // pass theirs; a standalone caller gets its own.
  const run = async (trx: Transaction<DB>) => {
    const rows = await trx
      .selectFrom('liquid.record')
      .selectAll()
      .where('recordId', 'in', recordIds)
      .where('deletedAt', 'is', null)
      .where('expenseClaimId', 'is', null)
      .execute()

    const now = new Date()
    const linked: string[] = []

    for (const row of rows) {
      const recordedAt = new Date(row.recordedAt)
      const rate = row.fuelType
        ? await getFuelTaxRate(toHelsinki(recordedAt).year(), row.fuelType, trx)
        : null

      const pricing = computeLiquidFuelPricing({
        quantityLitres: Number(row.quantityLitres),
        totalCost: num(row.totalCost),
        ccy: row.ccy,
        fxRate: num(row.fxRate),
        taxIncludedAbroad: row.taxIncludedAbroad,
        recordedAt,
        taxRateEurPerLitre: rate,
      })

      const result = await trx
        .updateTable('liquid.record')
        .set({
          expenseClaimId: claimId,
          claimLinkedAt: now,
          originalPaidTotal: pricing.originalPaidTotal,
          originalPricePerLitre: pricing.originalPricePerLitre,
          taxAdjustedPricePerLitre: pricing.taxAdjustedPricePerLitre,
          fuelTaxYear: pricing.fuelTaxYear,
          fuelTaxRateApplied: pricing.fuelTaxRateApplied,
          ...auditUpdate(actor, now),
        })
        .where('recordId', '=', row.recordId)
        .where('expenseClaimId', 'is', null)
        .executeTakeFirst()

      if (Number(result.numUpdatedRows) > 0) linked.push(row.recordId)
    }

    return { linked, rejected: recordIds.filter((id) => !linked.includes(id)) }
  }

  return executor ? run(executor) : db.transaction().execute(run)
}

/**
 * Releases records from a claim, clearing the frozen pricing with them.
 *
 * Only ever called for a claim that is still a draft or has been deleted — an
 * approved claim's records stay locked, which is the whole point of the freeze.
 */
export async function unlinkRecordsFromClaim(
  claimId: string,
  actor: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .updateTable('liquid.record')
    .set({
      expenseClaimId: null,
      claimLinkedAt: null,
      originalPaidTotal: null,
      originalPricePerLitre: null,
      taxAdjustedPricePerLitre: null,
      fuelTaxYear: null,
      fuelTaxRateApplied: null,
      ...auditUpdate(actor),
    })
    .where('expenseClaimId', '=', claimId)
    .execute()
}

/**
 * The dashboard prompt: fuel the member paid for and hasn't claimed yet.
 *
 * Not just "has a total cost" — AirBP/Kanair also require one, for
 * reconciliation, even though the club's card paid and there is nothing to
 * claim. Only a provider with `requiresClaim` (currently just "Other / own
 * payment") is the member's own money.
 */
export async function getClaimableFuelSummary(memberId: string): Promise<ClaimableFuelSummary> {
  const row = await db
    .selectFrom('liquid.record as r')
    .innerJoin('liquid.fuelProvider as fp', 'fp.providerId', 'r.providerId')
    .select([
      db.fn.countAll<string>().as('count'),
      // The paid total converted to EUR, matching what the claim will carry.
      sql<string | null>`SUM(r.total_cost * COALESCE(r.fx_rate, 1))`.as('totalCostEur'),
      sql<Date | null>`MIN(r.recorded_at)`.as('oldestRecordedAt'),
    ])
    .where('r.memberId', '=', memberId)
    .where('r.liquidType', '=', LiquidType.FUEL)
    .where('r.expenseClaimId', 'is', null)
    .where('r.totalCost', 'is not', null)
    .where('r.deletedAt', 'is', null)
    .where('fp.requiresClaim', '=', true)
    .executeTakeFirst()

  return {
    count: Number(row?.count ?? 0),
    totalCostEur: Math.round(Number(row?.totalCostEur ?? 0) * 100) / 100,
    oldestRecordedAt: toIso(row?.oldestRecordedAt ?? null),
  }
}

// ─── Oil canisters ────────────────────────────────────────────────────────────

const canisterSelect = () =>
  db
    .selectFrom('liquid.oilCanister as c')
    // The sticker on the tin, when one has been assigned. A left join rather
    // than a second request, because the admin list shows it per row.
    .leftJoin('liquid.qrCode as q', (join) =>
      join
        .onRef('q.targetId', '=', sql`c.canister_id::text`)
        .on('q.targetType', '=', QrTargetType.OIL_CANISTER),
    )
    .selectAll('c')
    .select('q.code as qrCode')

export async function listOilCanisters(filter: OilCanisterFilter): Promise<OilCanister[]> {
  const rows = await canisterSelect()
    .$if(!!filter.aircraftRegistration, (qb) =>
      qb.where('c.aircraftRegistration', '=', filter.aircraftRegistration!),
    )
    // "Empty canisters are removed from available inventory."
    .$if(!filter.includeEmpty, (qb) => qb.where('c.isEmpty', '=', false))
    .orderBy('c.isEmpty', 'asc')
    .orderBy('c.clubCanisterRef', 'asc')
    .execute()
  return rows.map(mapCanister)
}

export async function getOilCanisterById(canisterId: string): Promise<OilCanister | undefined> {
  const row = await canisterSelect().where('c.canisterId', '=', canisterId).executeTakeFirst()
  return row ? mapCanister(row) : undefined
}

/** How many canisters of a make exist, for the "MIK <make> <YY>/<seq>" suggestion. */
export async function countCanistersByMake(make: string): Promise<number> {
  const row = await db
    .selectFrom('liquid.oilCanister')
    .select(db.fn.countAll<string>().as('count'))
    .where(sql`lower(make)`, '=', make.toLowerCase())
    .executeTakeFirst()
  return Number(row?.count ?? 0)
}

export async function createOilCanister(
  data: CreateOilCanisterRequest,
  actor: string,
): Promise<OilCanister> {
  const row = await db
    .insertInto('liquid.oilCanister')
    .values({
      clubCanisterRef: data.clubCanisterRef,
      batchNumber: data.batchNumber,
      manufacturingDate: data.manufacturingDate ?? null,
      make: data.make,
      modelViscosity: data.modelViscosity,
      aircraftRegistration: data.aircraftRegistration,
      initialLitres: data.initialLitres ?? null,
      // A fresh canister is full, so remaining starts at the initial volume.
      remainingLitres: data.initialLitres ?? null,
      ...auditCreate(actor),
    })
    .returning('canisterId')
    .executeTakeFirstOrThrow()
  return (await getOilCanisterById(row.canisterId))!
}

export async function updateOilCanister(
  canisterId: string,
  data: UpdateOilCanisterRequest,
  actor: string,
): Promise<OilCanister | undefined> {
  const now = new Date()
  const patch: Record<string, unknown> = { ...auditUpdate(actor, now) }
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) patch[key] = value
  }
  // Opened/emptied timestamps follow their flags rather than being set by the
  // caller, so "when" always matches "whether".
  if (data.isOpened === true) patch.openedAt = sql`COALESCE(opened_at, ${now})`
  if (data.isOpened === false) patch.openedAt = null
  if (data.isEmpty === true) patch.emptiedAt = sql`COALESCE(emptied_at, ${now})`
  if (data.isEmpty === false) patch.emptiedAt = null

  await db
    .updateTable('liquid.oilCanister')
    .set(patch as never)
    .where('canisterId', '=', canisterId)
    .execute()
  return getOilCanisterById(canisterId)
}

export async function deleteOilCanister(canisterId: string): Promise<void> {
  await db.deleteFrom('liquid.oilCanister').where('canisterId', '=', canisterId).execute()
}

/** Oil records already filed against a canister — a delete would orphan these. */
export async function countRecordsForCanister(canisterId: string): Promise<number> {
  const row = await db
    .selectFrom('liquid.record')
    .select(db.fn.countAll<string>().as('count'))
    .where('oilCanisterId', '=', canisterId)
    .executeTakeFirst()
  return Number(row?.count ?? 0)
}

// ─── Fuel stations ────────────────────────────────────────────────────────────

export interface FuelStationRow {
  stationId: string
  label: string
  airport: string
  fuelType: string | null
  providerId: number | null
  providerName: string | null
  aircraftRegistration: string | null
}

export async function listFuelStations(): Promise<FuelStationRow[]> {
  return db
    .selectFrom('liquid.fuelStation as s')
    .leftJoin('liquid.fuelProvider as p', 'p.providerId', 's.providerId')
    .select([
      's.stationId',
      's.label',
      's.airport',
      's.fuelType',
      's.providerId',
      'p.name as providerName',
      's.aircraftRegistration',
    ])
    .where('s.isActive', '=', true)
    .orderBy('s.label', 'asc')
    .execute()
}

// ─── QR codes ─────────────────────────────────────────────────────────────────

/**
 * Crockford-style base32 without I, L, O and U — the four that get misread off a
 * printed sticker, which is the only place these are ever typed by hand.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 5

const randomCode = (random: (bytes: number) => Uint8Array): string => {
  const bytes = random(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return `MIK-L-${out}`
}

/**
 * Generates a batch of unassigned identities.
 *
 * `code` is UNIQUE, so a collision is a constraint violation rather than a
 * silent overwrite; with 32^5 ≈ 34M codes a clash is remote, and the retry loop
 * covers it rather than letting one unlucky insert fail a whole sheet.
 */
export async function createQrBatch(
  label: string,
  count: number,
  actor: string,
  random: (bytes: number) => Uint8Array,
): Promise<{ batch: QrBatch; codes: QrCode[] }> {
  return db.transaction().execute(async (trx) => {
    const now = new Date()

    // Filtering out codes that already exist can leave fewer than `count`;
    // the original version stopped there, so a batch could silently ship
    // with fewer codes than its own codeCount claimed. Topped up in rounds
    // instead, generating only the shortfall each time, until the batch is
    // full or a broken `random` (bounded attempts) makes another round
    // pointless.
    const excluded = new Set<string>()
    const codes: string[] = []
    for (let round = 0; codes.length < count && round < 5; round++) {
      const stillNeeded = count - codes.length
      const candidates = new Set<string>()
      for (
        let attempt = 0;
        candidates.size < stillNeeded && attempt < stillNeeded * 20;
        attempt++
      ) {
        const code = randomCode(random)
        if (!excluded.has(code)) candidates.add(code)
      }
      if (candidates.size === 0) break

      const taken = await trx
        .selectFrom('liquid.qrCode')
        .select(['code'])
        .where('code', 'in', [...candidates])
        .execute()
      const takenCodes = new Set(taken.map((r) => r.code))

      for (const code of candidates) {
        excluded.add(code)
        if (!takenCodes.has(code) && codes.length < count) codes.push(code)
      }
    }

    // codeCount reflects what was actually generated, never the requested
    // count on faith — the two could otherwise disagree if generation ran out
    // of rounds.
    const batch = await trx
      .insertInto('liquid.qrBatch')
      .values({ label, codeCount: codes.length, ...auditCreate(actor, now) })
      .returning('batchId')
      .executeTakeFirstOrThrow()

    if (codes.length > 0) {
      await trx
        .insertInto('liquid.qrCode')
        .values(codes.map((code) => ({ code, batchId: batch.batchId, ...auditCreate(actor, now) })))
        .execute()
    }

    return {
      batch: (await getQrBatch(batch.batchId, trx))!,
      codes: await listQrCodes({ batchId: batch.batchId, unassignedOnly: false }, trx),
    }
  })
}

const qrCodeSelect = (executor: Executor) =>
  executor
    .selectFrom('liquid.qrCode as q')
    .leftJoin('liquid.qrBatch as b', 'b.batchId', 'q.batchId')
    .leftJoin('liquid.oilCanister as oc', (join) =>
      join
        .onRef('oc.canisterId', '=', sql`q.target_id::uuid`)
        .on('q.targetType', '=', QrTargetType.OIL_CANISTER),
    )
    .leftJoin('liquid.fuelStation as fs', (join) =>
      join
        .onRef('fs.stationId', '=', sql`q.target_id::uuid`)
        .on('q.targetType', '=', QrTargetType.FUEL_STATION),
    )
    .selectAll('q')
    .select([
      'b.label as batchLabel',
      sql<string | null>`COALESCE(oc.club_canister_ref, fs.label)`.as('targetLabel'),
    ])

export async function listQrCodes(
  filter: { batchId?: string; unassignedOnly: boolean },
  executor: Executor = db,
): Promise<QrCode[]> {
  const rows = await qrCodeSelect(executor)
    .$if(!!filter.batchId, (qb) => qb.where('q.batchId', '=', filter.batchId!))
    .$if(filter.unassignedOnly, (qb) => qb.where('q.targetType', 'is', null))
    .orderBy('q.createdAt', 'asc')
    .orderBy('q.code', 'asc')
    .execute()
  return rows.map(mapQrCode)
}

export async function getQrCodeByCode(
  code: string,
  executor: Executor = db,
): Promise<QrCode | undefined> {
  const row = await qrCodeSelect(executor).where('q.code', '=', code).executeTakeFirst()
  return row ? mapQrCode(row) : undefined
}

export async function getQrBatch(
  batchId: string,
  executor: Executor = db,
): Promise<QrBatch | undefined> {
  const row = await executor
    .selectFrom('liquid.qrBatch as b')
    .leftJoin('liquid.qrCode as q', 'q.batchId', 'b.batchId')
    .select([
      'b.batchId',
      'b.label',
      'b.codeCount',
      'b.createdAt',
      'b.createdBy',
      'b.updatedAt',
      'b.updatedBy',
      sql<string>`COUNT(q.qr_id) FILTER (WHERE q.target_type IS NOT NULL)`.as('assignedCount'),
    ])
    .where('b.batchId', '=', batchId)
    .groupBy([
      'b.batchId',
      'b.label',
      'b.codeCount',
      'b.createdAt',
      'b.createdBy',
      'b.updatedAt',
      'b.updatedBy',
    ])
    .executeTakeFirst()

  return row
    ? {
        batchId: row.batchId,
        label: row.label,
        codeCount: row.codeCount,
        assignedCount: Number(row.assignedCount),
        ...mapAudit(row),
      }
    : undefined
}

export async function listQrBatches(): Promise<QrBatch[]> {
  const rows = await db
    .selectFrom('liquid.qrBatch as b')
    .leftJoin('liquid.qrCode as q', 'q.batchId', 'b.batchId')
    .select([
      'b.batchId',
      'b.label',
      'b.codeCount',
      'b.createdAt',
      'b.createdBy',
      'b.updatedAt',
      'b.updatedBy',
      sql<string>`COUNT(q.qr_id) FILTER (WHERE q.target_type IS NOT NULL)`.as('assignedCount'),
    ])
    .groupBy([
      'b.batchId',
      'b.label',
      'b.codeCount',
      'b.createdAt',
      'b.createdBy',
      'b.updatedAt',
      'b.updatedBy',
    ])
    .orderBy('b.createdAt', 'desc')
    .execute()

  return rows.map((row) => ({
    batchId: row.batchId,
    label: row.label,
    codeCount: row.codeCount,
    assignedCount: Number(row.assignedCount),
    ...mapAudit(row),
  }))
}

/**
 * Assigns a code to a target, once and for all.
 *
 * The `target_type IS NULL` predicate makes this the whole race-safety story:
 * two admins assigning the same freshly-printed code at once means the second
 * update matches no rows. The database's BEFORE UPDATE trigger refuses a
 * reassignment as well, so this cannot be bypassed by a different code path.
 */
export async function assignQrCode(
  code: string,
  targetType: QrTargetType,
  targetId: string,
  actor: string,
): Promise<QrCode | undefined> {
  const now = new Date()
  const result = await db
    .updateTable('liquid.qrCode')
    .set({ targetType, targetId, assignedAt: now, assignedBy: actor, ...auditUpdate(actor, now) })
    .where('code', '=', code)
    .where('targetType', 'is', null)
    .executeTakeFirst()

  return Number(result.numUpdatedRows) > 0 ? getQrCodeByCode(code) : undefined
}

/**
 * The reporting context behind an assigned code — what "deep links prefill
 * reporting forms" resolves to.
 *
 * Returns undefined when the code points at a target that has since been
 * removed. That is a dangling sticker, not a bug in the scan: the caller
 * surfaces it rather than rendering a half-filled form.
 */
export async function resolveQrPrefill(qr: QrCode): Promise<LiquidPrefill | undefined> {
  if (qr.targetType === QrTargetType.OIL_CANISTER && qr.targetId) {
    const canister = await getOilCanisterById(qr.targetId)
    if (!canister) return undefined
    return {
      liquidType: LiquidType.OIL,
      aircraftRegistration: canister.aircraftRegistration,
      oilSource: OilSource.CANISTER,
      oilCanisterId: canister.canisterId,
      oilCanisterRef: canister.clubCanisterRef,
      label: `${canister.aircraftRegistration} · ${canister.clubCanisterRef} · ${canister.make} ${canister.modelViscosity}`,
    }
  }

  if (qr.targetType === QrTargetType.FUEL_STATION && qr.targetId) {
    const station = await db
      .selectFrom('liquid.fuelStation as s')
      .leftJoin('liquid.fuelProvider as p', 'p.providerId', 's.providerId')
      .select([
        's.airport',
        's.fuelType',
        's.providerId',
        's.aircraftRegistration',
        'p.name as providerName',
      ])
      .where('s.stationId', '=', qr.targetId)
      .where('s.isActive', '=', true)
      .executeTakeFirst()
    if (!station) return undefined
    return {
      liquidType: LiquidType.FUEL,
      aircraftRegistration: station.aircraftRegistration ?? undefined,
      airport: station.airport,
      fuelType: station.fuelType ?? undefined,
      providerId: station.providerId ?? undefined,
      providerName: station.providerName ?? undefined,
      label: [station.aircraftRegistration, station.airport, station.fuelType]
        .filter(Boolean)
        .join(' · '),
    }
  }

  return undefined
}

// ─── Fuel tax ─────────────────────────────────────────────────────────────────

export async function listFuelTaxes(): Promise<FuelTax[]> {
  const rows = await db
    .selectFrom('accts.fuelTax')
    .selectAll()
    .orderBy('taxYear', 'desc')
    .orderBy('fuelType', 'asc')
    .execute()
  return rows.map(mapFuelTax)
}

export async function upsertFuelTax(data: UpsertFuelTaxRequest, actor: string): Promise<FuelTax> {
  const now = new Date()
  const row = await db
    .insertInto('accts.fuelTax')
    .values({
      taxYear: data.taxYear,
      fuelType: data.fuelType,
      rateEurPerLitre: data.rateEurPerLitre,
      ...auditCreate(actor, now),
    })
    .onConflict((oc) =>
      oc.columns(['taxYear', 'fuelType']).doUpdateSet({
        rateEurPerLitre: data.rateEurPerLitre,
        ...auditUpdate(actor, now),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapFuelTax(row)
}

export async function deleteFuelTax(taxYear: number, fuelType: string): Promise<void> {
  await db
    .deleteFrom('accts.fuelTax')
    .where('taxYear', '=', taxYear)
    .where('fuelType', '=', fuelType)
    .execute()
}

// ─── Fuel price comparison report ─────────────────────────────────────────────

/**
 * "A report for a selected date range that identifies fuelings whose litre price
 * exceeds the EFNU reference price entered at runtime."
 *
 * Read from `liquid.record`, which is the change that makes the report useful:
 * the old `/v1/fuel-report` derived fuellings from expense line items, so a
 * fuelling nobody claimed was invisible to it.
 *
 * Every fuel record in range is returned, including the ones that cannot be
 * compared — an EFNU fuelling with no cost, or a fuel type the user gave no
 * reference price for. Dropping those would make an empty result read as "no
 * fuelling was over the reference".
 */
export async function getFuelPriceComparison(
  query: FuelPriceComparisonQuery,
): Promise<FuelPriceComparisonResponse> {
  const rows = await db
    .selectFrom('liquid.record as r')
    .leftJoin('static.airfields as af', 'af.ident', 'r.airport')
    .leftJoin('liquid.fuelProvider as p', 'p.providerId', 'r.providerId')
    .leftJoin('accts.expenseClaim as ec', 'ec.id', 'r.expenseClaimId')
    .select([
      'r.recordId',
      'r.recordedAt',
      'r.aircraftRegistration',
      'r.memberId',
      'r.airport',
      'af.name as airportName',
      'r.fuelType',
      'p.name as providerName',
      'r.quantityLitres',
      'r.totalCost',
      'r.ccy',
      'r.fxRate',
      'r.taxIncludedAbroad',
      'r.taxAdjustedPricePerLitre',
      'r.expenseClaimId',
      'r.flightLogId',
      'ec.status as claimStatus',
    ])
    .where('r.liquidType', '=', LiquidType.FUEL)
    .where('r.deletedAt', 'is', null)
    .where('r.recordedAt', '>=', sql<Date>`${query.from}::date`)
    // Inclusive of the end date: `to` names a day, and a fuelling at 18:00 on
    // that day is inside the range the user asked for.
    .where('r.recordedAt', '<', sql<Date>`${query.to}::date + INTERVAL '1 day'`)
    .$if(!!query.aircraftRegistration, (qb) =>
      qb.where('r.aircraftRegistration', '=', query.aircraftRegistration!),
    )
    .orderBy('r.recordedAt', 'desc')
    .execute()

  // One rate lookup per (year, fuel type) rather than per row.
  const rateCache = new Map<string, number | null>()
  const rateFor = async (year: number, fuelType: string | null): Promise<number | null> => {
    if (!fuelType) return null
    const key = `${year}:${fuelType}`
    if (!rateCache.has(key)) rateCache.set(key, await getFuelTaxRate(year, fuelType))
    return rateCache.get(key)!
  }

  const out: FuelPriceComparisonRow[] = []
  for (const row of rows) {
    const recordedAt = new Date(row.recordedAt)
    const pricing = computeLiquidFuelPricing({
      quantityLitres: Number(row.quantityLitres),
      totalCost: num(row.totalCost),
      ccy: row.ccy,
      fxRate: num(row.fxRate),
      taxIncludedAbroad: row.taxIncludedAbroad,
      recordedAt,
      taxRateEurPerLitre: await rateFor(toHelsinki(recordedAt).year(), row.fuelType),
    })
    // A DRAFT claim hasn't been submitted yet and a REJECTED one was declined
    // by the club -- the old /v1/fuel-report explicitly treated both as "not
    // reliable enough to report a price from". The frozen figure is only
    // trusted once a claim has actually been submitted for payment; otherwise
    // this falls back to the live recompute above, same as an unclaimed record.
    const unreliableClaim =
      row.claimStatus === ExpenseClaimStatus.DRAFT ||
      row.claimStatus === ExpenseClaimStatus.REJECTED
    const stored = unreliableClaim ? null : num(row.taxAdjustedPricePerLitre)
    const referencePrice = row.fuelType ? (query.reference[row.fuelType] ?? null) : null

    out.push({
      recordId: row.recordId,
      recordedAt: toIso(row.recordedAt)!,
      aircraftRegistration: row.aircraftRegistration,
      memberId: row.memberId,
      airport: row.airport,
      airportName: row.airportName,
      fuelType: row.fuelType,
      providerName: row.providerName,
      quantityLitres: Number(row.quantityLitres),
      totalCost: num(row.totalCost),
      ccy: row.ccy,
      taxIncludedAbroad: row.taxIncludedAbroad,
      paidPricePerLitre: pricing.originalPricePerLitre,
      taxAdjustedPricePerLitre: pricing.taxAdjustedPricePerLitre,
      storedTaxAdjustedPricePerLitre: stored,
      referencePrice,
      expenseClaimId: row.expenseClaimId,
      flightLogId: row.flightLogId,
      ...compareToReferencePrice({
        taxAdjustedPricePerLitre: pricing.taxAdjustedPricePerLitre,
        storedTaxAdjustedPricePerLitre: stored,
        referencePrice,
      }),
    })
  }

  const exceeding = out.filter((r) => r.exceedsReference)
  return {
    rows: out,
    summary: {
      total: out.length,
      comparable: out.filter((r) => r.comparable).length,
      exceeding: exceeding.length,
      exceedingLitres:
        Math.round(exceeding.reduce((s, r) => s + r.quantityLitres, 0) * 1000) / 1000,
      excessCostEur:
        Math.round(
          exceeding.reduce((s, r) => s + (r.deltaPerLitre ?? 0) * r.quantityLitres, 0) * 100,
        ) / 100,
    },
  }
}
