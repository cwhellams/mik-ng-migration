import { db } from '../../db/connection.ts'
import logger from '../../lib/logger.ts'
import { InvoiceMemberSchema, MemberSchema } from '../../routes/members/models.ts'
import {
  FeeTypeEnum,
  mapMemberToClient,
  MIKInvoiceType,
  RecurringFeeType,
  ShopOrderInvoicePayloadSchema,
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
  updateClient,
  findClientByEmail,
  getItemByCode,
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
import { sendDryRunInvoiceEmail, sendSimplbooksInvoiceEmail } from './simplBooksEmailer.ts'
import { isDryRunEnabled, generateDryRunInvoiceId, type DryRunTask } from './simplbooksDryRun.ts'

import {
  setOutboxStatus,
  insertOutboxItem,
  insertMemberAnnualFees,
  updateFlightLogsWithInvoiceNumber,
  insertInvoice,
  updateMemberBillingId,
  getNextCreditNoteSequenceNumber,
} from '../../db/outbox-simplbooks-queries.ts'
import type { Transaction } from 'kysely'
import type { DB } from '../../db/schema.js'
import { createPlannedFlightInvoicePayload } from '../accounting/flightInvoiceCreator.ts'
import { FlightInvoicePayloadSchema } from '../../routes/flight-log/models.ts'
import { isRecurringFeeAlreadyCreated } from '../accounting/recurringFeesProcessor.ts'
import { SimplbooksApiError } from './simplbooksErrorHandler.ts'
import { z } from 'zod'
import { applyPrepaidFlightUsagePlan } from '../accounting/flightPrepaidAllocator.ts'

export const MIK_SIMPLBOOKS_MEMBER: string = 'simplbks'
export const MIK_CURRENCY = 'EUR'

export const dispatchOutboxMsg = async (msg: AcctsOutboxSimplbooks) => {
  try {
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
      case SimplbooksEventType.SHOP_ORDER_INVOICE:
        await createShopOrderInvoice(msg)
        break
      case SimplbooksEventType.CREDIT_NOTE:
        await createCreditNote(msg)
        break
      default:
        throw new Error(`Unsupported outbox event type: ${msg.event_type}`)
    }
  } catch (error) {
    if (error instanceof SimplbooksApiError) {
      logger.error(
        `SimplBooks dispatch failed for outbox event ${msg.event_type} (${msg.id}) at ${error.method} ${error.endpoint}`,
      )
    }

    throw error
  }
}

export const getCurrentYear = () => new Date().getFullYear()

export function validateFlightsBillableMemberId(
  flights: Array<{ flightId: string; billableMemberId: string }>,
  expectedMemberId: string,
): void {
  const invalidFlights = flights.filter((flight) => flight.billableMemberId !== expectedMemberId)

  if (invalidFlights.length > 0) {
    const flightIds = invalidFlights.map((f) => f.flightId).join(', ')
    const message = `Flight invoice validation failed: Expected all flights to have billable member ID ${expectedMemberId}, but found ${invalidFlights.length} flight(s) with different billable member IDs. Flight IDs: ${flightIds}`
    logger.error(message, {
      expectedMemberId,
      invalidFlights: invalidFlights.map((f) => ({
        flightId: f.flightId,
        billableMemberId: f.billableMemberId,
      })),
    })
    throw new Error(message)
  }
}

async function createNewMemberFeesInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const member = InvoiceMemberSchema.parse(outboxMsg.payload)
  const year = getCurrentYear()

  // Guard against duplicate/out-of-order processing: if the annual_fee row already exists
  // for this member+year the invoice has already been created successfully. Skip before
  // making any call to SimplBooks so no duplicate invoice is created there.
  const annualFeeAlreadyCreated = await isRecurringFeeAlreadyCreated(
    RecurringFeeType.ANNUAL_FEE,
    year,
    member.memberId,
  )
  if (annualFeeAlreadyCreated) {
    logger.warn(
      `Annual membership fee (via joining fee invoice) for year ${year} has already been created for member ${member.memberId}`,
    )
    await db.transaction().execute(async (txn) => {
      await setOutboxStatus(
        txn,
        outboxMsg.id,
        SimplbooksStatus.SKIPPED,
        `Annual membership fee (via joining fee invoice) already exists for member ${member.memberId} for year ${year}, skipping creation.`,
      )
    })
    return
  }

  const feeInvoice = await createNewMemberFeesInvoicePayload(
    member,
    outboxMsg.created_at_utc ? new Date(outboxMsg.created_at_utc) : new Date(),
  )
  await db.transaction().execute(async (txn) => {
    const invoiceId = await createInvoice(
      member.memberId,
      outboxMsg.id,
      MIKInvoiceType.JOINING_FEE,
      feeInvoice,
      txn,
    )

    // The joining fee invoice also covers the annual membership fee for the current year,
    // so we record it in annual_fees to ensure it is eligible for a credit note if the
    // member is deactivated before paying.
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
    await db.transaction().execute(async (txn) => {
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
  // Check if the member has opted for equipment fee renewal at the same time
  const includeEquipmentFee = member.autoRenewEquipmentFee === true && !equipmentFeealreadyCreated

  const outboxDate = outboxMsg.created_at_utc ? new Date(outboxMsg.created_at_utc) : new Date()
  const feeInvoice = includeEquipmentFee
    ? await createAnnualMemberFeeWithEquipmentFeeInvoicePayload(member, outboxDate)
    : await createAnnualMemberFeeInvoicePayload(member)

  await db.transaction().execute(async (txn) => {
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

  // Extract all flight IDs from the payload
  const flightIds = flights.flights.map((flight) => flight.flightId)

  await db.transaction().execute(async (txn) => {
    const { invoice: flightInvoicePayload, prepaidUsagePlan } =
      await createPlannedFlightInvoicePayload(flights, billableMemberId, {
        executor: txn,
        lockPrepaidRows: true,
      })

    const invoiceId = await createInvoice(
      billableMemberId,
      outboxMsg.id,
      MIKInvoiceType.FLIGHT,
      flightInvoicePayload,
      txn,
    )

    await applyPrepaidFlightUsagePlan(prepaidUsagePlan, invoiceId, txn)

    // Update all flight logs with the invoice number, multiple flights can be on one invoice
    await updateFlightLogsWithInvoiceNumber(txn, flightIds, invoiceId.toString())

    logger.info(`Created flight invoice with ID: ${invoiceId} for member: ${billableMemberId}`)
  })
}

async function createAnnualEquipmentFeeInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const member = MemberSchema.parse(outboxMsg.payload)
  const year = getCurrentYear()
  const feeInvoicePayload = await createAnnualEquipmentFeeInvoicePayload(
    member,
    outboxMsg.created_at_utc ? new Date(outboxMsg.created_at_utc) : new Date(),
  )

  await db.transaction().execute(async (txn) => {
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

const ShopOrderRowSchema = z
  .object({
    order_id: z.string(),
    member_id: z.string(),
    invoice_id: z.string().nullable(),
    billing_id: z.string().nullable(),
  })
  .strict()

type ShopOrderRow = z.infer<typeof ShopOrderRowSchema>

const ShopOrderItemRowSchema = z
  .object({
    quantity: z.number().int().positive(),
    unit_price: z.union([z.string(), z.number()]),
    product_snapshot: z.unknown(),
    simplbooks_item_id: z.string().nullable(),
  })
  .strict()

type ShopOrderItemRow = z.infer<typeof ShopOrderItemRowSchema>

function extractLocalizedName(nameValue: unknown): string | undefined {
  if (!nameValue || typeof nameValue !== 'object') {
    return undefined
  }

  const localized = nameValue as Record<string, unknown>
  const preferred = [localized.fi, localized.en, ...Object.values(localized)].find(
    (value) => typeof value === 'string' && value.trim() !== '',
  )

  return typeof preferred === 'string' ? preferred : undefined
}

function parseProductSnapshot(value: unknown): {
  simplbooksItemId?: string
  name?: string
  description?: string
} {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const snapshot = value as Record<string, unknown>
  const simplbooksItemId =
    typeof snapshot.simplbooksItemId === 'string' ? snapshot.simplbooksItemId : undefined
  const name = extractLocalizedName(snapshot.name)
  const description = extractLocalizedName(snapshot.description)

  return { simplbooksItemId, name, description }
}

async function resolveArticleId(item: ShopOrderItemRow): Promise<number> {
  const snapshot = parseProductSnapshot(item.product_snapshot)
  const simplbooksRef = (item.simplbooks_item_id ?? snapshot.simplbooksItemId ?? '').trim()

  if (!simplbooksRef) {
    throw new Error('Order item has no SimplBooks item reference')
  }

  const numericId = Number.parseInt(simplbooksRef, 10)
  if (!Number.isNaN(numericId)) {
    return numericId
  }

  const article = await getItemByCode(simplbooksRef)
  if (!article?.id) {
    throw new Error(`Could not resolve SimplBooks article for code '${simplbooksRef}'`)
  }

  return article.id
}

async function createShopOrderInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const payload = ShopOrderInvoicePayloadSchema.parse(outboxMsg.payload)

  const orderRow = await db
    .selectFrom('shop.orders as o')
    .leftJoin('member.register as m', 'm.member_id', 'o.member_id')
    .select(['o.order_id', 'o.member_id', 'o.invoice_id', 'm.billing_id'])
    .where('o.order_id', '=', payload.orderId)
    .executeTakeFirst()

  const order: ShopOrderRow | undefined = orderRow ? ShopOrderRowSchema.parse(orderRow) : undefined

  if (!order) {
    throw new Error(`Shop order ${payload.orderId} not found`)
  }

  if (order.invoice_id) {
    await db.transaction().execute(async (txn) => {
      await setOutboxStatus(
        txn,
        outboxMsg.id,
        SimplbooksStatus.SKIPPED,
        `Order ${payload.orderId} already has invoice ${order.invoice_id}`,
      )
    })
    return
  }

  if (!order.billing_id) {
    throw new Error(`Cannot invoice order ${payload.orderId}: member has no billing ID`)
  }

  const clientId = Number.parseInt(order.billing_id, 10)
  if (Number.isNaN(clientId)) {
    throw new TypeError(
      `Invalid member billing ID '${order.billing_id}' for order ${payload.orderId}`,
    )
  }

  const itemRows = await db
    .selectFrom('shop.order_items as oi')
    .leftJoin('shop.products as p', 'p.product_id', 'oi.product_id')
    .select(['oi.quantity', 'oi.unit_price', 'oi.product_snapshot', 'p.simplbooks_item_id'])
    .where('oi.order_id', '=', payload.orderId)
    .execute()

  const items = z.array(ShopOrderItemRowSchema).parse(itemRows)

  if (items.length === 0) {
    throw new Error(`Cannot invoice order ${payload.orderId}: no order items found`)
  }

  const tasks = await Promise.all(
    items.map(async (item) => {
      const snapshot = parseProductSnapshot(item.product_snapshot)
      const namePart = snapshot.name ?? `Shop order ${payload.orderId}`
      const contents = snapshot.description ? `${namePart}\n${snapshot.description}` : namePart

      return {
        Task: {
          article_id: await resolveArticleId(item),
          amount: item.quantity,
          price_per_unit: Number(item.unit_price),
          contents,
        },
        Projects: [],
      }
    }),
  )

  const invoicePayload: InvoicePost = {
    Invoice: {
      client_id: clientId,
      additional_info: `Shop order ${payload.orderId}`,
    },
    Tasks: tasks,
  }

  await db
    .updateTable('shop.orders')
    .set({ status: 'PROCESSING', updated_at: new Date(), updated_by: MIK_SIMPLBOOKS_MEMBER })
    .where('order_id', '=', payload.orderId)
    .execute()

  await db.transaction().execute(async (txn) => {
    const invoiceId = await createInvoice(
      order.member_id,
      outboxMsg.id,
      MIKInvoiceType.SHOP_ORDER,
      invoicePayload,
      txn,
    )

    await txn
      .updateTable('shop.orders')
      .set({
        invoice_id: invoiceId.toString(),
        status: 'INVOICED',
        updated_at: new Date(),
        updated_by: MIK_SIMPLBOOKS_MEMBER,
      })
      .where('order_id', '=', payload.orderId)
      .execute()

    logger.info(
      `Created SimplBooks invoice ${invoiceId} for shop order ${payload.orderId} and member ${order.member_id}`,
    )
  })
}

async function createSimplbooksInvoiceEmail(outboxMsg: AcctsOutboxSimplbooks) {
  const { memberId, invoiceId, dryRunTasks } = outboxMsg.payload as {
    memberId: string
    invoiceId: number
    dryRunTasks?: DryRunTask[]
  }
  await sendInvoiceEmail(memberId, invoiceId, outboxMsg.id, dryRunTasks)
}

async function sendInvoiceEmail(
  memberId: string,
  invoiceId: number,
  outboxMsgId: string,
  dryRunTasks?: DryRunTask[],
) {
  try {
    await db.transaction().execute(async (txn) => {
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

      if (isDryRunEnabled()) {
        // Dry-run: send email with invoice rows from the outbox payload;
        // skip the SimplBooks PDF fetch and the "mark as sent" API call.
        logger.info(`[DRY RUN] Sending dry-run invoice email for invoice ${invoiceId}`)
        await sendDryRunInvoiceEmail(invoiceId, memberId, dryRunTasks ?? [])
        return
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
  if (isDryRunEnabled()) {
    return createDryRunInvoice(memberId, outboxMsgId, invoiceType, payload, txn)
  }

  // Create the invoice in Simplbooks
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

/**
 * Dry-run version of createInvoice.
 * Builds a synthetic invoice record from the payload without calling SimplBooks.
 * Stores the invoice tasks in the SEND_INVOICE_PDF outbox payload so the email
 * sender can render the line-item table without any API calls.
 */
async function createDryRunInvoice(
  memberId: string,
  outboxMsgId: string,
  invoiceType: MIKInvoiceType,
  payload: InvoicePost,
  txn: Transaction<DB>,
): Promise<number> {
  const fakeId = generateDryRunInvoiceId()
  const now = new Date()
  const totalSum = payload.Tasks.reduce((sum, t) => {
    const subtotal = (t.Task.amount ?? 0) * (t.Task.price_per_unit ?? 0)
    const discountFactor = 1 - (t.Task.discount ?? 0) / 100
    return sum + subtotal * discountFactor
  }, 0)
  const due = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10)

  const invoiceData = {
    id: fakeId,
    client_id: payload.Invoice.client_id,
    total_sum: totalSum,
    currency_name: MIK_CURRENCY,
    due,
    created: now.toISOString().slice(0, 10),
    additional_info: payload.Invoice.additional_info ?? '',
  }

  logger.info(
    `[DRY RUN] Skipping SimplBooks invoice creation — fake invoice ID ${fakeId}, total €${totalSum.toFixed(2)}`,
  )

  await insertInvoice(txn, memberId, invoiceType, invoiceData, MIK_CURRENCY)

  // Carry task data in the outbox payload so the email can render the item table.
  await insertOutboxItem(
    SimplbooksEventType.SEND_INVOICE_PDF,
    {
      memberId,
      invoiceId: fakeId,
      dryRunTasks: payload.Tasks.map((t) => t.Task),
    },
    txn,
  )

  await setOutboxStatus(txn, outboxMsgId, SimplbooksStatus.SYNCED)

  return fakeId
}

async function addMember(outboxMsg: AcctsOutboxSimplbooks) {
  // Extract the member data from the outbox message, validate it, and create a new client in SimplBooks
  const member = MemberSchema.parse(outboxMsg.payload)

  if (isDryRunEnabled()) {
    // Assign a fake billing ID without touching SimplBooks.
    const fakeBillingId = generateDryRunInvoiceId().toString()
    logger.info(
      `[DRY RUN] Skipping SimplBooks client creation for member ${member.memberId} — fake billing ID: ${fakeBillingId}`,
    )
    await db.transaction().execute(async (txn) => {
      await updateMemberBillingId(txn, member.memberId, fakeBillingId)
      await insertOutboxItem(
        SimplbooksEventType.NEW_MEMBER_FEES,
        {
          ...member,
          billingId: fakeBillingId,
        },
        txn,
      )
      await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
    })
    return
  }

  // Check whether a client with this email already exists in SimplBooks.
  // This can happen if the member was previously registered or if a duplicate
  // outbox message is processed. If found, update the existing record instead
  // of creating a new one (which would fail with a duplicate-email error).
  let clientId: number
  const existingClientId = await findClientByEmail(member.email)
  if (existingClientId === null) {
    clientId = await createNewClient(member)
    logger.info(`Created new SimplBooks client with ID: ${clientId} for member: ${member.email}`)
  } else {
    logger.warn(
      `SimplBooks client already exists for email ${member.email} (id: ${existingClientId}). Updating existing client instead of creating a new one.`,
    )
    const clientData = mapMemberToClient(member)
    await updateClient(existingClientId, clientData)
    clientId = existingClientId
  }

  await db.transaction().execute(async (txn) => {
    // Set the billing id in our DB - which is the returned SimplBooks client id
    await updateMemberBillingId(txn, member.memberId, clientId.toString())

    // Queue the new member fees invoice — honorary members receive a full-discount invoice
    await insertOutboxItem(
      SimplbooksEventType.NEW_MEMBER_FEES,
      {
        ...member,
        billingId: clientId.toString(),
      },
      txn,
    )

    await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
  })
}

export async function buildCreditNotePayload(
  originalInvoice: InvoiceResponse,
  simplbooksInvoiceId: string,
  reason: string,
): Promise<InvoicePost> {
  return {
    Invoice: {
      number: await getNextCreditNoteSequenceNumber(), // Get next credit note number from sequence
      client_id: originalInvoice.data.Invoice.client_id,
      credit_invoice_for: Number(simplbooksInvoiceId), // Link to original invoice
      sent: new Date().toISOString().split('T')[0], // Mark as sent
      additional_info: `Credit note for invoice ${simplbooksInvoiceId}. Reason: ${reason}`,
      due: new Date().toISOString().split('T')[0], // Due immediately
    },
    Tasks: originalInvoice.data.Task.map((invoiceTask) => {
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
    const creditNotePayload = await buildCreditNotePayload(
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

    // Create receipt for Original Invoice if its not marked paid
    if (!originalInvoice.data.Invoice.paid || originalInvoice.data.Invoice.paid === '0000-00-00') {
      await markInvoiceAsSentInSimplbooks(Number(payload.simplbooksInvoiceId))
      const originalInvoiceReceiptPayload = buildReceiptPayload(originalInvoice.data.Invoice)
      const originalInvoiceReceiptResponse = await createSimplbooksReceipt(
        originalInvoiceReceiptPayload,
      )
      logger.info(
        `Created receipt ${originalInvoiceReceiptResponse.inserted_id} for original invoice ${payload.simplbooksInvoiceId}`,
      )
    }

    // Create receipt for Credit Note
    const creditNoteReceiptPayload = buildReceiptPayload(creditNoteInvoice.data.Invoice)
    const creditNoteReceiptResponse = await createSimplbooksReceipt(creditNoteReceiptPayload)
    logger.info(
      `Created receipt ${creditNoteReceiptResponse.inserted_id} for credit note invoice ${creditNoteInvoiceId}`,
    )

    // Mark invoice as credited in our database
    await db.transaction().execute(async (txn) => {
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
    await db.transaction().execute(async (txn) => {
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
