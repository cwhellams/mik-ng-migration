import { sql, type Kysely, type Transaction } from 'kysely'

import { db } from './connection.ts'
import type { DB } from './schema.js'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  ExpenseClaimStatus,
  ExpenseMessageType,
  type CreateExpenseClaim,
  type ExpenseCategory,
  type ExpenseClaim,
  type ExpenseClaimEditAuditEntry,
  type ExpenseClaimFilters,
  type ExpenseClaimListResponse,
  type ExpenseClaimMessage,
  type ExpenseLineItem,
  type FuelType,
  type TreasurerEditExpenseClaim,
  type UpdateExpenseClaim,
} from '../routes/expenses/models.ts'
import {
  getCurrentMileageAllowance,
  getMileageLegsByClaimId,
  replaceMileageLegs,
  maskHetu,
} from './mileage-queries.ts'
import { encryptField, decryptField } from '../lib/fieldEncryption.ts'
import { getEffectiveLocalFuelPrice } from './local-fuel-price-queries.ts'
import { computeFuelReimbursement } from '../services/fuelReimbursement.ts'
import { getExpenseAttachments } from './expense-attachment-queries.ts'

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date(String(value)).toISOString()
}

const toNullableIsoString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }

  return toIsoString(value)
}

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  return Number(value)
}

type Executor = Kysely<DB> | Transaction<DB>

type ClaimRow = {
  id: string
  member_id: string
  category_id: number
  category_code: string | null
  aircraft_id: string | null
  flight_log_id: unknown
  title: string
  description: string | null
  status: string
  fuel_litres: unknown
  fuel_type: string | null
  refuel_outside_finland: boolean
  expense_date: string | null
  iban: string | null
  iban_account_name: string | null
  ccy: string
  fx_rate: unknown
  receipt_storage_key: string | null
  receipt_file_name: string | null
  receipt_file_size: number | null
  receipt_mime_type: string | null
  receipt_uploaded_at: unknown
  submitted_at: unknown
  approved_at: unknown
  approved_by: string | null
  rejected_at: unknown
  rejected_by: string | null
  rejection_reason: string | null
  simplbooks_purchase_id: unknown
  hetu_encrypted: string | null
  created_at: unknown
  updated_at: unknown
  member_name: string | null
  member_email: string | null
  total_amount: unknown
}

const hasOwn = <T extends object>(obj: T, key: keyof any): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)

// Finnish aerodromes all use the EFxx ICAO prefix (issue #1020) — anything else on a
// fuel line item counts as fueling abroad, replacing the old claim-level checkbox.
const isAirportOutsideFinland = (icao: string | null | undefined): boolean =>
  !!icao && !icao.toUpperCase().startsWith('EF')

const computeRefuelOutsideFinland = (lineItems: ExpenseLineItem[]): boolean =>
  lineItems.some((item) => isAirportOutsideFinland(item.airport))

const mapCategory = (row: {
  id: number
  code: string
  label_en: string
  label_fi: string
  label_sv: string
  requires_aircraft: boolean
  requires_flight: boolean
  active: boolean
}): ExpenseCategory => ({
  id: row.id,
  code: row.code,
  labelEn: row.label_en,
  labelFi: row.label_fi,
  labelSv: row.label_sv,
  requiresAircraft: row.requires_aircraft,
  requiresFlight: row.requires_flight,
  active: row.active,
})

const mapLineItem = (row: {
  id: number
  item_id: number | null
  item_code?: string | null
  description: string
  quantity: unknown
  unit: string
  unit_price: unknown
  total_cost?: unknown
  sort_order: number
  cost_centre_code?: string | null
  fuel_type?: string | null
  fuel_date?: string | null
  airport?: string | null
  paid_with_club_card?: boolean | null
}): ExpenseLineItem => ({
  id: row.id,
  itemId: row.item_id,
  itemCode: row.item_code ?? undefined,
  description: row.description,
  date: row.fuel_date ?? undefined,
  quantity: Number(row.quantity),
  unit: row.unit as ExpenseLineItem['unit'],
  unitPrice: Number(row.unit_price),
  totalCost: toNullableNumber(row.total_cost),
  sortOrder: row.sort_order,
  costCentreCode: row.cost_centre_code ?? undefined,
  fuelType: (row.fuel_type as ExpenseLineItem['fuelType']) ?? undefined,
  airport: row.airport ?? undefined,
  paidWithClubCard: row.paid_with_club_card ?? false,
})

const mapMessage = (row: {
  id: number
  claim_id: string
  sender_id: string
  message_type: string
  body: string
  sent_at: unknown
}): ExpenseClaimMessage => ({
  id: row.id,
  claimId: row.claim_id,
  senderId: row.sender_id,
  messageType: row.message_type as ExpenseMessageType,
  body: row.body,
  sentAt: toIsoString(row.sent_at),
})

const mapClaim = (
  row: ClaimRow,
  details?: Pick<
    ExpenseClaim,
    'lineItems' | 'messages' | 'mileageLegs' | 'fuelReimbursementSummary' | 'attachments'
  >,
): ExpenseClaim => ({
  id: row.id,
  memberId: row.member_id,
  categoryId: row.category_id,
  categoryCode: row.category_code ?? undefined,
  aircraftId: row.aircraft_id,
  flightLogId: (row.flight_log_id as string | null) ?? undefined,
  title: row.title,
  description: row.description,
  status: row.status as ExpenseClaimStatus,
  fuelLitres: toNullableNumber(row.fuel_litres),
  fuelType: row.fuel_type,
  refuelOutsideFinland: row.refuel_outside_finland,
  expenseDate: row.expense_date ?? undefined,
  iban: row.iban,
  ibanAccountName: row.iban_account_name,
  currency: row.ccy ?? 'EUR',
  fxRate: toNullableNumber(row.fx_rate),
  submittedAt: toNullableIsoString(row.submitted_at),
  approvedAt: toNullableIsoString(row.approved_at),
  approvedBy: row.approved_by,
  rejectedAt: toNullableIsoString(row.rejected_at),
  rejectedBy: row.rejected_by,
  rejectionReason: row.rejection_reason,
  simplbooksPurchaseId: toNullableNumber(row.simplbooks_purchase_id),
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  memberName: row.member_name ?? undefined,
  memberEmail: row.member_email ?? undefined,
  hetu: row.hetu_encrypted ? maskHetu(decryptField(row.hetu_encrypted)) : undefined,
  totalAmount: toNullableNumber(row.total_amount) ?? 0,
  receipt: row.receipt_storage_key
    ? {
        storageKey: row.receipt_storage_key,
        fileName: row.receipt_file_name ?? '',
        fileSize: row.receipt_file_size ?? 0,
        mimeType: row.receipt_mime_type ?? '',
        uploadedAt: row.receipt_uploaded_at
          ? toIsoString(row.receipt_uploaded_at)
          : new Date().toISOString(),
      }
    : undefined,
  ...details,
})

const claimSelect = (executor: Executor) =>
  executor
    .selectFrom('accts.expense_claim as claim')
    .innerJoin('accts.expense_category as category', 'category.id', 'claim.category_id')
    .leftJoin('member.register as member', 'member.member_id', 'claim.member_id')
    .select([
      'claim.id',
      'claim.member_id',
      'claim.category_id',
      'category.code as category_code',
      'claim.aircraft_id',
      'claim.flight_log_id',
      'claim.title',
      'claim.description',
      'claim.status',
      'claim.fuel_litres',
      'claim.fuel_type',
      'claim.refuel_outside_finland',
      'claim.expense_date',
      'claim.iban',
      'claim.iban_account_name',
      'claim.ccy',
      'claim.fx_rate',
      'claim.receipt_storage_key',
      'claim.receipt_file_name',
      'claim.receipt_file_size',
      'claim.receipt_mime_type',
      'claim.receipt_uploaded_at',
      'claim.submitted_at',
      'claim.approved_at',
      'claim.approved_by',
      'claim.rejected_at',
      'claim.rejected_by',
      'claim.rejection_reason',
      'claim.simplbooks_purchase_id',
      'claim.hetu_encrypted',
      'claim.created_at',
      'claim.updated_at',
      'member.email as member_email',
      sql<string>`trim(concat(coalesce(member.first_name, ''), ' ', coalesce(member.last_name, '')))`.as(
        'member_name',
      ),
      sql<number>`round(coalesce((
        select sum(coalesce(li.total_cost, li.quantity * li.unit_price)) * coalesce(claim.fx_rate, 1.0)
        from accts.expense_claim_line_item li
        where li.claim_id = claim.id
      ), 0)::numeric, 2)`.as('total_amount'),
    ])

async function insertLineItems(
  executor: Executor,
  claimId: string,
  items: ExpenseLineItem[],
): Promise<void> {
  if (!items.length) {
    return
  }

  await executor
    .insertInto('accts.expense_claim_line_item')
    .values(
      items.map((item) => ({
        claim_id: claimId,
        item_id: item.itemId ?? null,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        total_cost: item.totalCost ?? null,
        sort_order: item.sortOrder,
        cost_centre_code: item.costCentreCode ?? null,
        fuel_type: item.fuelType ?? null,
        fuel_date: item.date ?? null,
        airport: item.airport ?? null,
        paid_with_club_card: item.paidWithClubCard ?? false,
      })),
    )
    .execute()
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const rows = await db
    .selectFrom('accts.expense_category')
    .selectAll()
    .where('active', '=', true)
    .orderBy('id')
    .execute()

  return rows.map(mapCategory)
}

export async function getExpenseClaimsByMember(
  memberId: string,
  filters: ExpenseClaimFilters,
): Promise<ExpenseClaimListResponse> {
  const offset = (filters.page - 1) * filters.pageSize

  const countRow = await db
    .selectFrom('accts.expense_claim')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('member_id', '=', memberId)
    .$if(!!filters.status, (qb) => qb.where('status', '=', filters.status!))
    .executeTakeFirstOrThrow()

  const rows = await claimSelect(db)
    .where('claim.member_id', '=', memberId)
    .$if(!!filters.status, (qb) => qb.where('claim.status', '=', filters.status!))
    .orderBy('claim.created_at', 'desc')
    .limit(filters.pageSize)
    .offset(offset)
    .execute()

  return {
    claims: rows.map((row) => mapClaim(row as ClaimRow)),
    total: Number(countRow.count),
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export async function getPendingExpenseClaimsCount(): Promise<number> {
  const row = await db
    .selectFrom('accts.expense_claim')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('status', 'in', [ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO])
    .executeTakeFirstOrThrow()

  return Number(row.count)
}

export async function getAllExpenseClaims(
  filters: ExpenseClaimFilters,
): Promise<ExpenseClaimListResponse> {
  const offset = (filters.page - 1) * filters.pageSize

  const countRow = await db
    .selectFrom('accts.expense_claim')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .$if(!!filters.status, (qb) => qb.where('status', '=', filters.status!))
    .executeTakeFirstOrThrow()

  const rows = await claimSelect(db)
    .$if(!!filters.status, (qb) => qb.where('claim.status', '=', filters.status!))
    .orderBy('claim.created_at', 'desc')
    .limit(filters.pageSize)
    .offset(offset)
    .execute()

  return {
    claims: rows.map((row) => mapClaim(row as ClaimRow)),
    total: Number(countRow.count),
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export async function getExpenseClaimById(id: string): Promise<ExpenseClaim | undefined> {
  const claimRow = await claimSelect(db).where('claim.id', '=', id).executeTakeFirst()

  if (!claimRow) {
    return undefined
  }

  const [lineItems, messages, mileageLegs, attachments] = await Promise.all([
    db
      .selectFrom('accts.expense_claim_line_item as li')
      .leftJoin('accts.items as item', 'item.id', 'li.item_id')
      .select([
        'li.id',
        'li.item_id',
        'item.code as item_code',
        'li.description',
        'li.quantity',
        'li.unit',
        'li.unit_price',
        'li.total_cost',
        'li.sort_order',
        'li.cost_centre_code',
        'li.fuel_type',
        'li.fuel_date',
        'li.airport',
        'li.paid_with_club_card',
      ])
      .where('li.claim_id', '=', id)
      .orderBy('li.sort_order')
      .orderBy('li.id')
      .execute(),
    db
      .selectFrom('accts.expense_claim_message')
      .selectAll()
      .where('claim_id', '=', id)
      .orderBy('sent_at')
      .execute(),
    getMileageLegsByClaimId(id),
    getExpenseAttachments(id),
  ])

  const mappedLineItems = lineItems.map(mapLineItem)
  const fuelReimbursementSummary =
    claimRow.category_code === 'fuel' && mappedLineItems.length
      ? await computeFuelReimbursementSummary(mappedLineItems, claimRow as ClaimRow)
      : undefined

  return mapClaim(claimRow as ClaimRow, {
    lineItems: mappedLineItems,
    messages: messages.map(mapMessage),
    mileageLegs,
    fuelReimbursementSummary,
    attachments,
  })
}

/**
 * Trip-wide start date used to pick the effective local fuel price (issue #955,
 * clarified: the price at the START of the trip applies to the whole claim, not each
 * line item's own date) — the earliest line item date, falling back to the claim's own
 * expense date for legacy line items that predate the per-line date field.
 */
async function computeFuelReimbursementSummary(
  lineItems: ExpenseLineItem[],
  claimRow: ClaimRow,
): Promise<ExpenseClaim['fuelReimbursementSummary']> {
  const tripStartDate =
    lineItems
      .map((item) => item.date)
      .filter((date): date is string => !!date)
      .sort()[0] ??
    claimRow.expense_date ??
    undefined
  const fuelType = lineItems.find((item) => item.fuelType)?.fuelType as FuelType | undefined

  const localPrice =
    fuelType && tripStartDate
      ? await getEffectiveLocalFuelPrice(fuelType, tripStartDate)
      : undefined

  return computeFuelReimbursement(
    lineItems.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalCost: item.totalCost,
      paidWithClubCard: item.paidWithClubCard ?? false,
    })),
    localPrice?.priceEurPerLitre ?? null,
  )
}

export async function createExpenseClaim(
  data: CreateExpenseClaim,
  user: JWTUser,
): Promise<ExpenseClaim> {
  // Read the current rate before opening the transaction — a plain read, no need to
  // hold it open for the duration of the write.
  const effectiveRate = data.mileageLegs?.length
    ? ((await getCurrentMileageAllowance())?.effectiveRatePerKm ?? 0.275) // fallback: 50% of 0.55
    : 0

  const result = await db.transaction().execute(async (txn) => {
    const inserted = await txn
      .insertInto('accts.expense_claim')
      .values({
        member_id: user.memberId,
        category_id: data.categoryId,
        aircraft_id: data.aircraftId ?? null,
        flight_log_id: data.flightLogId ?? null,
        title: data.title,
        description: data.description ?? null,
        status: ExpenseClaimStatus.DRAFT,
        fuel_litres: data.fuelLitres ?? null,
        fuel_type: data.fuelType ?? null,
        refuel_outside_finland: computeRefuelOutsideFinland(data.lineItems),
        expense_date: data.expenseDate,
        iban: data.iban,
        iban_account_name: data.ibanAccountName,
        ccy: data.currency ?? 'EUR',
        fx_rate: data.fxRate ?? null,
        hetu_encrypted: data.hetu ? encryptField(data.hetu) : null,
        updated_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await insertLineItems(txn, inserted.id, data.lineItems)
    if (data.mileageLegs) {
      await replaceMileageLegs(txn, inserted.id, data.mileageLegs, effectiveRate)
    }
    return inserted.id
  })

  const claim = await getExpenseClaimById(result)
  if (!claim) {
    throw new Error('Failed to load created expense claim')
  }

  return claim
}

export async function updateExpenseClaim(
  id: string,
  data: UpdateExpenseClaim,
  user: JWTUser,
): Promise<ExpenseClaim | undefined> {
  const effectiveRate = data.mileageLegs?.length
    ? ((await getCurrentMileageAllowance())?.effectiveRatePerKm ?? 0.275)
    : 0

  await db.transaction().execute(async (txn) => {
    const patch: Record<string, unknown> = {
      updated_at: new Date(),
      // Revert to DRAFT whenever the member saves changes, so they must explicitly re-submit.
      // Safe because only DRAFT and PENDING_INFO claims reach this path (enforced by the API route).
      status: ExpenseClaimStatus.DRAFT,
    }

    if (hasOwn(data, 'categoryId')) patch.category_id = data.categoryId
    if (hasOwn(data, 'aircraftId')) patch.aircraft_id = data.aircraftId ?? null
    if (hasOwn(data, 'flightLogId')) patch.flight_log_id = data.flightLogId ?? null
    if (hasOwn(data, 'title')) patch.title = data.title
    if (hasOwn(data, 'description')) patch.description = data.description ?? null
    if (hasOwn(data, 'fuelLitres')) patch.fuel_litres = data.fuelLitres ?? null
    if (hasOwn(data, 'fuelType')) patch.fuel_type = data.fuelType ?? null
    if (hasOwn(data, 'expenseDate')) patch.expense_date = data.expenseDate ?? null
    if (hasOwn(data, 'iban')) patch.iban = data.iban ?? null
    if (hasOwn(data, 'ibanAccountName')) patch.iban_account_name = data.ibanAccountName ?? null
    if (hasOwn(data, 'currency')) patch.ccy = data.currency ?? null
    if (hasOwn(data, 'fxRate')) patch.fx_rate = data.fxRate ?? null
    // Only overwrite the stored HETU when a new one was actually submitted — edit flows
    // that don't re-collect it (it's never sent back to the client unmasked) must leave
    // the existing encrypted value untouched instead of nulling it out.
    if (data.hetu) patch.hetu_encrypted = encryptField(data.hetu)
    if (data.lineItems) patch.refuel_outside_finland = computeRefuelOutsideFinland(data.lineItems)

    await txn.updateTable('accts.expense_claim').set(patch).where('id', '=', id).execute()

    if (data.lineItems) {
      await txn.deleteFrom('accts.expense_claim_line_item').where('claim_id', '=', id).execute()
      await insertLineItems(txn, id, data.lineItems)
    }

    if (data.mileageLegs) {
      await replaceMileageLegs(txn, id, data.mileageLegs, effectiveRate)
    }

    await txn
      .insertInto('accts.expense_claim_message')
      .values({
        claim_id: id,
        sender_id: user.memberId,
        message_type: ExpenseMessageType.SYSTEM,
        body: 'Claim updated by member.',
      })
      .execute()
  })

  return getExpenseClaimById(id)
}

export async function deleteExpenseClaim(id: string): Promise<boolean> {
  const result = await db
    .deleteFrom('accts.expense_claim')
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numDeletedRows > BigInt(0)
}

export async function retractExpenseClaim(
  id: string,
  userId: string,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      status: ExpenseClaimStatus.DRAFT,
      submitted_at: null,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .where('member_id', '=', userId)
    .where('status', '=', ExpenseClaimStatus.SUBMITTED)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function submitExpenseClaim(
  id: string,
  user: JWTUser,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      status: ExpenseClaimStatus.SUBMITTED,
      submitted_at: new Date(),
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .where('member_id', '=', user.memberId)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function approveExpenseClaim(
  id: string,
  approverId: string,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      status: ExpenseClaimStatus.APPROVED,
      approved_at: new Date(),
      approved_by: approverId,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function rejectExpenseClaim(
  id: string,
  rejectorId: string,
  reason: string,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      status: ExpenseClaimStatus.REJECTED,
      rejected_at: new Date(),
      rejected_by: rejectorId,
      rejection_reason: reason,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function overrideFuelPrice(
  id: string,
  efnuPrice: number,
  executor: Executor = db,
): Promise<boolean> {
  await executor
    .updateTable('accts.expense_claim_line_item')
    .set({
      unit_price: sql<number>`LEAST(unit_price, ${efnuPrice})`,
      // Only recompute the persisted total for line items the cap actually affects,
      // otherwise an already-exact total gets reconstructed from unit_price and drifts.
      total_cost: sql<number>`CASE WHEN unit_price > ${efnuPrice} THEN quantity * ${efnuPrice} ELSE total_cost END`,
    })
    .where('claim_id', '=', id)
    .execute()

  const note = `EFNU fuel price cap of ${efnuPrice.toFixed(2)} EUR/L has been applied to this claim.`
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      description: sql<string>`coalesce(description, '') || ${'\n\n' + note}`,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function setExpenseClaimToDraft(
  id: string,
  adminId: string,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      status: ExpenseClaimStatus.DRAFT,
      submitted_at: null,
      approved_at: null,
      approved_by: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  await executor
    .insertInto('accts.expense_claim_message')
    .values({
      claim_id: id,
      sender_id: adminId,
      message_type: ExpenseMessageType.SYSTEM,
      body: 'Claim returned to draft by administrator.',
    })
    .execute()

  return result.numUpdatedRows > BigInt(0)
}

export async function markExpenseClaimPendingInfo(
  id: string,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      status: ExpenseClaimStatus.PENDING_INFO,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function setExpenseReceipt(
  claimId: string,
  receipt: { storageKey: string; fileName: string; fileSize: number; mimeType: string } | null,
  executor: Executor = db,
): Promise<void> {
  await executor
    .updateTable('accts.expense_claim')
    .set(
      receipt
        ? {
            receipt_storage_key: receipt.storageKey,
            receipt_file_name: receipt.fileName,
            receipt_file_size: receipt.fileSize,
            receipt_mime_type: receipt.mimeType,
            receipt_uploaded_at: new Date(),
            updated_at: new Date(),
          }
        : {
            receipt_storage_key: null,
            receipt_file_name: null,
            receipt_file_size: null,
            receipt_mime_type: null,
            receipt_uploaded_at: null,
            updated_at: new Date(),
          },
    )
    .where('id', '=', claimId)
    .execute()
}

export async function addExpenseMessage(
  claimId: string,
  senderId: string,
  type: ExpenseMessageType,
  body: string,
  executor: Executor = db,
): Promise<ExpenseClaimMessage> {
  const inserted = await executor
    .insertInto('accts.expense_claim_message')
    .values({
      claim_id: claimId,
      sender_id: senderId,
      message_type: type,
      body,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapMessage(inserted)
}

export async function updateExpenseSimplbooksId(
  claimId: string,
  purchaseId: number,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expense_claim')
    .set({
      simplbooks_purchase_id: purchaseId,
      status: ExpenseClaimStatus.SYNCED,
      updated_at: new Date(),
    })
    .where('id', '=', claimId)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

// ─── Treasurer edit (issue #1028) ────────────────────────────────────────────
// Deliberately not the same code path as updateExpenseClaim: this must never touch
// status (the whole point is the claim stays exactly where it is in the approval
// queue) and must log a field-level diff for every changed value, since this mutates
// a claim the member no longer controls.

const LINE_ITEM_FIELD_COLUMNS: Record<string, string> = {
  itemId: 'item_id',
  description: 'description',
  date: 'fuel_date',
  quantity: 'quantity',
  unit: 'unit',
  unitPrice: 'unit_price',
  totalCost: 'total_cost',
  costCentreCode: 'cost_centre_code',
  airport: 'airport',
  paidWithClubCard: 'paid_with_club_card',
}

type EditAuditRow = {
  claim_id: string
  line_item_id: number | null
  field_name: string
  old_value: string | null
  new_value: string | null
  edited_by: string
}

const toAuditString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value)

export async function treasurerEditExpenseClaim(
  claimId: string,
  patch: TreasurerEditExpenseClaim,
  treasurer: JWTUser,
): Promise<{ claim: ExpenseClaim; changedFieldCount: number }> {
  const existing = await getExpenseClaimById(claimId)
  if (!existing) {
    throw new Error('Expense claim not found')
  }

  const auditRows: EditAuditRow[] = []

  await db.transaction().execute(async (txn) => {
    const claimPatch: Record<string, unknown> = {}

    const diffClaimField = (field: 'title' | 'aircraftId' | 'expenseDate', column: string) => {
      if (!hasOwn(patch, field)) return
      const newValue = patch[field] ?? null
      const oldValue = (existing[field] ?? null) as unknown
      if (newValue === oldValue) return
      auditRows.push({
        claim_id: claimId,
        line_item_id: null,
        field_name: field,
        old_value: toAuditString(oldValue),
        new_value: toAuditString(newValue),
        edited_by: treasurer.memberId,
      })
      claimPatch[column] = newValue
    }

    diffClaimField('title', 'title')
    diffClaimField('aircraftId', 'aircraft_id')
    diffClaimField('expenseDate', 'expense_date')

    if (Object.keys(claimPatch).length > 0) {
      claimPatch.updated_at = new Date()
      await txn
        .updateTable('accts.expense_claim')
        .set(claimPatch)
        .where('id', '=', claimId)
        .execute()
    }

    for (const lineItemPatch of patch.lineItems ?? []) {
      const existingLineItem = existing.lineItems?.find((li) => li.id === lineItemPatch.id)
      if (!existingLineItem) continue

      const liPatch: Record<string, unknown> = {}
      for (const [field, column] of Object.entries(LINE_ITEM_FIELD_COLUMNS)) {
        if (!hasOwn(lineItemPatch, field)) continue
        const newValue = (lineItemPatch as Record<string, unknown>)[field] ?? null
        const oldValue = (existingLineItem as Record<string, unknown>)[field] ?? null
        if (newValue === oldValue) continue
        auditRows.push({
          claim_id: claimId,
          line_item_id: lineItemPatch.id,
          field_name: field,
          old_value: toAuditString(oldValue),
          new_value: toAuditString(newValue),
          edited_by: treasurer.memberId,
        })
        liPatch[column] = newValue
      }

      // Correcting quantity/unitPrice invalidates any previously-stored explicit
      // total_cost (see applyTotalCost in expenseShared.tsx, which lets a member type a
      // known total and back-derives unitPrice from it) — clear it so the claim total
      // (coalesce(total_cost, quantity * unit_price)) recomputes from the corrected
      // values instead of silently keeping the stale total. Skipped when the patch sends
      // its own totalCost: the treasurer's edit form derives unitPrice from the total the
      // treasurer typed, so that total is the authoritative figure, not a stale leftover
      // (issue #1024 — reconstructing it from a rounded unit_price drifts).
      if (
        !hasOwn(lineItemPatch, 'totalCost') &&
        (hasOwn(liPatch, 'quantity') || hasOwn(liPatch, 'unit_price')) &&
        existingLineItem.totalCost != null
      ) {
        auditRows.push({
          claim_id: claimId,
          line_item_id: lineItemPatch.id,
          field_name: 'totalCost',
          old_value: toAuditString(existingLineItem.totalCost),
          new_value: null,
          edited_by: treasurer.memberId,
        })
        liPatch.total_cost = null
      }

      if (Object.keys(liPatch).length > 0) {
        await txn
          .updateTable('accts.expense_claim_line_item')
          .set(liPatch)
          .where('id', '=', lineItemPatch.id)
          .where('claim_id', '=', claimId)
          .execute()
      }
    }

    // Recompute refuel_outside_finland from the merged (existing + patched) line items —
    // a treasurer edit can change a fuel line item's airport, and the claim-level flag
    // must stay in sync with it (mirrors updateExpenseClaim's own recompute above).
    const mergedLineItems = (existing.lineItems ?? []).map((li) => {
      const edit = patch.lineItems?.find((p) => p.id === li.id)
      return edit && hasOwn(edit, 'airport') ? { ...li, airport: edit.airport ?? null } : li
    })
    const newRefuelOutsideFinland = computeRefuelOutsideFinland(mergedLineItems)
    if (newRefuelOutsideFinland !== existing.refuelOutsideFinland) {
      auditRows.push({
        claim_id: claimId,
        line_item_id: null,
        field_name: 'refuelOutsideFinland',
        old_value: toAuditString(existing.refuelOutsideFinland),
        new_value: toAuditString(newRefuelOutsideFinland),
        edited_by: treasurer.memberId,
      })
      await txn
        .updateTable('accts.expense_claim')
        .set({ refuel_outside_finland: newRefuelOutsideFinland, updated_at: new Date() })
        .where('id', '=', claimId)
        .execute()
    }

    if (auditRows.length > 0) {
      await txn.insertInto('accts.expense_claim_edit_audit').values(auditRows).execute()
    }
  })

  const claim = await getExpenseClaimById(claimId)
  if (!claim) {
    throw new Error('Failed to load edited expense claim')
  }

  return { claim, changedFieldCount: auditRows.length }
}

export async function getExpenseClaimEditAudit(
  claimId: string,
): Promise<ExpenseClaimEditAuditEntry[]> {
  const rows = await db
    .selectFrom('accts.expense_claim_edit_audit')
    .selectAll()
    .where('claim_id', '=', claimId)
    .orderBy('edited_at', 'desc')
    .execute()

  return rows.map((row) => ({
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    lineItemId: row.line_item_id,
    editedBy: row.edited_by,
    editedAt: toIsoString(row.edited_at),
  }))
}
