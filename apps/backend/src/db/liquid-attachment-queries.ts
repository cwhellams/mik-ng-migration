import { noExtraKeys } from './rowToContract.ts'
import type { Kysely, Transaction } from 'kysely'
import { db, type DbRow } from './connection.ts'
import type { DB } from './schema.d.ts'
import type { LiquidRecordAttachment } from '@mik/contracts/liquid'

type Executor = Kysely<DB> | Transaction<DB>

const mapAttachment = (row: DbRow<'liquid.recordAttachment'>): LiquidRecordAttachment =>
  noExtraKeys({
    ...row,
    fileSize: Number(row.fileSize),
    uploadedAt: row.uploadedAt.toISOString(),
  })

export async function getLiquidRecordAttachments(
  recordId: string,
): Promise<LiquidRecordAttachment[]> {
  const rows = await db
    .selectFrom('liquid.recordAttachment')
    .selectAll()
    .where('recordId', '=', recordId)
    .orderBy('id')
    .execute()
  return rows.map(mapAttachment)
}

export async function addLiquidRecordAttachment(
  recordId: string,
  file: { storageKey: string; fileName: string; fileSize: number; mimeType: string },
  executor: Executor = db,
): Promise<LiquidRecordAttachment> {
  const row = await executor
    .insertInto('liquid.recordAttachment')
    .values({
      recordId,
      storageKey: file.storageKey,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapAttachment(row)
}

export async function getLiquidRecordAttachment(
  recordId: string,
  attachmentId: number,
): Promise<LiquidRecordAttachment | undefined> {
  const row = await db
    .selectFrom('liquid.recordAttachment')
    .selectAll()
    .where('recordId', '=', recordId)
    .where('id', '=', attachmentId)
    .executeTakeFirst()
  return row ? mapAttachment(row) : undefined
}

export async function deleteLiquidRecordAttachment(
  recordId: string,
  attachmentId: number,
): Promise<boolean> {
  const result = await db
    .deleteFrom('liquid.recordAttachment')
    .where('recordId', '=', recordId)
    .where('id', '=', attachmentId)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows > BigInt(0)
}

/** How many attachments each fuelling may carry — a single receipt (or two, front/back). */
export const MAX_ATTACHMENTS_PER_RECORD = 5
