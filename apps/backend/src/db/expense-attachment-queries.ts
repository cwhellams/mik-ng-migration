import type { Kysely, Transaction } from 'kysely'
import { db } from './connection.ts'
import type { DB } from './schema.d.ts'
import type { ExpenseClaimAttachment } from '@mik/contracts/expenses'

type Executor = Kysely<DB> | Transaction<DB>

const mapAttachment = (row: {
  id: number
  claimId: string
  storageKey: string
  fileName: string
  fileSize: unknown
  mimeType: string
  sortOrder: number
  uploadedAt: unknown
}): ExpenseClaimAttachment => ({
  id: row.id,
  claimId: row.claimId,
  storageKey: row.storageKey,
  fileName: row.fileName,
  fileSize: Number(row.fileSize),
  mimeType: row.mimeType,
  sortOrder: row.sortOrder,
  uploadedAt: new Date(String(row.uploadedAt)).toISOString(),
})

export async function getExpenseAttachments(claimId: string): Promise<ExpenseClaimAttachment[]> {
  const rows = await db
    .selectFrom('accts.expenseClaimAttachment')
    .selectAll()
    .where('claimId', '=', claimId)
    .orderBy('sortOrder')
    .orderBy('id')
    .execute()
  return rows.map(mapAttachment)
}

export async function addExpenseAttachment(
  claimId: string,
  file: { storageKey: string; fileName: string; fileSize: number; mimeType: string },
  executor: Executor = db,
): Promise<ExpenseClaimAttachment> {
  const { sortOrder } = await executor
    .selectFrom('accts.expenseClaimAttachment')
    .select((eb) => eb.fn.max('sortOrder').as('sortOrder'))
    .where('claimId', '=', claimId)
    .executeTakeFirstOrThrow()

  const row = await executor
    .insertInto('accts.expenseClaimAttachment')
    .values({
      claimId: claimId,
      storageKey: file.storageKey,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      sortOrder: (sortOrder ?? -1) + 1,
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
    .selectFrom('accts.expenseClaimAttachment')
    .selectAll()
    .where('claimId', '=', claimId)
    .where('id', '=', attachmentId)
    .executeTakeFirst()
  return row ? mapAttachment(row) : undefined
}

export async function deleteExpenseAttachment(
  claimId: string,
  attachmentId: number,
): Promise<boolean> {
  const result = await db
    .deleteFrom('accts.expenseClaimAttachment')
    .where('claimId', '=', claimId)
    .where('id', '=', attachmentId)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows > BigInt(0)
}
