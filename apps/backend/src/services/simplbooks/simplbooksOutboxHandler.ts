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
  type InvoicePost,
} from './models.ts'
import {
  createNewClient,
  createSimplbooksInvoice,
  getInvoice,
  markInvoiceAsSentInSimplbooks,
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

  const flightInvoicePayload = await createFlightInvoicePayload(flights)

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
