import {
  type InvoiceItemQueryParams,
  type RecurringFeesProcessing,
  EquipmentFeeSchema,
  type EquipmentFee,
  ArticleFeeSchema,
  type ArticleFee,
} from '../routes/invoicing/models.ts'
import { ART_EQUIP_FEE_CODE } from '../services/accounting/config.ts'
import {
  RecurringFeeType,
  type FeeType,
  type ItemListArticle,
} from '../services/simplbooks/models.ts'
import { MIK_SIMPLBOOKS_MEMBER } from '../services/simplbooks/simplbooksOutboxHandler.ts'
import { db } from './connection.ts'
import type { AcctsInvoice, AcctsItems } from './schema.js'

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
): Promise<AcctsInvoice[]> {
  const { startDate, endDate, status, type, pastDue, id } = filters || {}

  let query = db.selectFrom('accts.invoice').selectAll()

  if (!isAdmin) {
    // If not admin, filter by memberId
    query = query.where('member_id', '=', memberId)
  }

  if (id) {
    query = query.where('id', '=', id.toString())
  }

  if (startDate) {
    query = query.where('sent_at', '>=', new Date(startDate).toISOString())
  }

  if (endDate) {
    query = query.where('sent_at', '<=', new Date(endDate).toISOString())
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
  // Map raw rows to AcctsInvoice type if necessary
  return rows.map(row => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  })) as unknown as AcctsInvoice[]
}

export async function getInvoiceItems(): Promise<AcctsItems[]> {
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
    .filter(result => result.item)
    .map(result => {
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
    .filter(item => item.id !== undefined && item.code !== undefined && item.name !== undefined)
    .map(item => ({
      id: item.id as number,
      code: item.code as string,
      name: item.name as string,
      item: item,
    }))

  // Skip database operation if no valid items after filtering
  if (validItems.length === 0) {
    return
  }

  await db
    .insertInto('accts.items')
    .values(validItems)
    .onConflict(oc =>
      oc.column('id').doUpdateSet({
        code: eb => eb.ref('excluded.code'),
        name: eb => eb.ref('excluded.name'),
        item: eb => eb.ref('excluded.item'),
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

  return new Map(results.map(row => [row.code, row.id]))
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

  return result.map(row => ({
    fee_type: row.fee_type,
    status: row.status,
    year: row.year,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    updatedBy: row.updated_by,
  })) as RecurringFeesProcessing[]
}

/**
 * Get all unpaid invoices that have a pmt_ref (Simplbooks invoice ID)
 * Returns invoices where is_paid = false and pmt_ref is not empty
 */
export async function getUnpaidInvoicesWithSimplbooksRef(): Promise<AcctsInvoice[]> {
  const rows = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('is_paid', '=', false)
    .where('pmt_ref', '!=', '')
    .orderBy('due_at', 'asc')
    .execute()

  return rows.map(row => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  })) as unknown as AcctsInvoice[]
}

/**
 * Mark an invoice as paid in the database
 */
export async function markInvoiceAsPaid(invoiceId: string, paidAt: string): Promise<void> {
  await db
    .updateTable('accts.invoice')
    .set({
      paid_at: paidAt,
      updated_by: MIK_SIMPLBOOKS_MEMBER,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', invoiceId)
    .execute()
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
export async function getOverdueInvoicesWithoutReminder(): Promise<AcctsInvoice[]> {
  const rows = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('is_paid', '=', false)
    .where('due_at', '<', overdueInvoiceCutoff())
    .where('overdue_email_sent_at', 'is', null)
    .orderBy('due_at', 'asc')
    .execute()

  return rows.map(row => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  })) as unknown as AcctsInvoice[]
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
 * Get overdue flight invoices for a specific member
 * Returns flight invoices where:
 * - is_paid = false
 * - invoice_type = 'FLIGHT'
 * - due_at is older than the specified number of days
 */
export async function getOverdueFlightInvoicesForMember(
  memberId: string,
  daysOverdue: number,
): Promise<AcctsInvoice[]> {
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

  return rows.map(row => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  })) as unknown as AcctsInvoice[]
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

  return members.map(m => m.member_id)
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

  return rows.map(row => ({
    member_id: row.member_id,
    id: String(row.id),
    total_sum: row.total_sum ? String(row.total_sum) : null,
    due_at: row.due_at ? String(row.due_at) : null,
    currency: row.currency ? String(row.currency) : null,
  }))
}
