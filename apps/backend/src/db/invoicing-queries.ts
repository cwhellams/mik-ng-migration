import type { Selectable } from 'kysely'
import {
  type InvoiceItemQueryParams,
  type RecurringFeesProcessing,
  EquipmentFeeSchema,
  type EquipmentFee,
  ArticleFeeSchema,
  type ArticleFee,
  type Invoice,
  type UnpaidOverdueInvoice,
} from '../routes/invoicing/models.ts'
import { ART_EQUIP_FEE_CODE } from '../services/accounting/config.ts'
import {
  MIKInvoiceType,
  RecurringFeeType,
  type FeeType,
  type ItemListArticle,
} from '../services/simplbooks/models.ts'
import { FlightLogStatus } from '../routes/flight-log/models.ts'
import { MIK_SIMPLBOOKS_MEMBER } from '../services/simplbooks/simplbooksOutboxHandler.ts'
import { db } from './connection.ts'
import type { AcctsInvoice, AcctsItems } from './schema.js'
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
  const { startDate, endDate, status, type, pastDue, id, memberId: filterMemberId } = filters || {}

  let query = db.selectFrom('accts.invoice').selectAll()

  if (!isAdmin) {
    // If not admin, filter by memberId
    query = query.where('member_id', '=', memberId)
  } else if (filterMemberId) {
    // Admin can optionally filter by a specific member
    query = query.where('member_id', '=', filterMemberId)
  }

  if (id) {
    query = query.where('id', '=', id.toString())
  }

  if (startDate) {
    query = query.where('sent_at', '>=', startDate)
  }

  if (endDate) {
    query = query.where('sent_at', '<=', endDate)
  }

  if (status) {
    query = query.where('is_paid', '=', status === 'paid')
  }

  if (type) {
    query = query.where('invoice_type', '=', type)
  }

  if (pastDue) {
    query = query.where('due_at', '<', overdueInvoiceCutoff()).where('is_paid', '=', false)
  }

  const rows = await query.orderBy('sent_at', 'desc').execute()
  return rows.map(toInvoice)
}

const toInvoice = (row: Selectable<AcctsInvoice>): Invoice => ({
  id: String(row.id),
  created_at: row.created_at.toISOString(),
  created_by: row.created_by,
  currency: row.currency,
  description: row.description,
  due_at: row.due_at,
  invoice_type: row.invoice_type as MIKInvoiceType,
  is_paid: row.is_paid,
  member_id: row.member_id,
  paid_at: row.paid_at,
  pmt_ref: row.pmt_ref,
  sent_at: row.sent_at,
  total_sum: row.total_sum === null ? null : String(row.total_sum),
  updated_at: row.updated_at.toISOString(),
  updated_by: row.updated_by,
})

export async function getInvoiceItems(): Promise<Array<Selectable<AcctsItems>>> {
  return await db.selectFrom('accts.items').selectAll().execute()
}

export async function getAnnualEquipmmentFee(): Promise<EquipmentFee | undefined> {
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
        price_per_unit: rawItem.price_per_unit,
        contents: rawItem.contents,
        amount: rawItem.amount,
      })
    })
}

export async function hasRequestedEquipmentFee(year: number, memberId: string): Promise<boolean> {
  const result = await db
    .selectFrom('member.annual_fees')
    .select('member_id')
    .where('member_id', '=', memberId)
    .where('year', '=', year)
    .where('fee_type', '=', RecurringFeeType.EQUIPMENT_FEE)
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
  const result = await db
    .updateTable('accts.items')
    .set({ expense_claim_item: expenseClaimItem })
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
    .selectFrom('accts.recurring_fees_processing')
    .selectAll()
    .where('fee_type', '=', feeType)
    .orderBy('year', 'desc')
    .execute()

  return result.map((row) => ({
    fee_type: row.fee_type,
    status: row.status,
    year: row.year,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
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
    .where('is_paid', '=', false)
    .where('pmt_ref', '!=', '')
    .orderBy('due_at', 'asc')
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
        paid_at: paidAt,
        updated_by: MIK_SIMPLBOOKS_MEMBER,
        updated_at: now,
      })
      .where('id', '=', invoiceId)
      .execute()

    await trx
      .updateTable('flight.logs')
      .set({
        status: FlightLogStatus.PAID,
        updated_by: MIK_SIMPLBOOKS_MEMBER,
        updated_at: now,
      })
      .where('invoice_number', '=', invoiceId)
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
    .where('is_paid', '=', false)
    .where('due_at', '<', overdueInvoiceCutoff())
    .where('overdue_email_sent_at', 'is', null)
    .orderBy('due_at', 'asc')
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
      overdue_email_sent_at: new Date().toISOString(),
      updated_by: MIK_SIMPLBOOKS_MEMBER,
      updated_at: new Date().toISOString(),
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
    .where('member_id', '=', memberId)
    .where('is_paid', '=', false)
    .where('invoice_type', '=', 'FLIGHT')
    .where('due_at', '<', cutoffDate.toISOString())
    .orderBy('due_at', 'asc')
    .execute()

  return rows.map(toInvoice)
}

/**
 * Get all members with suspended reservations (can_make_reservations = false)
 */
export async function getMembersWithSuspendedReservations(): Promise<string[]> {
  const members = await db
    .selectFrom('member.register')
    .select('member_id')
    .where('can_make_reservations', '=', false)
    .execute()

  return members.map((m) => m.member_id)
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
    .select(['member_id', 'id', 'total_sum', 'due_at', 'currency'])
    .where('is_paid', '=', false)
    .where('invoice_type', '=', 'FLIGHT')
    .where('due_at', '<', cutoffDate.toISOString())
    .execute()

  return rows.map((row) => ({
    member_id: row.member_id,
    id: String(row.id),
    total_sum: row.total_sum ? String(row.total_sum) : null,
    due_at: row.due_at ? String(row.due_at) : null,
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
    .innerJoin('member.register as m', 'm.member_id', 'inv.member_id')
    .select([
      'inv.id',
      'inv.created_at',
      'inv.created_by',
      'inv.currency',
      'inv.description',
      'inv.due_at',
      'inv.invoice_type',
      'inv.is_paid',
      'inv.member_id',
      'inv.paid_at',
      'inv.pmt_ref',
      'inv.sent_at',
      'inv.total_sum',
      'inv.updated_at',
      'inv.updated_by',
      'm.first_name',
      'm.last_name',
    ])
    .where('inv.is_paid', '=', false)
    .where('inv.due_at', '<', today)
    .orderBy('inv.due_at', 'asc')
    .execute()

  return rows.map((row) => {
    const dueDate = new Date(row.due_at as string)
    const now = new Date()
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

    return {
      id: String(row.id),
      created_at: row.created_at.toISOString(),
      created_by: row.created_by,
      currency: row.currency,
      description: row.description,
      due_at: row.due_at as string,
      invoice_type: row.invoice_type as MIKInvoiceType,
      is_paid: row.is_paid,
      member_id: row.member_id,
      paid_at: row.paid_at,
      pmt_ref: row.pmt_ref,
      sent_at: row.sent_at,
      total_sum: row.total_sum === null ? null : String(row.total_sum),
      updated_at: row.updated_at.toISOString(),
      updated_by: row.updated_by,
      member_first_name: row.first_name,
      member_last_name: row.last_name,
      days_overdue: daysOverdue,
    }
  })
}
