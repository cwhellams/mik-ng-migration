import { randomUUID } from 'crypto'
import { Transaction } from 'kysely' // Adjust the import path/module if needed
import type { DB } from './schema.d.ts'
import {
  AnnualFeeInfoSchema,
  FeeProcessingStatus,
  RecurringFeeType,
  SimplbooksEventType,
  SimplbooksStatus,
  type AnnualFeeInfo,
} from '../services/simplbooks/models.ts'
import logger from '../lib/logger.ts'
import { db } from './connection.ts'

export async function insertOutboxItem(
  eventType: SimplbooksEventType,
  payload: any,
  txn?: Transaction<DB>,
) {
  const executor = txn ?? db

  await executor
    .insertInto('accts.outbox_simplbooks')
    .values({
      id: randomUUID(),
      event_type: eventType,
      payload,
    })
    .execute()
}

export async function getFeeProcessingItem(feeType: RecurringFeeType, year: number) {
  return await db
    .selectFrom('accts.recurring_fees_processing')
    .where('fee_type', '=', feeType)
    .where('year', '=', year)
    .selectAll()
    .executeTakeFirst()
}

export async function insertFeeProcessingItem(
  feeType: RecurringFeeType,
  status: FeeProcessingStatus,
  year: number,
  memberId: string,
) {
  await db
    .insertInto('accts.recurring_fees_processing')
    .values({
      fee_type: feeType,
      status: status,
      year: year,
      created_by: memberId,
      updated_by: memberId,
    })
    .execute()
}

export async function updateFeeProcessingItem(
  feeType: RecurringFeeType,
  status: FeeProcessingStatus,
  year: number,
  memberId: string,
) {
  await db
    .updateTable('accts.recurring_fees_processing')
    .set({
      status: status,
      updated_by: memberId,
    })
    .where('fee_type', '=', feeType)
    .where('year', '=', year)
    .execute()
}

export async function setOutboxStatus(
  txn: Transaction<DB>,
  outboxMsgId: string,
  status: SimplbooksStatus,
) {
  // Mark the outbox message as processed
  await txn
    .updateTable('accts.outbox_simplbooks')
    .set({
      status: status,
      updated_at_utc: new Date(),
      processed_at: new Date(),
    })
    .where('id', '=', outboxMsgId)
    .execute()
}

export async function checkAndClearStuckMessages(): Promise<void> {
  const results = await db
    .updateTable('accts.outbox_simplbooks')
    .set({ status: SimplbooksStatus.PENDING })
    .where('status', '=', SimplbooksStatus.PROCESSING)
    .execute()

  // We will always get back at least one updateResult even if no rows were updated, so need to check the numUpdatedRows.
  if ((results.length === 1 && results[0].numUpdatedRows > 0) || results.length > 1) {
    logger.warn(
      `Cleared ${results[0].numUpdatedRows} stuck messages in the SimplBooks outbox with status PROCESSING`,
    )
    return
  }
  logger.info('No stuck messages found in the SimplBooks outbox with status PROCESSING')
}

export async function insertMemberAnnualFees(txn: Transaction<DB>, feeInfo: AnnualFeeInfo) {
  const validated = AnnualFeeInfoSchema.parse(feeInfo)

  await txn
    .insertInto('member.annual_fees')
    .values({
      member_id: validated.memberId,
      fee_type: validated.feeType,
      year: validated.year,
      invoice_id: validated.invoiceId,
      created_by: validated.createdBy,
      updated_by: validated.updatedBy,
    })
    .execute()
}
