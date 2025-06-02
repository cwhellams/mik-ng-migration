import { type InvoiceItemQueryParams } from '../routes/invoicing/models.ts'
import type { ItemListArticle } from '../services/simplbooks/models.ts'
import { db } from './connection.ts'
import type { AcctsInvoice, AcctsItems } from './schema.js'

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
    query = query
      .where('due_at', '<', new Date().toISOString()) // compare to now
      .where('is_paid', '=', false)
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

export async function upsertInvoiceItems(items: ItemListArticle[]): Promise<void> {
  await db
    .insertInto('accts.items')
    .values(
      items
        .filter(item => item.id !== undefined && item.code !== undefined && item.name !== undefined)
        .map(item => ({
          id: item.id as number,
          code: item.code as string,
          name: item.name as string,
          item: item,
        })),
    )
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
