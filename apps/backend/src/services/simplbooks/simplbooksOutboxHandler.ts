import { db } from '../../db/connection.ts'
import logger from '../../lib/logger.ts'
import { InvoiceMemberSchema, MemberSchema } from '../../routes/members/models.ts'
import {
  FeeTypeEnum,
  MIKInvoiceType,
  RecurringFeeType,
  SimplbooksEventType,
  SimplbooksStatus,
  type AcctsOutboxSimplbooks,
  type InvoiceBase,
  type InvoicePost,
  type InvoiceResponse,
  type ReceiptPost,
} from './models.ts'
import {
  createNewClient,
  createSimplbooksInvoice,
  getInvoice,
  markInvoiceAsSentInSimplbooks,
  createSimplbooksReceipt,
} from './simplbooksApiClient.ts'
import {
  createAnnualEquipmentFeeInvoicePayload,
  createAnnualMemberFeeInvoicePayload,
  createAnnualMemberFeeWithEquipmentFeeInvoicePayload,
  createNewMemberFeesInvoicePayload,
} from '../accounting/recurringFeesInvoiceCreator.ts'
import { sendSimplbooksInvoiceEmail } from './simplBooksEmailer.ts'

import {
  setOutboxStatus,
  insertOutboxItem,
  insertMemberAnnualFees,
  updateFlightLogsWithInvoiceNumber,
  insertInvoice,
  updateMemberBillingId,
} from '../../db/outbox-simplbooks-queries.ts'
import type { Transaction } from 'kysely'
import type { DB } from '../../db/schema.js'
import { createFlightInvoicePayload } from '../accounting/flightInvoiceCreator.ts'
import { FlightInvoicePayloadSchema } from '../../routes/flight-log/models.ts'
import { isRecurringFeeAlreadyCreated } from '../accounting/recurringFeesProcessor.ts'

export const MIK_SIMPLBOOKS_MEMBER: string = 'simplbks'
export const MIK_CURRENCY = 'EUR'

export const dispatchOutboxMsg = async (msg: AcctsOutboxSimplbooks) => {
  switch (msg.event_type) {
    case SimplbooksEventType.ADD_MEMBER:
      await addMember(msg)
      break
    case SimplbooksEventType.NEW_MEMBER_FEES:
      await createNewMemberFeesInvoice(msg)
      break
    case SimplbooksEventType.ANNUAL_MEMBERSHIP_FEE:
      await createAnnualMemberFeeInvoice(msg)
      break
    case SimplbooksEventType.EQUIPMENT_INVOICE:
      await createAnnualEquipmentFeeInvoice(msg)
      break
    case SimplbooksEventType.SEND_INVOICE_PDF:
      await createSimplbooksInvoiceEmail(msg)
      break
    case SimplbooksEventType.FLIGHT_INVOICE:
      await createFlightInvoice(msg)
      break
    case SimplbooksEventType.CREDIT_NOTE:
      await createCreditNote(msg)
      break
    default:
      throw new Error(`Unsupported outbox event type: ${msg.event_type}`)
  }
}

export const getCurrentYear = () => new Date().getFullYear()

export function validateFlightsBillableMemberId(
  flights: Array<{ flightId: string; billableMemberId: string }>,
  expectedMemberId: string,
): void {
  const invalidFlights = flights.filter(flight => flight.billableMemberId !== expectedMemberId)

  if (invalidFlights.length > 0) {
    const flightIds = invalidFlights.map(f => f.flightId).join(', ')
    const message = `Flight invoice validation failed: Expected all flights to have billable member ID ${expectedMemberId}, but found ${invalidFlights.length} flight(s) with different billable member IDs. Flight IDs: ${flightIds}`
    logger.error(message, {
      expectedMemberId,
      invalidFlights: invalidFlights.map(f => ({
        flightId: f.flightId,
        billableMemberId: f.billableMemberId,
      })),
    })
    throw new Error(message)
  }
}

async function createNewMemberFeesInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const member = InvoiceMemberSchema.parse(outboxMsg.payload)
  const feeInvoice = await createNewMemberFeesInvoicePayload(member)
  await db.transaction().execute(async txn => {
    await createInvoice(member.memberId, outboxMsg.id, MIKInvoiceType.JOINING_FEE, feeInvoice, txn)
  })
}

async function createAnnualMemberFeeInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const member = InvoiceMemberSchema.parse(outboxMsg.payload)

  const year = getCurrentYear()

  const annualMembershipFeeAlreadyCreated = await isRecurringFeeAlreadyCreated(
    RecurringFeeType.ANNUAL_FEE,
    year,
    member.memberId,
  )
  if (annualMembershipFeeAlreadyCreated) {
    logger.warn(
      `Annual membership fee invoice for year ${year} has already been created for member ${member.memberId}`,
    )
    await db.transaction().execute(async txn => {
      await setOutboxStatus(
        txn,
        outboxMsg.id,
        SimplbooksStatus.SKIPPED,
        `Annual membership fee invoice already exists for member ${member.memberId} for year ${year}, skipping creation.`,
      )
    })
    return
  }

  const equipmentFeealreadyCreated = await isRecurringFeeAlreadyCreated(
    RecurringFeeType.EQUIPMENT_FEE,
    year,
    member.memberId,
  )
  // Check if the memeber has opted for equipment fee renewal at the same time
  const includeEquipmentFee = member.autoRenewEquipmentFee === true && !equipmentFeealreadyCreated

  const feeInvoice = includeEquipmentFee
    ? await createAnnualMemberFeeWithEquipmentFeeInvoicePayload(member)
    : await createAnnualMemberFeeInvoicePayload(member)

  await db.transaction().execute(async txn => {
    // Create invoice entry to db
    const invoiceId = await createInvoice(
      member.memberId,
      outboxMsg.id,
      MIKInvoiceType.ANNUAL_FEE,
      feeInvoice,
      txn,
    )

    //Insert annual fee record
    await insertMemberAnnualFees(txn, {
      memberId: member.memberId,
      feeType: FeeTypeEnum.Values.annual_fee,
      year: year,
      invoiceId: invoiceId,
      createdAt: new Date().toISOString(),
      createdBy: MIK_SIMPLBOOKS_MEMBER,
      updatedAt: new Date().toISOString(),
      updatedBy: MIK_SIMPLBOOKS_MEMBER,
    })

    //Insert equipment fee record if applicable
    includeEquipmentFee &&
      (await insertMemberAnnualFees(txn, {
        memberId: member.memberId,
        feeType: FeeTypeEnum.Values.equipment_fee,
        year: year,
        invoiceId: invoiceId,
        createdAt: new Date().toISOString(),
        createdBy: MIK_SIMPLBOOKS_MEMBER,
        updatedAt: new Date().toISOString(),
        updatedBy: MIK_SIMPLBOOKS_MEMBER,
      }))

    logger.info(
      `Created annual membership fee invoice for ${year} with ID: ${invoiceId} for member: ${member.email}, equipment fee included: ${includeEquipmentFee}`,
    )
  })
}

async function createFlightInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const flights = FlightInvoicePayloadSchema.parse(outboxMsg.payload)
  const billableMemberId = flights.flights[0].billableMemberId

  logger.info(
    `Create invoice for ${flights.flights.length} flight(s) for member: ${billableMemberId}`,
  )

  // Validate that all flights have the same billable member ID
  validateFlightsBillableMemberId(flights.flights, billableMemberId)

  const flightInvoicePayload = await createFlightInvoicePayload(flights, billableMemberId)

  // Extract all flight IDs from the payload
  const flightIds = flights.flights.map(flight => flight.flightId)

  await db.transaction().execute(async txn => {
    const invoiceId = await createInvoice(
      billableMemberId,
      outboxMsg.id,
      MIKInvoiceType.FLIGHT,
      flightInvoicePayload,
      txn,
    )

    // Update all flight logs with the invoice number, multiple flights can be on one invoice
    await updateFlightLogsWithInvoiceNumber(txn, flightIds, invoiceId.toString())

    logger.info(`Created flight invoice with ID: ${invoiceId} for member: ${billableMemberId}`)
  })
}

async function createAnnualEquipmentFeeInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const member = MemberSchema.parse(outboxMsg.payload)
  const year = getCurrentYear()
  const feeInvoicePayload = await createAnnualEquipmentFeeInvoicePayload(member)

  await db.transaction().execute(async txn => {
    const invoiceId = await createInvoice(
      member.memberId,
      outboxMsg.id,
      MIKInvoiceType.EQUIPMENT_FEE,
      feeInvoicePayload,
      txn,
    )

    //Insert equipment fee record
    await insertMemberAnnualFees(txn, {
      memberId: member.memberId,
      feeType: FeeTypeEnum.Values.equipment_fee,
      year: year,
      invoiceId: invoiceId,
      createdAt: new Date().toISOString(),
      createdBy: MIK_SIMPLBOOKS_MEMBER,
      updatedAt: new Date().toISOString(),
      updatedBy: MIK_SIMPLBOOKS_MEMBER,
    })

    logger.info(
      `Created annual equipment fee invoice for ${year} with ID: ${invoiceId} for member: ${member.email}`,
    )
  })
}

async function createSimplbooksInvoiceEmail(outboxMsg: AcctsOutboxSimplbooks) {
  const { memberId, invoiceId } = outboxMsg.payload as any
  await sendInvoiceEmail(memberId, invoiceId, outboxMsg.id)
}

async function sendInvoiceEmail(memberId: string, invoiceId: number, outboxMsgId: string) {
  try {
    await db.transaction().execute(async txn => {
      // Mark the outbox message as processed
      await setOutboxStatus(txn, outboxMsgId, SimplbooksStatus.SYNCED)

      // Update our local invoice record to mark it as sent
      const result = await txn
        .updateTable('accts.invoice')
        .set({
          sent_at: new Date().toISOString().split('T')[0], // 'YYYY-MM-DD' format
          updated_at: new Date(),
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', invoiceId.toString())
        .where('member_id', '=', memberId)
        .execute()

      if (result.length !== 1 || result[0].numUpdatedRows !== BigInt(1)) {
        throw new Error(
          `Expected to update exactly 1 invoice, but updated ${result[0]?.numUpdatedRows ?? 0} rows for invoice ${invoiceId}`,
        )
      }
      // Send the email first - if this fails, we don't update the database
      await sendSimplbooksInvoiceEmail(invoiceId, memberId)

      // Mark the invoice as sent in SimplBooks, if this fails the DB transaction will be rolled back
      await markInvoiceAsSentInSimplbooks(invoiceId)
      logger.info(`Marked invoice ${invoiceId} as sent in SimplBooks`)
    })
  } catch (error) {
    logger.error(
      `Failed to update database or mark invoice as sent in SimplBooks for invoice ${invoiceId}`,
      error,
    )
    throw error
  }
}

async function createInvoice(
  memberId: string,
  outboxMsgId: string,
  invoiceType: MIKInvoiceType,
  payload: InvoicePost,
  txn: Transaction<DB>,
): Promise<number> {
  // Create the invoice
  const retval = await createSimplbooksInvoice(payload)

  //Read back the created invoice - we need to do this in order to get e.g. total sum
  const createdInvoice = await getInvoice(retval.inserted_id)
  const invoiceData = createdInvoice.data.Invoice

  await insertInvoice(txn, memberId, invoiceType, invoiceData, MIK_CURRENCY)

  //Insert pdf dispatch row to outbox
  await insertOutboxItem(
    SimplbooksEventType.SEND_INVOICE_PDF,
    {
      memberId: memberId,
      invoiceId: invoiceData.id!,
    },
    txn,
  )
  //Mark as processed
  await setOutboxStatus(txn, outboxMsgId, SimplbooksStatus.SYNCED)

  return invoiceData.id!
}

async function addMember(outboxMsg: AcctsOutboxSimplbooks) {
  // Extract the member data from the outbox message, validate it, and create a new client in SimplBooks
  const member = MemberSchema.parse(outboxMsg.payload)

  const clientId = await createNewClient(member)
  logger.info(`Created new SimplBooks client with ID: ${clientId} for member: ${member.email}`)

  await db.transaction().execute(async txn => {
    // Set the billing id in our DB - which is the returned SimplBooks client id
    await updateMemberBillingId(txn, member.memberId, clientId.toString())

    // We add the create invoice action to the outbox, this will allow us to handle the situation
    // where the client id is created but invoice creation fails - now its async and decoupled
    await insertOutboxItem(SimplbooksEventType.NEW_MEMBER_FEES, {
      ...member,
      billingId: clientId.toString(),
      txn,
    })

    await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
  })
}

export function buildCreditNotePayload(
  originalInvoice: InvoiceResponse,
  simplbooksInvoiceId: string,
  reason: string,
): InvoicePost {
  return {
    Invoice: {
      client_id: originalInvoice.data.Invoice.client_id,
      credit_invoice_for: Number(simplbooksInvoiceId), // Link to original invoice
      sent: new Date().toISOString().split('T')[0], // Mark as sent
      additional_info: `Credit note for invoice ${simplbooksInvoiceId}. Reason: ${reason}`,
    },
    Tasks: originalInvoice.data.Task.map(invoiceTask => {
      // Extract task data without the embedded Projects array
      const { Projects, ...taskData } = invoiceTask

      return {
        Task: {
          ...taskData,
          id: undefined, // Remove task ID
          worker: undefined, // Remove worker assignment
          price_per_unit: invoiceTask.price_per_unit ? -invoiceTask.price_per_unit : 0, // Negate the amount for credit
        },
        // Always include Projects array, default to empty array if not present
        Projects: Projects || [],
      }
    }),
  }
}

export function buildReceiptPayload(invoice: InvoiceBase): ReceiptPost {
  const { id, total_sum, created, client_id, number } = invoice

  if (total_sum === undefined || total_sum === null) {
    throw new Error(`Cannot build receipt: invoice is missing total_sum`)
  }
  if (!created) {
    throw new Error(`Cannot build receipt: invoice is missing created date`)
  }
  if (client_id === undefined || client_id === null) {
    throw new Error(`Cannot build receipt: invoice is missing client_id`)
  }

  return {
    Incoming: {
      income_sum: total_sum,
      income_date: created,
      description: number ? `Invoice no. ${number}` : `Invoice ${id ?? ''}`,
      income_account_id: Number(process.env.SIMPLBOOKS_CREDIT_NOTE_INCOME_ACCT_ID) || 5, // Default to 5 if not set
      client_id,
    },
    invoice_id: id,
  }
}

// This function creates a credit note in SimplBooks for a given invoice. It retrieves the original invoice,
// creates a new invoice with negative amounts, and links it to the original invoice as a credit note.
// For Simplbooks to handle the credit note correctly we must also generate receipts for both invoices,
// and bind those to the invoices , the invoices must also be marked as sent in Simplbooks.
async function createCreditNote(outboxMsg: AcctsOutboxSimplbooks) {
  const payload = outboxMsg.payload as {
    memberId: string
    invoiceId: string
    simplbooksInvoiceId: string
    reason: string
  }

  try {
    // Get the original invoice from SimplBooks
    const originalInvoice = await getInvoice(Number(payload.simplbooksInvoiceId))

    // Create a credit note invoice by copying the original but with negative amounts
    const creditNotePayload = buildCreditNotePayload(
      originalInvoice,
      payload.simplbooksInvoiceId,
      payload.reason,
    )

    // Create the credit note in SimplBooks
    const result = await createSimplbooksInvoice(creditNotePayload)
    logger.info(
      `Created credit note ${result.inserted_id} for invoice ${payload.simplbooksInvoiceId}`,
    )

    // We need to load the created credit note invoice so that we can create receipts for it
    // SimplBooks requires a receipt for the credit note to properly link it to the original invoice
    // and handle the crediting correctly
    const creditNoteInvoiceId = result.inserted_id
    const creditNoteInvoice = await getInvoice(creditNoteInvoiceId)

    logger.info(
      `Loaded created credit note invoice ${creditNoteInvoiceId} for original invoice ${payload.simplbooksInvoiceId}`,
    )

    // Create receipt for Original Invoice
    const originalInvoiceReceiptPayload = buildReceiptPayload(originalInvoice.data.Invoice)
    const originalInvoiceReceiptResponse = await createSimplbooksReceipt(
      originalInvoiceReceiptPayload,
    )

    logger.info(
      `Created receipt ${originalInvoiceReceiptResponse.inserted_id} for original invoice ${payload.simplbooksInvoiceId}`,
    )

    // Create receipt for Credit Note
    const creditNoteReceiptPayload = buildReceiptPayload(creditNoteInvoice.data.Invoice)
    const creditNoteReceiptResponse = await createSimplbooksReceipt(creditNoteReceiptPayload)
    logger.info(
      `Created receipt ${creditNoteReceiptResponse.inserted_id} for credit note invoice ${creditNoteInvoiceId}`,
    )

    // Mark invoice as credited in our database
    await db.transaction().execute(async txn => {
      await txn
        .updateTable('accts.invoice')
        .set({
          updated_at: new Date(),
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', payload.invoiceId)
        .execute()

      await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
    })
  } catch (error) {
    logger.error(`Failed to create credit note for invoice ${payload.simplbooksInvoiceId}`, error)
    await db.transaction().execute(async txn => {
      await setOutboxStatus(
        txn,
        outboxMsg.id,
        SimplbooksStatus.FAILED,
        `Failed to create credit note: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    })
    throw error
  }
}
