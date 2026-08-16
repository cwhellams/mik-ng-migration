import { noExtraKeys } from './rowToContract.ts'
import { sql, type Kysely, type Transaction } from 'kysely'
import { db, type DbRow } from './connection.ts'
import type { DB } from './schema.d.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  MileageAllowance,
  MileageLeg,
  UpsertMileageAllowance,
  CreateMileageLeg,
} from '@mik/contracts/expenses-mileage'
import {
  ExpenseClaimStatus,
  type MileageReportFilters,
  type MileageReportRow,
} from '@mik/contracts/expenses'
import { decryptField } from '../lib/fieldEncryption.ts'

type Executor = Kysely<DB> | Transaction<DB>

// ─── helpers ─────────────────────────────────────────────────────────────────

// Typed from the generated schema rather than hand-declared. The hand-written shape
// spelled the timestamps `unknown`, which forced `new Date(String(createdAt))` to
// compile — and that round trip goes through Date#toString(), which has no millisecond
// field, so every createdAt/updatedAt came back truncated to the whole second. They are
// real Dates here (connection.ts only overrides the DATE/INT8/NUMERIC parsers, not
// TIMESTAMP), so toISOString() can be called on them directly. The rate columns are
// NUMERIC, which that same parser list already turns into numbers, so the defensive
// Number() wrappers the `unknown` shape needed are gone too.
function mapAllowance(row: DbRow<'accts.mileageAllowance'>): MileageAllowance {
  return noExtraKeys({
    ...row,
    effectiveRatePerKm: +(row.ratePerKm * (1 - row.discountPct / 100)).toFixed(4),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

/** Fully mask a HETU so no part of it is ever returned in API responses without an audited reveal */
export function maskHetu(plain: string): string {
  return '*'.repeat(plain.length)
}

// ─── Mileage allowance CRUD ───────────────────────────────────────────────────

export async function getMileageAllowances(): Promise<MileageAllowance[]> {
  const rows = await db
    .selectFrom('accts.mileageAllowance')
    .selectAll()
    .orderBy('taxYear', 'desc')
    .execute()
  return rows.map(mapAllowance)
}

export async function getMileageAllowanceByYear(
  taxYear: number,
): Promise<MileageAllowance | undefined> {
  const row = await db
    .selectFrom('accts.mileageAllowance')
    .selectAll()
    .where('taxYear', '=', taxYear)
    .executeTakeFirst()
  return row ? mapAllowance(row) : undefined
}

export async function getCurrentMileageAllowance(): Promise<MileageAllowance | undefined> {
  const year = new Date().getFullYear()
  // Try current year; fall back to most recent past year
  const row = await db
    .selectFrom('accts.mileageAllowance')
    .selectAll()
    .where('taxYear', '<=', year)
    .orderBy('taxYear', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ? mapAllowance(row) : undefined
}

export async function upsertMileageAllowance(
  data: UpsertMileageAllowance,
  user: JWTUser,
): Promise<MileageAllowance> {
  const now = new Date()
  const row = await db
    .insertInto('accts.mileageAllowance')
    .values({
      taxYear: data.taxYear,
      ratePerKm: data.ratePerKm,
      discountPct: data.discountPct,
      createdBy: user.memberId,
      updatedBy: user.memberId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc.column('taxYear').doUpdateSet({
        ratePerKm: data.ratePerKm,
        discountPct: data.discountPct,
        updatedBy: user.memberId,
        updatedAt: now,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapAllowance(row)
}

// ─── Mileage legs (one row per one-way journey within a claim) ───────────────

function mapMileageLegRow(row: {
  id: number
  claimId: string
  route: string | null
  startAddress: string | null
  startLat: unknown
  startLon: unknown
  endAddress: string | null
  endLat: unknown
  endLon: unknown
  waypoints: unknown
  journeyDate: unknown
  distanceKm: unknown
  directDistanceKm: unknown
  justificationNote: string | null
  boardApproved: boolean | null
  ratePerKm: unknown
}): MileageLeg {
  return {
    id: row.id,
    claimId: row.claimId,
    route: row.route ?? undefined,
    startAddress: row.startAddress ?? '',
    startLat: row.startLat != null ? Number(row.startLat) : undefined,
    startLon: row.startLon != null ? Number(row.startLon) : undefined,
    endAddress: row.endAddress ?? '',
    endLat: row.endLat != null ? Number(row.endLat) : undefined,
    endLon: row.endLon != null ? Number(row.endLon) : undefined,
    waypoints: (row.waypoints as MileageLeg['waypoints']) ?? [],
    journeyDate: String(row.journeyDate).substring(0, 10),
    distanceKm: Number(row.distanceKm),
    directDistanceKm: row.directDistanceKm != null ? Number(row.directDistanceKm) : undefined,
    justificationNote: row.justificationNote ?? undefined,
    boardApproved: row.boardApproved ?? false,
    ratePerKm: Number(row.ratePerKm),
  }
}

/** Replaces all legs for a claim (delete + bulk insert), mirroring insertLineItems in expense-queries.ts */
export async function replaceMileageLegs(
  executor: Executor,
  claimId: string,
  legs: CreateMileageLeg[],
  ratePerKm: number,
): Promise<void> {
  await executor.deleteFrom('accts.expenseMileageDetail').where('claimId', '=', claimId).execute()

  if (!legs.length) return

  const now = new Date()
  await executor
    .insertInto('accts.expenseMileageDetail')
    .values(
      legs.map((leg) => ({
        claimId: claimId,
        startAddress: leg.startAddress,
        startLat: leg.startLat ?? null,
        startLon: leg.startLon ?? null,
        endAddress: leg.endAddress,
        endLat: leg.endLat ?? null,
        endLon: leg.endLon ?? null,
        waypoints: JSON.stringify(leg.waypoints),
        journeyDate: leg.journeyDate,
        distanceKm: leg.distanceKm,
        directDistanceKm: leg.directDistanceKm ?? null,
        justificationNote: leg.justificationNote ?? null,
        boardApproved: leg.boardApproved,
        ratePerKm: ratePerKm,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .execute()
}

export async function getMileageLegsByClaimId(claimId: string): Promise<MileageLeg[]> {
  const rows = await db
    .selectFrom('accts.expenseMileageDetail')
    .selectAll()
    .where('claimId', '=', claimId)
    .orderBy('id')
    .execute()
  return rows.map(mapMileageLegRow)
}

// ─── Claim-level HETU reveal + audit (issue #1022) ───────────────────────────
// HETU is claim-level, not per-leg (issue #1021) — a member's SSN doesn't change
// between legs of the same reimbursement request. Every other read path (leg
// rows above, claim list/detail via expense-queries.ts) stays masked by
// default; this is the one intentional, audited exception.

/** Decrypted, unmasked HETU for a claim. Callers must be permission-gated and audit-log the access. */
export async function getClaimHetuFull(claimId: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('accts.expenseClaim')
    .select('hetuEncrypted')
    .where('id', '=', claimId)
    .executeTakeFirst()
  return row?.hetuEncrypted ? decryptField(row.hetuEncrypted) : undefined
}

export async function recordMileageHetuAccess(claimId: string, accessedBy: string): Promise<void> {
  await db
    .insertInto('accts.mileageHetuAccessAudit')
    .values({
      claimId: claimId,
      accessedBy: accessedBy,
      context: 'CLAIM_REVEAL',
    })
    .execute()
}

export type MileageHetuAccessLogEntry = {
  accessedAt: string
  accessedByName: string
}

/** Who viewed a claim's HETU and when — shown to the claim owner so they can see who accessed it. */
export async function getMileageHetuAccessLog(
  claimId: string,
): Promise<MileageHetuAccessLogEntry[]> {
  const rows = await db
    .selectFrom('accts.mileageHetuAccessAudit as audit')
    .leftJoin('member.register as member', 'member.memberId', 'audit.accessedBy')
    .where('audit.claimId', '=', claimId)
    .select([
      'audit.accessedAt',
      sql<string>`trim(concat(coalesce(member.first_name, ''), ' ', coalesce(member.last_name, '')))`.as(
        'accessedByName',
      ),
    ])
    .orderBy('audit.accessedAt', 'desc')
    .execute()

  return rows.map((row) => ({
    // Direct toISOString(), not `new Date(String(...))` — that round trip drops the
    // milliseconds, and an access audit is exactly where the ordering matters.
    accessedAt: row.accessedAt.toISOString(),
    accessedByName: row.accessedByName || 'Unknown',
  }))
}

// ─── Tulorekisteri mileage report (issue #1022) ──────────────────────────────
// Never selects hetu_encrypted — the report must not expose HETU, per the issue.
// Joins at leg grain (no aggregation), so a claim with multiple legs naturally
// emits one row per leg.

export async function getMileageReportRows(
  filters: MileageReportFilters,
): Promise<MileageReportRow[]> {
  const rows = await db
    .selectFrom('accts.expenseClaim as claim')
    .innerJoin('accts.expenseMileageDetail as detail', 'detail.claimId', 'claim.id')
    .innerJoin('accts.expenseCategory as category', 'category.id', 'claim.categoryId')
    .leftJoin('member.register as member', 'member.memberId', 'claim.memberId')
    .where('category.code', '=', 'mileage')
    .where('claim.status', '=', ExpenseClaimStatus.APPROVED)
    .where('detail.journeyDate', '>=', filters.startDate)
    .where('detail.journeyDate', '<=', filters.endDate)
    .select([
      'claim.id as claimId',
      'claim.memberId',
      'claim.approvedAt',
      'detail.route',
      'detail.startAddress',
      'detail.endAddress',
      'detail.journeyDate',
      'detail.distanceKm',
      'detail.ratePerKm',
      sql<number>`round((detail.distance_km * detail.rate_per_km)::numeric, 2)`.as('totalAmount'),
      sql<string>`trim(concat(coalesce(member.first_name, ''), ' ', coalesce(member.last_name, '')))`.as(
        'memberName',
      ),
    ])
    .orderBy('detail.journeyDate', 'asc')
    .execute()

  return rows.map((row) => ({
    claimId: row.claimId,
    memberId: row.memberId,
    memberName: row.memberName,
    journeyDate: String(row.journeyDate).substring(0, 10),
    route: row.route,
    startAddress: row.startAddress,
    endAddress: row.endAddress,
    distanceKm: Number(row.distanceKm),
    ratePerKm: Number(row.ratePerKm),
    totalAmount: Number(row.totalAmount),
    approvedAt: row.approvedAt?.toISOString() ?? null,
  }))
}

// ─── HETU retention purge (issue #1022) ──────────────────────────────────────
// Board decision: HETU is only needed to file with Tulorekisteri, which happens
// within days of approval — so it's purged 1 week after approval (GDPR minimisation).
// HETU now lives on expense_claim (issue #1021), not per-leg.

export async function purgeExpiredHetu(): Promise<number> {
  // Bounded to a 7-37 day window (instead of an open-ended "older than 7 days"
  // scan) so this daily job's cost stays flat as expense_claim grows over the
  // years.
  const eligibleClaims = await db
    .selectFrom('accts.expenseClaim as claim')
    .innerJoin('accts.expenseCategory as category', 'category.id', 'claim.categoryId')
    .select('claim.id')
    .where('category.code', '=', 'mileage')
    .where('claim.status', '=', ExpenseClaimStatus.APPROVED)
    .where('claim.hetuEncrypted', 'is not', null)
    .where('claim.approvedAt', '<', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .where('claim.approvedAt', '>=', new Date(Date.now() - 37 * 24 * 60 * 60 * 1000))
    .execute()

  const claimIds = eligibleClaims.map((row) => row.id)
  if (claimIds.length === 0) return 0

  const result = await db
    .updateTable('accts.expenseClaim')
    .set({ hetuEncrypted: null, updatedAt: new Date() })
    .where('hetuEncrypted', 'is not', null)
    .where('id', 'in', claimIds)
    .executeTakeFirst()

  return Number(result.numUpdatedRows)
}
