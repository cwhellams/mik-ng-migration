import { noExtraKeys } from './rowToContract.ts'
import type { Kysely, Transaction } from 'kysely'
import { db, type DbRow } from './connection.ts'
import type { DB } from '@mik/db-schema/schema'
import type { ExpenseClaimAttachment } from '@mik/contracts/expenses'

type Executor = Kysely<DB> | Transaction<DB>

// Typed from the generated schema rather than hand-declared. The hand-written shape
// spelled uploadedAt `unknown`, which forced `new Date(String(uploadedAt))` to compile —
// and that round trip goes through Date#toString(), which has no millisecond field, so
// every uploadedAt came back truncated to the whole second. It is a real Date here
// (connection.ts only overrides the DATE/INT8/NUMERIC parsers, not TIMESTAMP), so
// toISOString() can be called on it directly. fileSize stays wrapped: it is an INT8,
// which that same parser list deliberately keeps as a string.
const mapAttachment = (row: DbRow<'accts.expenseClaimAttachment'>): ExpenseClaimAttachment =>
  noExtraKeys({
    ...row,
    fileSize: Number(row.fileSize),
    uploadedAt: row.uploadedAt.toISOString(),
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
  file: {
    storageKey: string
    fileName: string
    fileSize: number
    mimeType: string
    sourceLiquidAttachmentId?: number
  },
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
      sourceLiquidAttachmentId: file.sourceLiquidAttachmentId ?? null,
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
