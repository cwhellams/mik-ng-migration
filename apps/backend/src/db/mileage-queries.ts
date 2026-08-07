import { sql, type Kysely, type Transaction } from 'kysely'
import { db } from './connection.ts'
import type { DB } from './schema.js'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  MileageAllowance,
  MileageLeg,
  UpsertMileageAllowance,
  CreateMileageLeg,
} from '../routes/expenses/mileageModels.ts'
import {
  ExpenseClaimStatus,
  type MileageReportFilters,
  type MileageReportRow,
} from '../routes/expenses/models.ts'
import { decryptField } from '../lib/fieldEncryption.ts'

type Executor = Kysely<DB> | Transaction<DB>

// ─── helpers ─────────────────────────────────────────────────────────────────

function mapAllowance(row: {
  id: number
  tax_year: number
  rate_per_km: unknown
  discount_pct: unknown
  created_at: unknown
  created_by: string
  updated_at: unknown
  updated_by: string
}): MileageAllowance {
  const rate = Number(row.rate_per_km)
  const discount = Number(row.discount_pct)
  return {
    id: row.id,
    taxYear: row.tax_year,
    ratePerKm: rate,
    discountPct: discount,
    effectiveRatePerKm: +(rate * (1 - discount / 100)).toFixed(4),
    createdAt: new Date(String(row.created_at)).toISOString(),
    createdBy: row.created_by,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    updatedBy: row.updated_by,
  }
}

/** Fully mask a HETU so no part of it is ever returned in API responses without an audited reveal */
export function maskHetu(plain: string): string {
  return '*'.repeat(plain.length)
}

// ─── Mileage allowance CRUD ───────────────────────────────────────────────────

export async function getMileageAllowances(): Promise<MileageAllowance[]> {
  const rows = await db
    .selectFrom('accts.mileage_allowance')
    .selectAll()
    .orderBy('tax_year', 'desc')
    .execute()
  return rows.map(mapAllowance)
}

export async function getMileageAllowanceByYear(
  taxYear: number,
): Promise<MileageAllowance | undefined> {
  const row = await db
    .selectFrom('accts.mileage_allowance')
    .selectAll()
    .where('tax_year', '=', taxYear)
    .executeTakeFirst()
  return row ? mapAllowance(row) : undefined
}

export async function getCurrentMileageAllowance(): Promise<MileageAllowance | undefined> {
  const year = new Date().getFullYear()
  // Try current year; fall back to most recent past year
  const row = await db
    .selectFrom('accts.mileage_allowance')
    .selectAll()
    .where('tax_year', '<=', year)
    .orderBy('tax_year', 'desc')
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
    .insertInto('accts.mileage_allowance')
    .values({
      tax_year: data.taxYear,
      rate_per_km: data.ratePerKm,
      discount_pct: data.discountPct,
      created_by: user.memberId,
      updated_by: user.memberId,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column('tax_year').doUpdateSet({
        rate_per_km: data.ratePerKm,
        discount_pct: data.discountPct,
        updated_by: user.memberId,
        updated_at: now,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapAllowance(row)
}

// ─── Mileage legs (one row per one-way journey within a claim) ───────────────

function mapMileageLegRow(row: {
  id: number
  claim_id: string
  route: string | null
  start_address: string | null
  start_lat: unknown
  start_lon: unknown
  end_address: string | null
  end_lat: unknown
  end_lon: unknown
  waypoints: unknown
  journey_date: unknown
  distance_km: unknown
  direct_distance_km: unknown
  justification_note: string | null
  board_approved: boolean | null
  rate_per_km: unknown
}): MileageLeg {
  return {
    id: row.id,
    claimId: row.claim_id,
    route: row.route ?? undefined,
    startAddress: row.start_address ?? '',
    startLat: row.start_lat != null ? Number(row.start_lat) : undefined,
    startLon: row.start_lon != null ? Number(row.start_lon) : undefined,
    endAddress: row.end_address ?? '',
    endLat: row.end_lat != null ? Number(row.end_lat) : undefined,
    endLon: row.end_lon != null ? Number(row.end_lon) : undefined,
    waypoints: (row.waypoints as MileageLeg['waypoints']) ?? [],
    journeyDate: String(row.journey_date).substring(0, 10),
    distanceKm: Number(row.distance_km),
    directDistanceKm: row.direct_distance_km != null ? Number(row.direct_distance_km) : undefined,
    justificationNote: row.justification_note ?? undefined,
    boardApproved: row.board_approved ?? false,
    ratePerKm: Number(row.rate_per_km),
  }
}

/** Replaces all legs for a claim (delete + bulk insert), mirroring insertLineItems in expense-queries.ts */
export async function replaceMileageLegs(
  executor: Executor,
  claimId: string,
  legs: CreateMileageLeg[],
  ratePerKm: number,
): Promise<void> {
  await executor
    .deleteFrom('accts.expense_mileage_detail')
    .where('claim_id', '=', claimId)
    .execute()

  if (!legs.length) return

  const now = new Date()
  await executor
    .insertInto('accts.expense_mileage_detail')
    .values(
      legs.map((leg) => ({
        claim_id: claimId,
        start_address: leg.startAddress,
        start_lat: leg.startLat ?? null,
        start_lon: leg.startLon ?? null,
        end_address: leg.endAddress,
        end_lat: leg.endLat ?? null,
        end_lon: leg.endLon ?? null,
        waypoints: JSON.stringify(leg.waypoints),
        journey_date: leg.journeyDate,
        distance_km: leg.distanceKm,
        direct_distance_km: leg.directDistanceKm ?? null,
        justification_note: leg.justificationNote ?? null,
        board_approved: leg.boardApproved,
        rate_per_km: ratePerKm,
        created_at: now,
        updated_at: now,
      })),
    )
    .execute()
}

export async function getMileageLegsByClaimId(claimId: string): Promise<MileageLeg[]> {
  const rows = await db
    .selectFrom('accts.expense_mileage_detail')
    .selectAll()
    .where('claim_id', '=', claimId)
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
    .selectFrom('accts.expense_claim')
    .select('hetu_encrypted')
    .where('id', '=', claimId)
    .executeTakeFirst()
  return row?.hetu_encrypted ? decryptField(row.hetu_encrypted) : undefined
}

export async function recordMileageHetuAccess(claimId: string, accessedBy: string): Promise<void> {
  await db
    .insertInto('accts.mileage_hetu_access_audit')
    .values({
      claim_id: claimId,
      accessed_by: accessedBy,
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
    .selectFrom('accts.mileage_hetu_access_audit as audit')
    .leftJoin('member.register as member', 'member.member_id', 'audit.accessed_by')
    .where('audit.claim_id', '=', claimId)
    .select([
      'audit.accessed_at',
      sql<string>`trim(concat(coalesce(member.first_name, ''), ' ', coalesce(member.last_name, '')))`.as(
        'accessed_by_name',
      ),
    ])
    .orderBy('audit.accessed_at', 'desc')
    .execute()

  return rows.map((row) => ({
    accessedAt: new Date(String(row.accessed_at)).toISOString(),
    accessedByName: row.accessed_by_name || 'Unknown',
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
    .selectFrom('accts.expense_claim as claim')
    .innerJoin('accts.expense_mileage_detail as detail', 'detail.claim_id', 'claim.id')
    .innerJoin('accts.expense_category as category', 'category.id', 'claim.category_id')
    .leftJoin('member.register as member', 'member.member_id', 'claim.member_id')
    .where('category.code', '=', 'mileage')
    .where('claim.status', '=', ExpenseClaimStatus.APPROVED)
    .where('detail.journey_date', '>=', filters.startDate)
    .where('detail.journey_date', '<=', filters.endDate)
    .select([
      'claim.id as claim_id',
      'claim.member_id',
      'claim.approved_at',
      'detail.route',
      'detail.start_address',
      'detail.end_address',
      'detail.journey_date',
      'detail.distance_km',
      'detail.rate_per_km',
      sql<number>`round((detail.distance_km * detail.rate_per_km)::numeric, 2)`.as('total_amount'),
      sql<string>`trim(concat(coalesce(member.first_name, ''), ' ', coalesce(member.last_name, '')))`.as(
        'member_name',
      ),
    ])
    .orderBy('detail.journey_date', 'asc')
    .execute()

  return rows.map((row) => ({
    claimId: row.claim_id,
    memberId: row.member_id,
    memberName: row.member_name,
    journeyDate: String(row.journey_date).substring(0, 10),
    route: row.route,
    startAddress: row.start_address,
    endAddress: row.end_address,
    distanceKm: Number(row.distance_km),
    ratePerKm: Number(row.rate_per_km),
    totalAmount: Number(row.total_amount),
    approvedAt: row.approved_at ? new Date(String(row.approved_at)).toISOString() : null,
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
    .selectFrom('accts.expense_claim as claim')
    .innerJoin('accts.expense_category as category', 'category.id', 'claim.category_id')
    .select('claim.id')
    .where('category.code', '=', 'mileage')
    .where('claim.status', '=', ExpenseClaimStatus.APPROVED)
    .where('claim.hetu_encrypted', 'is not', null)
    .where('claim.approved_at', '<', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .where('claim.approved_at', '>=', new Date(Date.now() - 37 * 24 * 60 * 60 * 1000))
    .execute()

  const claimIds = eligibleClaims.map((row) => row.id)
  if (claimIds.length === 0) return 0

  const result = await db
    .updateTable('accts.expense_claim')
    .set({ hetu_encrypted: null, updated_at: new Date() })
    .where('hetu_encrypted', 'is not', null)
    .where('id', 'in', claimIds)
    .executeTakeFirst()

  return Number(result.numUpdatedRows)
}
