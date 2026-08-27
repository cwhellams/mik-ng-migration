import { db } from '../../db/connection.ts'
import { updateExpenseSimplbooksId, getExpenseClaimById } from '../../db/expense-queries.ts'
import { getMemberById } from '../../db/member-queries.ts'
import logger from '../../lib/logger.ts'
import { storageService } from '../storage.ts'
import { mergeAttachmentsToPdf } from '../../util/mergeAttachmentsToPdf.ts'
import { InvoiceMemberSchema, MemberSchema } from '@mik/contracts/members'
import {
  FeeTypeEnum,
  mapMemberToClient,
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
import { MIKInvoiceType } from '@mik/contracts/invoicing'
import {
  createNewClient,
  updateClient,
  findClientByEmail,
  getItemByCode,
  createSimplbooksInvoice,
  createSimplbooksPurchase,
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
import type { DB } from '../../db/schema.d.ts'
import { createPlannedFlightInvoicePayload } from '../accounting/flightInvoiceCreator.ts'
import { FlightInvoicePayloadSchema } from '@mik/contracts/flight-log'
import { isRecurringFeeAlreadyCreated } from '../accounting/recurringFeesProcessor.ts'
import { SimplbooksApiError } from './simplbooksErrorHandler.ts'
import { z } from 'zod'
import { applyPrepaidFlightUsagePlan } from '../accounting/flightPrepaidAllocator.ts'

export const MIK_SIMPLBOOKS_MEMBER: string = 'simplbks'
export const MIK_CURRENCY = 'EUR'

export const dispatchOutboxMsg = async (msg: AcctsOutboxSimplbooks) => {
  try {
    switch (msg.eventType) {
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
      case SimplbooksEventType.REIMBURSEMENT:
        await createExpenseReimbursement(msg)
        break
      case SimplbooksEventType.CLUB_FUEL_RECOVERY:
        await createClubFuelRecoveryInvoice(msg)
        break
      default:
        throw new Error(`Unsupported outbox event type: ${msg.eventType}`)
    }
  } catch (error) {
    if (error instanceof SimplbooksApiError) {
      logger.error(
        `SimplBooks dispatch failed for outbox event ${msg.eventType} (${msg.id}) at ${error.method} ${error.endpoint}`,
      )
    }

    throw error
  }
}

const ExpenseReimbursementPayloadSchema = z.object({
  claimId: z.string().guid(),
  number: z.string(),
  memberId: z.string(),
  categoryCode: z.string(),
  aircraftRegistration: z.string().optional(),
  currency: z.string().default('EUR'),
  fxRate: z.number().nullable().optional(),
  transactionDate: z.string().optional(),
  // The claim's submit date — used as SimplBooks' accounting/bookkeeping date
  // (transaction_date), since it's always recent and so never falls inside an
  // already-locked accounting period, unlike a member-entered expense date which can
  // be arbitrarily old (issue #1071).
  submittedAt: z.string().optional(),
  due: z.string().optional(),
  claimIban: z.string().optional(),
  claimTitle: z.string().optional(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      totalCost: z.number().nullable().optional(),
      articleId: z.number().nullable().optional(),
      code: z.string().optional(),
      costCentreCode: z.string().nullable().optional(),
    }),
  ),
})

const formatSimplbooksDate = (value: Date): string => value.toISOString().slice(0, 10)

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
    outboxMsg.createdAtUtc ? new Date(outboxMsg.createdAtUtc) : new Date(),
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
      feeType: FeeTypeEnum.enum.annual_fee,
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

  const outboxDate = outboxMsg.createdAtUtc ? new Date(outboxMsg.createdAtUtc) : new Date()
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
      feeType: FeeTypeEnum.enum.annual_fee,
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
        feeType: FeeTypeEnum.enum.equipment_fee,
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
    outboxMsg.createdAtUtc ? new Date(outboxMsg.createdAtUtc) : new Date(),
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
      feeType: FeeTypeEnum.enum.equipment_fee,
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
    orderId: z.string(),
    memberId: z.string(),
    invoiceId: z.string().nullable(),
    billingId: z.string().nullable(),
  })
  .strict()

type ShopOrderRow = z.infer<typeof ShopOrderRowSchema>

const ShopOrderItemRowSchema = z
  .object({
    quantity: z.number().int().positive(),
    unitPrice: z.union([z.string(), z.number()]),
    productSnapshot: z.unknown(),
    simplbooksItemId: z.string().nullable(),
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
  const snapshot = parseProductSnapshot(item.productSnapshot)
  const simplbooksRef = (item.simplbooksItemId ?? snapshot.simplbooksItemId ?? '').trim()

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
    .leftJoin('member.register as m', 'm.memberId', 'o.memberId')
    .select(['o.orderId', 'o.memberId', 'o.invoiceId', 'm.billingId'])
    .where('o.orderId', '=', payload.orderId)
    .executeTakeFirst()

  const order: ShopOrderRow | undefined = orderRow ? ShopOrderRowSchema.parse(orderRow) : undefined

  if (!order) {
    throw new Error(`Shop order ${payload.orderId} not found`)
  }

  if (order.invoiceId) {
    await db.transaction().execute(async (txn) => {
      await setOutboxStatus(
        txn,
        outboxMsg.id,
        SimplbooksStatus.SKIPPED,
        `Order ${payload.orderId} already has invoice ${order.invoiceId}`,
      )
    })
    return
  }

  if (!order.billingId) {
    throw new Error(`Cannot invoice order ${payload.orderId}: member has no billing ID`)
  }

  const clientId = Number.parseInt(order.billingId, 10)
  if (Number.isNaN(clientId)) {
    throw new TypeError(
      `Invalid member billing ID '${order.billingId}' for order ${payload.orderId}`,
    )
  }

  const itemRows = await db
    .selectFrom('shop.orderItems as oi')
    .leftJoin('shop.products as p', 'p.productId', 'oi.productId')
    .select(['oi.quantity', 'oi.unitPrice', 'oi.productSnapshot', 'p.simplbooksItemId'])
    .where('oi.orderId', '=', payload.orderId)
    .execute()

  const items = z.array(ShopOrderItemRowSchema).parse(itemRows)

  if (items.length === 0) {
    throw new Error(`Cannot invoice order ${payload.orderId}: no order items found`)
  }

  const tasks = await Promise.all(
    items.map(async (item) => {
      const snapshot = parseProductSnapshot(item.productSnapshot)
      const namePart = snapshot.name ?? `Shop order ${payload.orderId}`
      const contents = snapshot.description ? `${namePart}\n${snapshot.description}` : namePart

      return {
        Task: {
          article_id: await resolveArticleId(item),
          amount: item.quantity,
          price_per_unit: Number(item.unitPrice),
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
    .set({ status: 'PROCESSING', updatedAt: new Date(), updatedBy: MIK_SIMPLBOOKS_MEMBER })
    .where('orderId', '=', payload.orderId)
    .execute()

  await db.transaction().execute(async (txn) => {
    const invoiceId = await createInvoice(
      order.memberId,
      outboxMsg.id,
      MIKInvoiceType.SHOP_ORDER,
      invoicePayload,
      txn,
    )

    await txn
      .updateTable('shop.orders')
      .set({
        invoiceId: invoiceId.toString(),
        status: 'INVOICED',
        updatedAt: new Date(),
        updatedBy: MIK_SIMPLBOOKS_MEMBER,
      })
      .where('orderId', '=', payload.orderId)
      .execute()

    logger.info(
      `Created SimplBooks invoice ${invoiceId} for shop order ${payload.orderId} and member ${order.memberId}`,
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
          sentAt: new Date().toISOString().split('T')[0], // 'YYYY-MM-DD' format
          updatedAt: new Date(),
          updatedBy: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('id', '=', invoiceId.toString())
        .where('memberId', '=', memberId)
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
      // Extract task data without the embedded Projects array. `code` is also dropped:
      // it's a field SimplBooks echoes back on Get responses, not one the
      // /invoices/create request accepts (see TaskPostSchema in models.ts).
      const { Projects, code, ...taskData } = invoiceTask
      void code

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
async function createExpenseReimbursement(outboxMsg: AcctsOutboxSimplbooks) {
  const payload = ExpenseReimbursementPayloadSchema.parse(outboxMsg.payload)

  try {
    if (isDryRunEnabled()) {
      logger.info(`DRY RUN: Would create SimplBooks purchase for claim ${payload.claimId}`)
      await db.transaction().execute(async (txn) => {
        await updateExpenseSimplbooksId(payload.claimId, generateDryRunInvoiceId(), txn)
        await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
      })
      return
    }

    const member = await getMemberById(payload.memberId)
    const today = formatSimplbooksDate(new Date())

    // Sync bank account to SimplBooks client when the claim's IBAN differs from
    // the member's profile IBAN (or when the member has no profile IBAN).
    if (payload.claimIban && member?.billingId && /^\d+$/.test(member.billingId)) {
      const profileIban = member.iban ?? null
      if (payload.claimIban !== profileIban) {
        logger.info(
          `Updating SimplBooks client ${member.billingId} account_no for member ${payload.memberId} (claim IBAN differs from profile)`,
        )
        const clientData = mapMemberToClient(member, payload.claimIban)
        await updateClient(Number(member.billingId), clientData)
      }
    }

    // Fetch the receipt to attach to the purchase — SimplBooks only accepts one
    // attachment, so a claim with multiple attachments (issue #955) gets them merged
    // into a single PDF; older claims fall back to the legacy singular receipt.
    const receiptBucket = process.env.EXPENSE_RECEIPT_BUCKET ?? 'mik-expense-receipts'
    let fileType: 'pdf' | 'png' | 'jpg' | 'jpeg' | undefined
    let fileContents: string | undefined
    try {
      const claim = await getExpenseClaimById(payload.claimId)
      if (claim?.attachments?.length) {
        const files = await Promise.all(
          claim.attachments.map(async (attachment) => ({
            buffer: await storageService.downloadFile(attachment.storageKey, receiptBucket),
            mimeType: attachment.mimeType,
          })),
        )
        const merged = await mergeAttachmentsToPdf(files)
        fileType = 'pdf'
        fileContents = merged.toString('base64')
      } else if (claim?.receipt) {
        const receipt = claim.receipt
        const fileBuffer = await storageService.downloadFile(receipt.storageKey, receiptBucket)
        fileType =
          receipt.mimeType === 'application/pdf'
            ? 'pdf'
            : receipt.mimeType === 'image/png'
              ? 'png'
              : receipt.mimeType === 'image/jpeg'
                ? 'jpg'
                : undefined
        fileContents = fileBuffer.toString('base64')
      }
    } catch (receiptError) {
      logger.warn(`Could not attach receipt to purchase for claim ${payload.claimId}`, receiptError)
    }

    // SimplBooks only supports EUR — always send EUR amounts.
    // If the claim was in a foreign currency, convert each line item sum using the stored FX rate.
    const isNonEur = payload.currency && payload.currency !== 'EUR'
    const fxRate = isNonEur ? payload.fxRate : 1
    if (isNonEur && fxRate == null) {
      throw new Error(`Missing fxRate for non-EUR claim currency ${payload.currency}`)
    }

    const fxComment = isNonEur
      ? ` [Original currency: ${payload.currency}, FX rate: 1 ${payload.currency} = ${fxRate} EUR]`
      : ''

    const purchasePayload = {
      Purchase: {
        client_id:
          member?.billingId && /^\d+$/.test(member.billingId)
            ? Number(member.billingId)
            : undefined,
        number: payload.number,
        // created = invoice date (the member-entered expense date); transaction_date =
        // accounting/bookkeeping date ("Kirjanpidon päivämäärä"), which SimplBooks
        // subjects to period locking — using the claim's submit date there instead of
        // the (possibly much older) expense date avoids hitting an already-locked
        // period (issue #1071). Per vendored OpenAPI spec: simplbooks-api/schemas/
        // PurchaseCreate.yaml / Purchase.yaml.
        created: payload.transactionDate
          ? formatSimplbooksDate(new Date(payload.transactionDate))
          : today,
        transaction_date: payload.submittedAt
          ? formatSimplbooksDate(new Date(payload.submittedAt))
          : today,
        due: payload.due ? formatSimplbooksDate(new Date(payload.due)) : undefined,
        currency_name: 'EUR',
        comments: `${payload.claimTitle ? `${payload.claimTitle} — ` : ''}Expense reimbursement: ${payload.categoryCode} (claim ${payload.claimId})${fxComment}`,
        ...(fileType && fileContents ? { file_type: fileType, file_contents: fileContents } : {}),
      },
      PurchaseRows: payload.lineItems.map((item) => {
        // Convert to EUR if claim was in a foreign currency
        const rawSum = item.totalCost ?? item.quantity * item.unitPrice
        const eurSum = Math.round(rawSum * fxRate! * 100) / 100
        return {
          PurchaseRow: {
            name: item.description ?? 'Digitaalisten palvelujen osto',
            amount: item.quantity,
            sum: eurSum,
            ...(item.articleId != null ? { article_id: item.articleId } : {}),
            //...(item.code ? { code: item.code } : {}),
          },
          Projects:
            (item.costCentreCode ?? payload.aircraftRegistration)
              ? [{ code: (item.costCentreCode ?? payload.aircraftRegistration)! }]
              : [],
        }
      }),
    }

    const result = await createSimplbooksPurchase(purchasePayload)

    await db.transaction().execute(async (txn) => {
      await updateExpenseSimplbooksId(payload.claimId, result.inserted_id, txn)
      await setOutboxStatus(txn, outboxMsg.id, SimplbooksStatus.SYNCED)
    })
  } catch (error) {
    logger.error(`Failed to create expense reimbursement for claim ${payload.claimId}`, error)
    await db.transaction().execute(async (txn) => {
      await setOutboxStatus(
        txn,
        outboxMsg.id,
        SimplbooksStatus.FAILED,
        `Failed to create reimbursement: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    })
    throw error
  }
}

const ClubFuelRecoveryPayloadSchema = z.object({
  claimId: z.string().guid(),
  memberId: z.string(),
  /** What the member owes the club, in EUR — always positive; see computeFuelReimbursement. */
  amount: z.number().positive(),
  /** The SimplBooks article the claim's own fuel rows used, so both book to the same place. */
  articleId: z.number().int().positive().nullable().optional(),
  costCentreCode: z.string().nullable().optional(),
  description: z.string(),
})

/**
 * Invoices a member for club-card fuel that exceeded the local price cap (issue #955).
 *
 * The balanced cap treats club-card litres exactly like member-paid ones: they count
 * toward the same pool, so when club-card spend alone is over the cap there is nothing
 * to reimburse and the excess is owed back to the club. Approval of such a claim creates
 * this event instead of (not alongside) a reimbursement purchase.
 */
async function createClubFuelRecoveryInvoice(outboxMsg: AcctsOutboxSimplbooks) {
  const payload = ClubFuelRecoveryPayloadSchema.parse(outboxMsg.payload)

  try {
    const member = await getMemberById(payload.memberId)
    if (!member?.billingId || !/^\d+$/.test(member.billingId)) {
      throw new Error(
        `Cannot invoice club fuel recovery for member ${payload.memberId}: no SimplBooks client id`,
      )
    }

    const invoicePayload: InvoicePost = {
      Invoice: { client_id: Number(member.billingId) },
      Tasks: [
        {
          Task: {
            ...(payload.articleId != null ? { article_id: payload.articleId } : {}),
            name: payload.description,
            amount: 1,
            price_per_unit: payload.amount,
          },
          Projects: payload.costCentreCode ? [{ code: payload.costCentreCode }] : [],
        },
      ],
    }

    await db.transaction().execute(async (txn) => {
      const invoiceId = await createInvoice(
        payload.memberId,
        outboxMsg.id,
        MIKInvoiceType.MISC,
        invoicePayload,
        txn,
      )
      logger.info(
        `Created club fuel recovery invoice ${invoiceId} for ${payload.amount} EUR, member ${payload.memberId}, claim ${payload.claimId}`,
      )
    })
  } catch (error) {
    logger.error(`Failed to create club fuel recovery invoice for claim ${payload.claimId}`, error)
    await db.transaction().execute(async (txn) => {
      await setOutboxStatus(
        txn,
        outboxMsg.id,
        SimplbooksStatus.FAILED,
        `Failed to create club fuel recovery invoice: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    })
    throw error
  }
}

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
          updatedAt: new Date(),
          updatedBy: MIK_SIMPLBOOKS_MEMBER,
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
