import { sql } from 'kysely'
import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  MileageAllowance,
  MileageDetail,
  UpsertMileageAllowance,
  CreateMileageDetail,
} from '../routes/expenses/mileageModels.ts'
import {
  ExpenseClaimStatus,
  type MileageReportFilters,
  type MileageReportRow,
} from '../routes/expenses/models.ts'
import { encryptField, decryptField } from '../lib/fieldEncryption.ts'

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

// ─── Mileage detail (per claim) ───────────────────────────────────────────────

/** Mask all but the last 4 chars of a HETU so it can safely be returned in API responses */
function maskHetu(plain: string): string {
  return plain.length > 4 ? '*'.repeat(plain.length - 4) + plain.slice(-4) : '****'
}

export async function upsertMileageDetail(
  claimId: string,
  data: CreateMileageDetail,
  ratePerKm: number,
): Promise<MileageDetail> {
  const now = new Date()
  const hetuEncrypted = data.hetu ? encryptField(data.hetu) : null
  const row = await db
    .insertInto('accts.expense_mileage_detail')
    .values({
      claim_id: claimId,
      route: data.route,
      journey_date: data.journeyDate,
      distance_km: data.distanceKm,
      board_approved: data.boardApproved,
      hetu_encrypted: hetuEncrypted,
      rate_per_km: ratePerKm,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column('claim_id').doUpdateSet({
        route: data.route,
        journey_date: data.journeyDate,
        distance_km: data.distanceKm,
        board_approved: data.boardApproved,
        hetu_encrypted: hetuEncrypted,
        rate_per_km: ratePerKm,
        updated_at: now,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow()

  return {
    id: row.id,
    claimId: row.claim_id,
    route: row.route,
    journeyDate: String(row.journey_date).substring(0, 10),
    distanceKm: Number(row.distance_km),
    boardApproved: row.board_approved ?? false,
    hetu: row.hetu_encrypted ? maskHetu(decryptField(row.hetu_encrypted)) : undefined,
    ratePerKm: Number(row.rate_per_km),
  }
}

export async function getMileageDetailByClaimId(
  claimId: string,
): Promise<MileageDetail | undefined> {
  const row = await db
    .selectFrom('accts.expense_mileage_detail')
    .selectAll()
    .where('claim_id', '=', claimId)
    .executeTakeFirst()
  if (!row) return undefined
  return {
    id: row.id,
    claimId: row.claim_id,
    route: row.route,
    journeyDate: String(row.journey_date).substring(0, 10),
    distanceKm: Number(row.distance_km),
    boardApproved: row.board_approved ?? false,
    hetu: row.hetu_encrypted ? maskHetu(decryptField(row.hetu_encrypted)) : undefined,
    ratePerKm: Number(row.rate_per_km),
  }
}

// ─── HETU reveal + audit (issue #1022) ───────────────────────────────────────
// Deliberately separate from getMileageDetailByClaimId above — every other read
// path stays masked by default; this is the one intentional, audited exception.

/** Decrypted, unmasked HETU for a claim. Callers must be permission-gated and audit-log the access. */
export async function getMileageDetailFullHetu(claimId: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('accts.expense_mileage_detail')
    .select('hetu_encrypted')
    .where('claim_id', '=', claimId)
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

// ─── Tulorekisteri mileage report (issue #1022) ──────────────────────────────
// Never selects hetu_encrypted — the report must not expose HETU, per the issue.

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
      'claim.iban',
      'claim.approved_at',
      'detail.route',
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
    distanceKm: Number(row.distance_km),
    ratePerKm: Number(row.rate_per_km),
    totalAmount: Number(row.total_amount),
    approvedAt: row.approved_at ? new Date(String(row.approved_at)).toISOString() : null,
    iban: row.iban,
  }))
}

// ─── HETU retention purge (issue #1022) ──────────────────────────────────────
// Board decision: HETU is only needed to file with Tulorekisteri, which happens
// within days of approval — so it's purged 1 week after approval (GDPR minimisation).

export async function purgeExpiredHetu(): Promise<number> {
  const eligibleClaims = await db
    .selectFrom('accts.expense_claim')
    .select('id')
    .where('status', '=', ExpenseClaimStatus.APPROVED)
    .where('approved_at', '<', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .execute()

  const claimIds = eligibleClaims.map((row) => row.id)
  if (claimIds.length === 0) return 0

  const result = await db
    .updateTable('accts.expense_mileage_detail')
    .set({ hetu_encrypted: null, updated_at: new Date() })
    .where('hetu_encrypted', 'is not', null)
    .where('claim_id', 'in', claimIds)
    .executeTakeFirst()

  return Number(result.numUpdatedRows)
}
