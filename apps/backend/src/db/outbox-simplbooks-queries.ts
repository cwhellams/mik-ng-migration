import { randomUUID } from 'node:crypto'
import { Transaction } from 'kysely' // Adjust the import path/module if needed
import type { DB as CamelDB } from './schema.camel.d.ts'
import {
  AnnualFeeInfoSchema,
  FeeProcessingStatus,
  RecurringFeeType,
  SimplbooksEventType,
  SimplbooksStatus,
  type AnnualFeeInfo,
  type InvoiceBase,
} from '../services/simplbooks/models.ts'
import { MIKInvoiceType } from '@mik/contracts/invoicing'
import logger from '../lib/logger.ts'
import { camelDb } from './connection.ts'
import { MIK_SIMPLBOOKS_MEMBER } from '../services/simplbooks/simplbooksOutboxHandler.ts'
import { FlightLogStatus } from '@mik/contracts/flight-log'

export async function insertOutboxItem(
  eventType: SimplbooksEventType,
  payload: any,
  txn?: Transaction<CamelDB>,
) {
  const executor = txn ?? camelDb

  await executor
    .insertInto('accts.outboxSimplbooks')
    .values({
      id: randomUUID(),
      eventType: eventType,
      payload,
    })
    .execute()
}

export async function getFeeProcessingItem(feeType: RecurringFeeType, year: number) {
  return await camelDb
    .selectFrom('accts.recurringFeesProcessing')
    .where('feeType', '=', feeType)
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
  await camelDb
    .insertInto('accts.recurringFeesProcessing')
    .values({
      feeType: feeType,
      status: status,
      year: year,
      createdBy: memberId,
      updatedBy: memberId,
    })
    .execute()
}

export async function updateFeeProcessingItem(
  feeType: RecurringFeeType,
  status: FeeProcessingStatus,
  year: number,
  memberId: string,
) {
  await camelDb
    .updateTable('accts.recurringFeesProcessing')
    .set({
      status: status,
      updatedBy: memberId,
    })
    .where('feeType', '=', feeType)
    .where('year', '=', year)
    .execute()
}

export async function setOutboxStatus(
  txn: Transaction<CamelDB>,
  outboxMsgId: string,
  status: SimplbooksStatus,
  errorMessage?: string,
) {
  // Mark the outbox message as processed
  await txn
    .updateTable('accts.outboxSimplbooks')
    .set({
      status: status,
      updatedAtUtc: new Date(),
      processedAt: new Date(),
      errorMessage: errorMessage ?? null,
    })
    .where('id', '=', outboxMsgId)
    .execute()
}

export type OutboxFilters = {
  status?: string
  // snake_case deliberately: these are the wire contract's query-parameter names
  // (@mik/contracts/outbox), not column names. The columns they filter on are
  // camelCase below.
  event_type?: string
  created_from?: string
  created_to?: string
  processed_from?: string
  processed_to?: string
}

export async function getOutboxItems(filters: OutboxFilters) {
  let query = camelDb.selectFrom('accts.outboxSimplbooks').selectAll()

  if (filters.status) {
    query = query.where('status', '=', filters.status as SimplbooksStatus)
  }
  if (filters.event_type) {
    query = query.where('eventType', '=', filters.event_type)
  }
  if (filters.created_from) {
    query = query.where('createdAtUtc', '>=', new Date(filters.created_from))
  }
  if (filters.created_to) {
    query = query.where('createdAtUtc', '<=', new Date(filters.created_to))
  }
  if (filters.processed_from) {
    query = query.where('processedAt', '>=', new Date(filters.processed_from) as any)
  }
  if (filters.processed_to) {
    query = query.where('processedAt', '<=', new Date(filters.processed_to) as any)
  }

  return query.orderBy('createdAtUtc', 'desc').limit(200).execute()
}

export async function resetOutboxItemToPending(id: string): Promise<void> {
  await camelDb
    .updateTable('accts.outboxSimplbooks')
    .set({
      status: SimplbooksStatus.PENDING,
      updatedAtUtc: new Date(),
      errorMessage: null,
    })
    .where('id', '=', id)
    .where('status', '=', SimplbooksStatus.FAILED)
    .execute()
}

export async function checkAndClearStuckMessages(): Promise<void> {
  const results = await camelDb
    .updateTable('accts.outboxSimplbooks')
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

export async function insertMemberAnnualFees(txn: Transaction<CamelDB>, feeInfo: AnnualFeeInfo) {
  const validated = AnnualFeeInfoSchema.parse(feeInfo)

  await txn
    .insertInto('member.annualFees')
    .values({
      memberId: validated.memberId,
      feeType: validated.feeType,
      year: validated.year,
      invoiceId: validated.invoiceId,
      createdBy: validated.createdBy,
      updatedBy: validated.updatedBy,
    })
    .execute()
}

export async function updateFlightLogsWithInvoiceNumber(
  txn: Transaction<CamelDB>,
  flightIds: string[],
  invoiceNumber: string,
) {
  if (flightIds.length === 0) {
    return
  }

  await txn
    .updateTable('flight.logs')
    .set({
      invoiceNumber: invoiceNumber,
      status: FlightLogStatus.INVOICED,
      updatedBy: MIK_SIMPLBOOKS_MEMBER,
      updatedAt: new Date().toISOString(),
    })
    .where('flightId', 'in', flightIds)
    .execute()
}

/**
 * Insert a new invoice record into the database
 */
export async function insertInvoice(
  txn: Transaction<CamelDB>,
  memberId: string,
  invoiceType: MIKInvoiceType,
  invoiceData: InvoiceBase,
  currency: string,
) {
  const now = new Date().toISOString()

  await txn
    .insertInto('accts.invoice')
    .values({
      memberId: memberId,
      id: invoiceData.id!,
      invoiceType: invoiceType,
      description: invoiceData.additional_info,
      totalSum: invoiceData.total_sum,
      currency: currency,
      dueAt: invoiceData.due!,
      createdBy: MIK_SIMPLBOOKS_MEMBER,
      createdAt: now,
      updatedBy: MIK_SIMPLBOOKS_MEMBER,
      updatedAt: now,
      pmtRef: invoiceData.reference?.toString() ?? '',
    })
    .execute()
}

/**
 * Update member billing ID (SimplBooks client ID)
 */
export async function updateMemberBillingId(
  txn: Transaction<CamelDB>,
  memberId: string,
  billingId: string,
) {
  await txn
    .updateTable('member.register')
    .set({
      billingId: billingId,
      updatedAt: new Date().toISOString(),
      updatedBy: MIK_SIMPLBOOKS_MEMBER,
    })
    .where('memberId', '=', memberId)
    .execute()
}

export async function getNextCreditNoteSequenceNumber(txn?: Transaction<CamelDB>): Promise<string> {
  const executor = txn ?? camelDb

  const result = await executor
    .selectNoFrom((eb) =>
      eb
        // A *value*, not an identifier: this is the sequence's real name, passed as a
        // string argument to nextval(). The camelCase pass rewrote it as if it were a
        // table reference, which made nextval() fail — see the test below.
        .fn<bigint | number>('nextval', [eb.val('accts.credit_note_number_seq')])
        .as('nextSequenceNumber'),
    )
    .executeTakeFirstOrThrow()

  return String(result.nextSequenceNumber)
}
