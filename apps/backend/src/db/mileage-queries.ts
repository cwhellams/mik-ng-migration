import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  MileageAllowance,
  MileageDetail,
  UpsertMileageAllowance,
  CreateMileageDetail,
} from '../routes/expenses/mileageModels.ts'
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
      passengers: data.passengers,
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
        passengers: data.passengers,
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
    passengers: row.passengers ?? [],
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
    passengers: row.passengers ?? [],
    boardApproved: row.board_approved ?? false,
    hetu: row.hetu_encrypted ? maskHetu(decryptField(row.hetu_encrypted)) : undefined,
    ratePerKm: Number(row.rate_per_km),
  }
}
