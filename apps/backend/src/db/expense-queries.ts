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
  type ExpenseClaimFilters,
  type ExpenseClaimListResponse,
  type ExpenseClaimMessage,
  type ExpenseLineItem,
  type UpdateExpenseClaim,
} from '../routes/expenses/models.ts'
import {
  getCurrentMileageAllowance,
  getMileageDetailByClaimId,
  upsertMileageDetail,
} from './mileage-queries.ts'

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
  created_at: unknown
  updated_at: unknown
  member_name: string | null
  member_email: string | null
  total_amount: unknown
}

const hasOwn = <T extends object>(obj: T, key: keyof any): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)

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
  vat_percent: unknown
  sort_order: number
  cost_centre_code?: string | null
}): ExpenseLineItem => ({
  id: row.id,
  itemId: row.item_id,
  itemCode: row.item_code ?? undefined,
  description: row.description,
  quantity: Number(row.quantity),
  unit: row.unit as ExpenseLineItem['unit'],
  unitPrice: Number(row.unit_price),
  vatPercent: Number(row.vat_percent),
  sortOrder: row.sort_order,
  costCentreCode: row.cost_centre_code ?? undefined,
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
  details?: Pick<ExpenseClaim, 'lineItems' | 'messages' | 'mileageDetail'>,
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
      'claim.created_at',
      'claim.updated_at',
      'member.email as member_email',
      sql<string>`trim(concat(coalesce(member.first_name, ''), ' ', coalesce(member.last_name, '')))`.as(
        'member_name',
      ),
      sql<number>`coalesce((
        select sum(li.quantity * li.unit_price * (1 + li.vat_percent / 100.0)) * coalesce(claim.fx_rate, 1.0)
        from accts.expense_claim_line_item li
        where li.claim_id = claim.id
      ), 0)`.as('total_amount'),
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
        vat_percent: item.vatPercent,
        sort_order: item.sortOrder,
        cost_centre_code: item.costCentreCode ?? null,
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

  const [lineItems, messages, mileageDetail] = await Promise.all([
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
        'li.vat_percent',
        'li.sort_order',
        'li.cost_centre_code',
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
    getMileageDetailByClaimId(id),
  ])

  return mapClaim(claimRow as ClaimRow, {
    lineItems: lineItems.map(mapLineItem),
    messages: messages.map(mapMessage),
    mileageDetail,
  })
}

export async function createExpenseClaim(
  data: CreateExpenseClaim,
  user: JWTUser,
): Promise<ExpenseClaim> {
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
        expense_date: data.expenseDate,
        iban: data.iban,
        iban_account_name: data.ibanAccountName,
        ccy: data.currency ?? 'EUR',
        fx_rate: data.fxRate ?? null,
        updated_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await insertLineItems(txn, inserted.id, data.lineItems)
    return inserted.id
  })

  // Upsert mileage detail if present (uses a separate connection; mileage table is independent)
  if (data.mileageDetail) {
    const allowance = await getCurrentMileageAllowance()
    const effectiveRate = allowance?.effectiveRatePerKm ?? 0.275 // fallback: 50% of 0.55
    await upsertMileageDetail(result, data.mileageDetail, effectiveRate)
  }

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

    await txn.updateTable('accts.expense_claim').set(patch).where('id', '=', id).execute()

    if (data.lineItems) {
      await txn.deleteFrom('accts.expense_claim_line_item').where('claim_id', '=', id).execute()
      await insertLineItems(txn, id, data.lineItems)
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

  if (data.mileageDetail) {
    const allowance = await getCurrentMileageAllowance()
    const effectiveRate = allowance?.effectiveRatePerKm ?? 0.275
    await upsertMileageDetail(id, data.mileageDetail, effectiveRate)
  }

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
