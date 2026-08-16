import {
  type InvoiceItemQueryParams,
  type RecurringFeesProcessing,
  EquipmentFeeSchema,
  type EquipmentFee,
  ArticleFeeSchema,
  type ArticleFee,
  type Invoice,
  type UnpaidOverdueInvoice,
} from '@mik/contracts/invoicing'
import { ART_EQUIP_FEE_CODE } from '../services/accounting/config.ts'
import {
  RecurringFeeType,
  type FeeType,
  type ItemListArticle,
} from '../services/simplbooks/models.ts'
import { MIKInvoiceType } from '@mik/contracts/invoicing'
import { FlightLogStatus } from '@mik/contracts/flight-log'
import { MIK_SIMPLBOOKS_MEMBER } from '../services/simplbooks/simplbooksOutboxHandler.ts'
import { db, type DbRow } from './connection.ts'
import {
  HALF_YEAR_DISCOUNT_PERCENT,
  isAfterEquipmentFeeDiscountDate,
} from '../util/feeDiscounts.ts'

function overdueInvoiceCutoff(): string {
  const now = new Date()
  const gracePeriodDays = Number(process.env.OVERDUE_INVOICE_GRACE_PERIOD_DAYS || 10)
  now.setDate(now.getDate() - gracePeriodDays)
  return now.toISOString()
}

export async function getInvoices(
  memberId: string,
  isAdmin: boolean,
  filters?: InvoiceItemQueryParams,
): Promise<Invoice[]> {
  const {
    startDate,
    endDate,
    status,
    type,
    pastDue,
    id,
    memberId: filterMemberId,
    scope,
  } = filters || {}

  let query = db.selectFrom('accts.invoice').selectAll()

  if (!isAdmin || scope === 'personal') {
    // If not admin, or the caller explicitly asked for personal-only results
    // (e.g. the dashboard's own-invoices warning), always filter by memberId
    // regardless of admin status.
    query = query.where('memberId', '=', memberId)
  } else if (filterMemberId) {
    // Admin can optionally filter by a specific member
    query = query.where('memberId', '=', filterMemberId)
  }

  if (id) {
    query = query.where('id', '=', id.toString())
  }

  if (startDate) {
    query = query.where('sentAt', '>=', startDate)
  }

  if (endDate) {
    query = query.where('sentAt', '<=', endDate)
  }

  if (status) {
    query = query.where('isPaid', '=', status === 'paid')
  }

  if (type) {
    query = query.where('invoiceType', '=', type)
  }

  if (pastDue) {
    query = query.where('dueAt', '<', overdueInvoiceCutoff()).where('isPaid', '=', false)
  }

  const rows = await query.orderBy('sentAt', 'desc').execute()
  return rows.map(toInvoice)
}

const toInvoice = (row: DbRow<'accts.invoice'>): Invoice => ({
  id: String(row.id),
  created_at: row.createdAt.toISOString(),
  created_by: row.createdBy,
  currency: row.currency,
  description: row.description,
  due_at: row.dueAt,
  invoice_type: row.invoiceType as MIKInvoiceType,
  is_paid: row.isPaid,
  member_id: row.memberId,
  paid_at: row.paidAt,
  pmt_ref: row.pmtRef,
  sent_at: row.sentAt,
  total_sum: row.totalSum === null ? null : String(row.totalSum),
  updated_at: row.updatedAt.toISOString(),
  updated_by: row.updatedBy,
})

export async function getInvoiceItems(): Promise<Array<DbRow<'accts.items'>>> {
  return await db.selectFrom('accts.items').selectAll().execute()
}

export async function getAnnualEquipmentFee(): Promise<EquipmentFee | undefined> {
  const result = await db
    .selectFrom('accts.items')
    .select('item')
    .where('code', '=', ART_EQUIP_FEE_CODE)
    .executeTakeFirst()

  if (!result?.item) {
    return undefined
  }

  const rawItem = result.item as Record<string, unknown>

  const equipmentFee = {
    code: rawItem.code,
    unit: rawItem.unit,
    markup_value: rawItem.markup_value,
    discount_amount: Number(process.env.EQUIPMENT_FEE_DISCOUNT_PER_HOUR || 0),
    seasonal_discount_percent: isAfterEquipmentFeeDiscountDate()
      ? HALF_YEAR_DISCOUNT_PERCENT
      : undefined,
  }

  return EquipmentFeeSchema.parse(equipmentFee)
}

export async function getArticleFees(codes: string[]): Promise<ArticleFee[]> {
  const results = await db
    .selectFrom('accts.items')
    .select(['id', 'item', 'code', 'name'])
    .where('code', 'in', codes)
    .execute()

  return results
    .filter((result) => result.item)
    .map((result) => {
      const rawItem = result.item as Record<string, unknown>
      return ArticleFeeSchema.parse({
        id: result.id,
        code: result.code,
        name: result.name,
        unit: rawItem.unit,
        markup_value: rawItem.markup_value,
        markup_type: rawItem.markup_type,
        price_per_unit: rawItem.price_per_unit,
        contents: rawItem.contents,
        amount: rawItem.amount,
      })
    })
}

export async function hasRequestedEquipmentFee(year: number, memberId: string): Promise<boolean> {
  const result = await db
    .selectFrom('member.annualFees')
    .select('memberId')
    .where('memberId', '=', memberId)
    .where('year', '=', year)
    .where('feeType', '=', RecurringFeeType.EQUIPMENT_FEE)
    .executeTakeFirst()

  return result !== undefined
}

export async function upsertInvoiceItems(items: ItemListArticle[]): Promise<void> {
  const validItems = items
    .filter((item) => item.id !== undefined && item.code !== undefined && item.name !== undefined)
    .map((item) => ({
      id: item.id!,
      code: item.code!,
      name: item.name!,
      item: item,
    }))

  // Skip database operation if no valid items after filtering
  if (validItems.length === 0) {
    return
  }

  await db
    .insertInto('accts.items')
    .values(validItems)
    .onConflict((oc) =>
      oc.column('id').doUpdateSet({
        code: (eb) => eb.ref('excluded.code'),
        name: (eb) => eb.ref('excluded.name'),
        item: (eb) => eb.ref('excluded.item'),
      }),
    )
    .execute()
}

export async function deleteInvoiceItem(id: number): Promise<void> {
  const result = await db.deleteFrom('accts.items').where('id', '=', id).execute()

  if (result.length === 0) {
    throw new Error(`Failed to delete invoice item with id ${id}`)
  }
}

export async function updateExpenseClaimItemFlag(
  id: number,
  expenseClaimItem: boolean,
): Promise<void> {
  await updateItemBooleanFlag(id, 'expenseClaimItem', expenseClaimItem)
}

export async function updateIsFuelItemFlag(id: number, isFuelItem: boolean): Promise<void> {
  await updateItemBooleanFlag(id, 'isFuelItem', isFuelItem)
}

export async function updateIsKmItemFlag(id: number, isKmItem: boolean): Promise<void> {
  await updateItemBooleanFlag(id, 'isKmItem', isKmItem)
}

export async function updateIsOtherItemFlag(id: number, isOtherItem: boolean): Promise<void> {
  await updateItemBooleanFlag(id, 'isOtherItem', isOtherItem)
}

async function updateItemBooleanFlag(
  id: number,
  column: 'expenseClaimItem' | 'isFuelItem' | 'isKmItem' | 'isOtherItem',
  value: boolean,
): Promise<void> {
  const result = await db
    .updateTable('accts.items')
    .set({ [column]: value })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  if (result.numUpdatedRows < BigInt(1)) {
    throw new Error(`Failed to update invoice item with id ${id}`)
  }
}

/**
 * Get article IDs for multiple codes in a single query
 * Returns a Map of code -> article ID
 */
export async function getArticleIdsByCode(codes: string[]): Promise<Map<string, number>> {
  if (codes.length === 0) {
    return new Map()
  }

  const results = await db
    .selectFrom('accts.items')
    .select(['code', 'id'])
    .where('code', 'in', codes)
    .execute()

  return new Map(results.map((row) => [row.code, row.id]))
}

export async function getRecurringFeesProcessing(
  feeType: FeeType,
): Promise<RecurringFeesProcessing[]> {
  const result = await db
    .selectFrom('accts.recurringFeesProcessing')
    .selectAll()
    .where('feeType', '=', feeType)
    .orderBy('year', 'desc')
    .execute()

  return result.map((row) => ({
    fee_type: row.feeType,
    status: row.status,
    year: row.year,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  }))
}

/**
 * Get all unpaid invoices that have a Simplbooks payment reference in `pmt_ref`
 * Returns invoices where is_paid = false and pmt_ref is not empty.
 * Note: `pmt_ref` stores the Simplbooks invoice reference, while `id` stores the Simplbooks invoice ID.
 */
export async function getUnpaidInvoicesWithSimplbooksRef(): Promise<Invoice[]> {
  const rows = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('isPaid', '=', false)
    .where('pmtRef', '!=', '')
    .orderBy('dueAt', 'asc')
    .execute()

  return rows.map(toInvoice)
}

/**
 * Mark an invoice as paid in the database and update all related flight logs to PAID status
 */
export async function markInvoiceAsPaid(invoiceId: string, paidAt: string): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('accts.invoice')
      .set({
        paidAt: paidAt,
        updatedBy: MIK_SIMPLBOOKS_MEMBER,
        updatedAt: now,
      })
      .where('id', '=', invoiceId)
      .execute()

    await trx
      .updateTable('flight.logs')
      .set({
        status: FlightLogStatus.PAID,
        updatedBy: MIK_SIMPLBOOKS_MEMBER,
        updatedAt: now,
      })
      .where('invoiceNumber', '=', invoiceId)
      .where('status', '=', FlightLogStatus.INVOICED)
      .execute()
  })
}

/**
 * Get all overdue invoices that haven't had a reminder email sent
 * Returns invoices where:
 * - is_paid = false
 * - due_at + grace period < current date
 * - overdue_email_sent_at is null (no reminder sent yet)
 *
 * Grace period can be configured via OVERDUE_INVOICE_GRACE_PERIOD_DAYS env var (defaults to 0)
 */
export async function getOverdueInvoicesWithoutReminder(): Promise<Invoice[]> {
  const rows = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('isPaid', '=', false)
    .where('dueAt', '<', overdueInvoiceCutoff())
    .where('overdueEmailSentAt', 'is', null)
    .orderBy('dueAt', 'asc')
    .execute()

  return rows.map(toInvoice)
}

/**
 * Mark that an overdue reminder email has been sent for an invoice
 */
export async function markOverdueEmailSent(invoiceId: string): Promise<void> {
  await db
    .updateTable('accts.invoice')
    .set({
      overdueEmailSentAt: new Date().toISOString(),
      updatedBy: MIK_SIMPLBOOKS_MEMBER,
      updatedAt: new Date().toISOString(),
    })
    .where('id', '=', invoiceId)
    .execute()
}

/**
 * Get all overdue flight invoices for a specific member
 * Returns flight invoices where:
 * - is_paid = false
 * - invoice_type = 'FLIGHT'
 * - due_at is older than the specified number of days
 */
export async function getOverdueFlightInvoicesForMember(
  memberId: string,
  daysOverdue: number,
): Promise<Invoice[]> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOverdue)

  const rows = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('memberId', '=', memberId)
    .where('isPaid', '=', false)
    .where('invoiceType', '=', 'FLIGHT')
    .where('dueAt', '<', cutoffDate.toISOString())
    .orderBy('dueAt', 'asc')
    .execute()

  return rows.map(toInvoice)
}

/**
 * Get all members with suspended reservations (can_make_reservations = false)
 */
export async function getMembersWithSuspendedReservations(): Promise<string[]> {
  const members = await db
    .selectFrom('member.register')
    .select('memberId')
    .where('canMakeReservations', '=', false)
    .execute()

  return members.map((m) => m.memberId)
}

/**
 * Get all overdue FLIGHT invoices older than a given number of days
 * Returns invoices where:
 * - is_paid = false
 * - invoice_type = 'FLIGHT'
 * - due_at is older than the specified number of days
 * Used for suspension logic - ignores whether reminder email was sent
 */
export async function getOverdueFlightInvoicesPastDays(daysOverdue: number): Promise<
  Array<{
    member_id: string
    id: string
    total_sum: string | null
    due_at: string | null
    currency: string | null
  }>
> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOverdue)

  const rows = await db
    .selectFrom('accts.invoice')
    .select(['memberId', 'id', 'totalSum', 'dueAt', 'currency'])
    .where('isPaid', '=', false)
    .where('invoiceType', '=', 'FLIGHT')
    .where('dueAt', '<', cutoffDate.toISOString())
    .execute()

  return rows.map((row) => ({
    member_id: row.memberId,
    id: String(row.id),
    total_sum: row.totalSum ? String(row.totalSum) : null,
    due_at: row.dueAt ? String(row.dueAt) : null,
    currency: row.currency ? String(row.currency) : null,
  }))
}

/**
 * Get all unpaid overdue invoices joined with member names.
 * Returns invoices where is_paid = false and due_at < today, enriched with
 * the invoiced member's first and last name and days overdue.
 */
export async function getUnpaidOverdueInvoicesWithMemberInfo(): Promise<UnpaidOverdueInvoice[]> {
  const today = new Date().toISOString().split('T')[0]

  const rows = await db
    .selectFrom('accts.invoice as inv')
    .innerJoin('member.register as m', 'm.memberId', 'inv.memberId')
    .select([
      'inv.id',
      'inv.createdAt',
      'inv.createdBy',
      'inv.currency',
      'inv.description',
      'inv.dueAt',
      'inv.invoiceType',
      'inv.isPaid',
      'inv.memberId',
      'inv.paidAt',
      'inv.pmtRef',
      'inv.sentAt',
      'inv.totalSum',
      'inv.updatedAt',
      'inv.updatedBy',
      'm.firstName',
      'm.lastName',
    ])
    .where('inv.isPaid', '=', false)
    .where('inv.dueAt', '<', today)
    .orderBy('inv.dueAt', 'asc')
    .execute()

  return rows.map((row) => {
    const dueDate = new Date(row.dueAt as string)
    const now = new Date()
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

    return {
      id: String(row.id),
      created_at: row.createdAt.toISOString(),
      created_by: row.createdBy,
      currency: row.currency,
      description: row.description,
      due_at: row.dueAt as string,
      invoice_type: row.invoiceType as MIKInvoiceType,
      is_paid: row.isPaid,
      member_id: row.memberId,
      paid_at: row.paidAt,
      pmt_ref: row.pmtRef,
      sent_at: row.sentAt,
      total_sum: row.totalSum === null ? null : String(row.totalSum),
      updated_at: row.updatedAt.toISOString(),
      updated_by: row.updatedBy,
      member_first_name: row.firstName,
      member_last_name: row.lastName,
      days_overdue: daysOverdue,
    }
  })
}
