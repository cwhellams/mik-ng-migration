import { db } from './connection.ts'
import type { ExpenseClaimAttachment } from '../routes/expenses/models.ts'

const mapAttachment = (row: {
  id: number
  claim_id: string
  storage_key: string
  file_name: string
  file_size: unknown
  mime_type: string
  sort_order: number
  uploaded_at: unknown
}): ExpenseClaimAttachment => ({
  id: row.id,
  claimId: row.claim_id,
  storageKey: row.storage_key,
  fileName: row.file_name,
  fileSize: Number(row.file_size),
  mimeType: row.mime_type,
  sortOrder: row.sort_order,
  uploadedAt: new Date(String(row.uploaded_at)).toISOString(),
})

export async function getExpenseAttachments(claimId: string): Promise<ExpenseClaimAttachment[]> {
  const rows = await db
    .selectFrom('accts.expense_claim_attachment')
    .selectAll()
    .where('claim_id', '=', claimId)
    .orderBy('sort_order')
    .orderBy('id')
    .execute()
  return rows.map(mapAttachment)
}

export async function addExpenseAttachment(
  claimId: string,
  file: { storageKey: string; fileName: string; fileSize: number; mimeType: string },
): Promise<ExpenseClaimAttachment> {
  const { sortOrder } = await db
    .selectFrom('accts.expense_claim_attachment')
    .select((eb) => eb.fn.max('sort_order').as('sortOrder'))
    .where('claim_id', '=', claimId)
    .executeTakeFirstOrThrow()

  const row = await db
    .insertInto('accts.expense_claim_attachment')
    .values({
      claim_id: claimId,
      storage_key: file.storageKey,
      file_name: file.fileName,
      file_size: file.fileSize,
      mime_type: file.mimeType,
      sort_order: (sortOrder ?? -1) + 1,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapAttachment(row)
}

export async function getExpenseAttachment(
  claimId: string,
  attachmentId: number,
): Promise<ExpenseClaimAttachment | undefined> {
  const row = await db
    .selectFrom('accts.expense_claim_attachment')
    .selectAll()
    .where('claim_id', '=', claimId)
    .where('id', '=', attachmentId)
    .executeTakeFirst()
  return row ? mapAttachment(row) : undefined
}

export async function deleteExpenseAttachment(
  claimId: string,
  attachmentId: number,
): Promise<boolean> {
  const result = await db
    .deleteFrom('accts.expense_claim_attachment')
    .where('claim_id', '=', claimId)
    .where('id', '=', attachmentId)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows > BigInt(0)
}
