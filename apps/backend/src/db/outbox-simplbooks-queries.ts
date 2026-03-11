import { randomUUID } from 'crypto'
import { Transaction } from 'kysely' // Adjust the import path/module if needed
import type { DB } from './schema.d.ts'
import {
  AnnualFeeInfoSchema,
  FeeProcessingStatus,
  MIKInvoiceType,
  RecurringFeeType,
  SimplbooksEventType,
  SimplbooksStatus,
  type AnnualFeeInfo,
  type InvoiceBase,
} from '../services/simplbooks/models.ts'
import logger from '../lib/logger.ts'
import { db } from './connection.ts'
import { MIK_SIMPLBOOKS_MEMBER } from '../services/simplbooks/simplbooksOutboxHandler.ts'
import { FlightLogStatus } from '../routes/flight-log/models.ts'

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
  errorMessage?: string,
) {
  // Mark the outbox message as processed
  await txn
    .updateTable('accts.outbox_simplbooks')
    .set({
      status: status,
      updated_at_utc: new Date(),
      processed_at: new Date(),
      error_message: errorMessage ?? null,
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

export async function updateFlightLogsWithInvoiceNumber(
  txn: Transaction<DB>,
  flightIds: string[],
  invoiceNumber: string,
) {
  if (flightIds.length === 0) {
    return
  }

  await txn
    .updateTable('flight.logs')
    .set({
      invoice_number: invoiceNumber,
      status: FlightLogStatus.INVOICED,
      updated_by: MIK_SIMPLBOOKS_MEMBER,
      updated_at: new Date().toISOString(),
    })
    .where('flight_id', 'in', flightIds)
    .execute()
}

/**
 * Insert a new invoice record into the database
 */
export async function insertInvoice(
  txn: Transaction<DB>,
  memberId: string,
  invoiceType: MIKInvoiceType,
  invoiceData: InvoiceBase,
  currency: string,
) {
  const now = new Date().toISOString()

  await txn
    .insertInto('accts.invoice')
    .values({
      member_id: memberId,
      id: invoiceData.id!,
      invoice_type: invoiceType,
      description: invoiceData.additional_info,
      total_sum: invoiceData.total_sum,
      currency: currency,
      due_at: invoiceData.due!,
      created_by: MIK_SIMPLBOOKS_MEMBER,
      created_at: now,
      updated_by: MIK_SIMPLBOOKS_MEMBER,
      updated_at: now,
      pmt_ref: invoiceData.reference?.toString() ?? '',
    })
    .execute()
}

/**
 * Update member billing ID (SimplBooks client ID)
 */
export async function updateMemberBillingId(
  txn: Transaction<DB>,
  memberId: string,
  billingId: string,
) {
  await txn
    .updateTable('member.register')
    .set({
      billing_id: billingId,
      updated_at: new Date().toISOString(),
      updated_by: MIK_SIMPLBOOKS_MEMBER,
    })
    .where('member_id', '=', memberId)
    .execute()
}

export async function getNextCreditNoteSequenceNumber(txn?: Transaction<DB>): Promise<string> {
  const executor = txn ?? db

  const result = await executor
    .selectNoFrom(eb =>
      eb
        .fn<bigint | number>('nextval', [eb.val('accts.credit_note_number_seq')])
        .as('next_sequence_number'),
    )
    .executeTakeFirstOrThrow()

  return String(result.next_sequence_number)
}
