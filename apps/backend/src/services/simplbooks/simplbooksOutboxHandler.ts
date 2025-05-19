import { randomUUID } from 'crypto'
import { db } from '../../db/connection.ts'
import logger from '../../lib/logger.ts'
import { MemberSchema } from '../../routes/members/models.ts'
import {
  MIKInvoiceType,
  SimplbooksEventType,
  SimplbooksStatus,
  type AcctsOutboxSimplbooks,
} from './models.ts'
import { createInvoice, createNewClient, getInvoice } from './simplbooksApiClient.ts'
import { createMembershipFeeInvoicePayload } from '../accounting/membershipFee.ts'
import type { Transaction } from 'kysely'
import type { DB } from '../../db/schema.js'

export const MIK_SIMPLBOOKS_MEMBER: string = 'simplbks'
export const MIK_CURRENCY = 'EUR'

export const dispatchOutboxMsg = async (msg: AcctsOutboxSimplbooks) => {
  switch (msg.event_type) {
    case SimplbooksEventType.ADD_MEMBER:
      await addMember(msg)
      break
    case SimplbooksEventType.MEMBERSHIP_FEE:
      await createMembershipFeeInvoice(msg)
      break
    default:
      throw new Error(`Unsupported outbox event type: ${msg.event_type}`)
  }
}

async function createMembershipFeeInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const member = MemberSchema.parse(outboxMsg.payload)

  const feeInvoice = await createMembershipFeeInvoicePayload(member)

  // Create the invoice
  const retval = await createInvoice(feeInvoice)

  //Read back the created invoice - we need to do this in order to get e.g. total sum
  const createdInvoice = await getInvoice(retval.inserted_id)
  const invoiceData = createdInvoice.data.Invoice

  const now = new Date()

  await db.transaction().execute(async txn => {
    txn
      .insertInto('accts.invoice')
      .values({
        member_id: member.memberId,
        id: invoiceData.id!,
        invoice_type: MIKInvoiceType.ANNUAL_FEE,
        description: invoiceData.additional_info,
        total_sum: invoiceData.total_sum,
        currency: MIK_CURRENCY,
        due_at: invoiceData.due!,
        created_by: MIK_SIMPLBOOKS_MEMBER,
        created_at: now,
        updated_by: MIK_SIMPLBOOKS_MEMBER,
        updated_at: now,
        pmt_ref: invoiceData.reference?.toString() ?? '',
      })
      .execute()

    //Insert pdf dispatch row to outbox
    await insertOutboxItem(txn, SimplbooksEventType.SEND_INVOICE_PDF, {
      memberId: member.memberId,
      invoiceId: invoiceData.id!,
    })

    //Mark as processed
    await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
  })
}

async function addMember(outboxMsg: AcctsOutboxSimplbooks) {
  // Extract the member data from the outbox message, validate it, and create a new client in SimplBooks
  const member = MemberSchema.parse(outboxMsg.payload)

  const clientId = await createNewClient(member)
  logger.info(`Created new SimplBooks client with ID: ${clientId} for member: ${member.email}`)

  await db.transaction().execute(async txn => {
    // Set the billing id in our DB - which is the returned SimplBooks client id

    await txn
      .updateTable('member.register')
      .set({
        billing_id: clientId.toString(),
        updated_at: new Date(),
        updated_by: MIK_SIMPLBOOKS_MEMBER,
      })
      .where('member_id', '=', member.memberId)
      .execute()

    // We add the create invoice action to the outbox, this will allow us to handle the situation
    // where the client id is created but invoice creation fails - now its async and decoupled
    await insertOutboxItem(txn, SimplbooksEventType.MEMBERSHIP_FEE, {
      ...member,
      billing_id: clientId.toString(),
    })

    await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
  })
}

async function insertOutboxItem(
  txn: Transaction<DB>,
  eventType: SimplbooksEventType,
  payload: any,
) {
  await txn
    .insertInto('accts.outbox_simplbooks')
    .values({
      id: randomUUID(),
      event_type: eventType,
      payload,
    })
    .execute()
}

async function setOutboxStatus(
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

export async function checkAndClearStuckMessages() {
  const results = await db
    .updateTable('accts.outbox_simplbooks')
    .set({ status: SimplbooksStatus.PENDING })
    .where('status', '=', SimplbooksStatus.PROCESSING)
    .execute()
  if (results.length > 0) {
    logger.warn(
      `Cleared ${results.length} stuck messages in the SimplBooks outbox with status PROCESSING`,
    )
  }
}
