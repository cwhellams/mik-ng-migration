import { sql, type Kysely, type Transaction } from 'kysely'

import { camelDb } from './connection.ts'
import type { DB as CamelDB } from './schema.camel.d.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  ExpenseClaimStatus,
  ExpenseMessageType,
  type CreateExpenseClaim,
  type ExpenseCategory,
  type ExpenseClaim,
  type ExpenseClaimEditAuditEntry,
  type ExpenseClaimFilters,
  type ExpenseClaimListResponse,
  type ExpenseClaimMessage,
  type ExpenseLineItem,
  type FuelType,
  type TreasurerEditExpenseClaim,
  type UpdateExpenseClaim,
} from '@mik/contracts/expenses'
import {
  getCurrentMileageAllowance,
  getMileageLegsByClaimId,
  replaceMileageLegs,
  maskHetu,
} from './mileage-queries.ts'
import { encryptField, decryptField } from '../lib/fieldEncryption.ts'
import { getEffectiveLocalFuelPrice } from './local-fuel-price-queries.ts'
import { computeFuelReimbursement } from '../services/fuelReimbursement.ts'
import { getExpenseAttachments } from './expense-attachment-queries.ts'

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date(String(value)).toISOString()
}

const toNullableIsoString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }

  return toIsoString(value)
}

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  return Number(value)
}

type Executor = Kysely<CamelDB> | Transaction<CamelDB>

type ClaimRow = {
  id: string
  memberId: string
  categoryId: number
  categoryCode: string | null
  aircraftId: string | null
  flightLogId: unknown
  title: string
  description: string | null
  status: string
  fuelLitres: unknown
  fuelType: string | null
  refuelOutsideFinland: boolean
  expenseDate: string | null
  iban: string | null
  ibanAccountName: string | null
  ccy: string
  fxRate: unknown
  receiptStorageKey: string | null
  receiptFileName: string | null
  receiptFileSize: number | null
  receiptMimeType: string | null
  receiptUploadedAt: unknown
  submittedAt: unknown
  approvedAt: unknown
  approvedBy: string | null
  rejectedAt: unknown
  rejectedBy: string | null
  rejectionReason: string | null
  simplbooksPurchaseId: unknown
  hetuEncrypted: string | null
  createdAt: unknown
  updatedAt: unknown
  memberName: string | null
  memberEmail: string | null
  totalAmount: unknown
}

const hasOwn = <T extends object>(obj: T, key: keyof any): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)

// Finnish aerodromes all use the EFxx ICAO prefix (issue #1020) — anything else on a
// fuel line item counts as fueling abroad, replacing the old claim-level checkbox.
const isAirportOutsideFinland = (icao: string | null | undefined): boolean =>
  !!icao && !icao.toUpperCase().startsWith('EF')

const computeRefuelOutsideFinland = (lineItems: ExpenseLineItem[]): boolean =>
  lineItems.some((item) => isAirportOutsideFinland(item.airport))

const mapCategory = (row: {
  id: number
  code: string
  labelEn: string
  labelFi: string
  labelSv: string
  requiresAircraft: boolean
  requiresFlight: boolean
  active: boolean
}): ExpenseCategory => ({
  id: row.id,
  code: row.code,
  labelEn: row.labelEn,
  labelFi: row.labelFi,
  labelSv: row.labelSv,
  requiresAircraft: row.requiresAircraft,
  requiresFlight: row.requiresFlight,
  active: row.active,
})

const mapLineItem = (row: {
  id: number
  itemId: number | null
  itemCode?: string | null
  description: string
  quantity: unknown
  unit: string
  unitPrice: unknown
  totalCost?: unknown
  sortOrder: number
  costCentreCode?: string | null
  fuelType?: string | null
  fuelDate?: string | null
  airport?: string | null
  paidWithClubCard?: boolean | null
}): ExpenseLineItem => ({
  id: row.id,
  itemId: row.itemId,
  itemCode: row.itemCode ?? undefined,
  description: row.description,
  date: row.fuelDate ?? undefined,
  quantity: Number(row.quantity),
  unit: row.unit as ExpenseLineItem['unit'],
  unitPrice: Number(row.unitPrice),
  totalCost: toNullableNumber(row.totalCost),
  sortOrder: row.sortOrder,
  costCentreCode: row.costCentreCode ?? undefined,
  fuelType: (row.fuelType as ExpenseLineItem['fuelType']) ?? undefined,
  airport: row.airport ?? undefined,
  paidWithClubCard: row.paidWithClubCard ?? false,
})

const mapMessage = (row: {
  id: number
  claimId: string
  senderId: string
  messageType: string
  body: string
  sentAt: unknown
}): ExpenseClaimMessage => ({
  id: row.id,
  claimId: row.claimId,
  senderId: row.senderId,
  messageType: row.messageType as ExpenseMessageType,
  body: row.body,
  sentAt: toIsoString(row.sentAt),
})

const mapClaim = (
  row: ClaimRow,
  details?: Pick<
    ExpenseClaim,
    'lineItems' | 'messages' | 'mileageLegs' | 'fuelReimbursementSummary' | 'attachments'
  >,
): ExpenseClaim => ({
  id: row.id,
  memberId: row.memberId,
  categoryId: row.categoryId,
  categoryCode: row.categoryCode ?? undefined,
  aircraftId: row.aircraftId,
  flightLogId: (row.flightLogId as string | null) ?? undefined,
  title: row.title,
  description: row.description,
  status: row.status as ExpenseClaimStatus,
  fuelLitres: toNullableNumber(row.fuelLitres),
  fuelType: row.fuelType,
  refuelOutsideFinland: row.refuelOutsideFinland,
  expenseDate: row.expenseDate ?? undefined,
  iban: row.iban,
  ibanAccountName: row.ibanAccountName,
  currency: row.ccy ?? 'EUR',
  fxRate: toNullableNumber(row.fxRate),
  submittedAt: toNullableIsoString(row.submittedAt),
  approvedAt: toNullableIsoString(row.approvedAt),
  approvedBy: row.approvedBy,
  rejectedAt: toNullableIsoString(row.rejectedAt),
  rejectedBy: row.rejectedBy,
  rejectionReason: row.rejectionReason,
  simplbooksPurchaseId: toNullableNumber(row.simplbooksPurchaseId),
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
  memberName: row.memberName ?? undefined,
  memberEmail: row.memberEmail ?? undefined,
  hetu: row.hetuEncrypted ? maskHetu(decryptField(row.hetuEncrypted)) : undefined,
  totalAmount: toNullableNumber(row.totalAmount) ?? 0,
  receipt: row.receiptStorageKey
    ? {
        storageKey: row.receiptStorageKey,
        fileName: row.receiptFileName ?? '',
        fileSize: row.receiptFileSize ?? 0,
        mimeType: row.receiptMimeType ?? '',
        uploadedAt: row.receiptUploadedAt
          ? toIsoString(row.receiptUploadedAt)
          : new Date().toISOString(),
      }
    : undefined,
  ...details,
})

const claimSelect = (executor: Executor) =>
  executor
    .selectFrom('accts.expenseClaim as claim')
    .innerJoin('accts.expenseCategory as category', 'category.id', 'claim.categoryId')
    .leftJoin('member.register as member', 'member.memberId', 'claim.memberId')
    .select([
      'claim.id',
      'claim.memberId',
      'claim.categoryId',
      'category.code as categoryCode',
      'claim.aircraftId',
      'claim.flightLogId',
      'claim.title',
      'claim.description',
      'claim.status',
      'claim.fuelLitres',
      'claim.fuelType',
      'claim.refuelOutsideFinland',
      'claim.expenseDate',
      'claim.iban',
      'claim.ibanAccountName',
      'claim.ccy',
      'claim.fxRate',
      'claim.receiptStorageKey',
      'claim.receiptFileName',
      'claim.receiptFileSize',
      'claim.receiptMimeType',
      'claim.receiptUploadedAt',
      'claim.submittedAt',
      'claim.approvedAt',
      'claim.approvedBy',
      'claim.rejectedAt',
      'claim.rejectedBy',
      'claim.rejectionReason',
      'claim.simplbooksPurchaseId',
      'claim.hetuEncrypted',
      'claim.createdAt',
      'claim.updatedAt',
      'member.email as memberEmail',
      sql<string>`trim(concat(coalesce(member.first_name, ''), ' ', coalesce(member.last_name, '')))`.as(
        'memberName',
      ),
      sql<number>`round(coalesce((
        select sum(coalesce(li.total_cost, li.quantity * li.unit_price)) * coalesce(claim.fx_rate, 1.0)
        from accts.expense_claim_line_item li
        where li.claim_id = claim.id
      ), 0)::numeric, 2)`.as('totalAmount'),
    ])

async function insertLineItems(
  executor: Executor,
  claimId: string,
  items: ExpenseLineItem[],
): Promise<void> {
  if (!items.length) {
    return
  }

  await executor
    .insertInto('accts.expenseClaimLineItem')
    .values(
      items.map((item) => ({
        claimId: claimId,
        itemId: item.itemId ?? null,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalCost: item.totalCost ?? null,
        sortOrder: item.sortOrder,
        costCentreCode: item.costCentreCode ?? null,
        fuelType: item.fuelType ?? null,
        fuelDate: item.date ?? null,
        airport: item.airport ?? null,
        paidWithClubCard: item.paidWithClubCard ?? false,
      })),
    )
    .execute()
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const rows = await camelDb
    .selectFrom('accts.expenseCategory')
    .selectAll()
    .where('active', '=', true)
    .orderBy('id')
    .execute()

  return rows.map(mapCategory)
}

export async function getExpenseClaimsByMember(
  memberId: string,
  filters: ExpenseClaimFilters,
): Promise<ExpenseClaimListResponse> {
  const offset = (filters.page - 1) * filters.pageSize

  const countRow = await camelDb
    .selectFrom('accts.expenseClaim')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('memberId', '=', memberId)
    .$if(!!filters.status, (qb) => qb.where('status', '=', filters.status!))
    .executeTakeFirstOrThrow()

  const rows = await claimSelect(camelDb)
    .where('claim.memberId', '=', memberId)
    .$if(!!filters.status, (qb) => qb.where('claim.status', '=', filters.status!))
    .orderBy('claim.createdAt', 'desc')
    .limit(filters.pageSize)
    .offset(offset)
    .execute()

  return {
    claims: rows.map((row) => mapClaim(row as ClaimRow)),
    total: Number(countRow.count),
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export async function getPendingExpenseClaimsCount(): Promise<number> {
  const row = await camelDb
    .selectFrom('accts.expenseClaim')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('status', 'in', [ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO])
    .executeTakeFirstOrThrow()

  return Number(row.count)
}

export async function getAllExpenseClaims(
  filters: ExpenseClaimFilters,
): Promise<ExpenseClaimListResponse> {
  const offset = (filters.page - 1) * filters.pageSize

  const countRow = await camelDb
    .selectFrom('accts.expenseClaim')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .$if(!!filters.status, (qb) => qb.where('status', '=', filters.status!))
    .executeTakeFirstOrThrow()

  const rows = await claimSelect(camelDb)
    .$if(!!filters.status, (qb) => qb.where('claim.status', '=', filters.status!))
    .orderBy('claim.createdAt', 'desc')
    .limit(filters.pageSize)
    .offset(offset)
    .execute()

  return {
    claims: rows.map((row) => mapClaim(row as ClaimRow)),
    total: Number(countRow.count),
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export async function getExpenseClaimById(id: string): Promise<ExpenseClaim | undefined> {
  const claimRow = await claimSelect(camelDb).where('claim.id', '=', id).executeTakeFirst()

  if (!claimRow) {
    return undefined
  }

  const [lineItems, messages, mileageLegs, attachments] = await Promise.all([
    camelDb
      .selectFrom('accts.expenseClaimLineItem as li')
      .leftJoin('accts.items as item', 'item.id', 'li.itemId')
      .select([
        'li.id',
        'li.itemId',
        'item.code as itemCode',
        'li.description',
        'li.quantity',
        'li.unit',
        'li.unitPrice',
        'li.totalCost',
        'li.sortOrder',
        'li.costCentreCode',
        'li.fuelType',
        'li.fuelDate',
        'li.airport',
        'li.paidWithClubCard',
      ])
      .where('li.claimId', '=', id)
      .orderBy('li.sortOrder')
      .orderBy('li.id')
      .execute(),
    camelDb
      .selectFrom('accts.expenseClaimMessage')
      .selectAll()
      .where('claimId', '=', id)
      .orderBy('sentAt')
      .execute(),
    getMileageLegsByClaimId(id),
    getExpenseAttachments(id),
  ])

  const mappedLineItems = lineItems.map(mapLineItem)
  const fuelReimbursementSummary =
    claimRow.categoryCode === 'fuel' && mappedLineItems.length
      ? await computeFuelReimbursementSummary(mappedLineItems, claimRow as ClaimRow)
      : undefined

  return mapClaim(claimRow as ClaimRow, {
    lineItems: mappedLineItems,
    messages: messages.map(mapMessage),
    mileageLegs,
    fuelReimbursementSummary,
    attachments,
  })
}

/**
 * Trip-wide start date used to pick the effective local fuel price (issue #955,
 * clarified: the price at the START of the trip applies to the whole claim, not each
 * line item's own date) — the earliest line item date, falling back to the claim's own
 * expense date for legacy line items that predate the per-line date field.
 */
async function computeFuelReimbursementSummary(
  lineItems: ExpenseLineItem[],
  claimRow: ClaimRow,
): Promise<ExpenseClaim['fuelReimbursementSummary']> {
  const tripStartDate =
    lineItems
      .map((item) => item.date)
      .filter((date): date is string => !!date)
      .sort()[0] ??
    claimRow.expenseDate ??
    undefined
  const fuelType = lineItems.find((item) => item.fuelType)?.fuelType as FuelType | undefined

  const localPrice =
    fuelType && tripStartDate
      ? await getEffectiveLocalFuelPrice(fuelType, tripStartDate)
      : undefined

  return computeFuelReimbursement(
    lineItems.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalCost: item.totalCost,
      paidWithClubCard: item.paidWithClubCard ?? false,
    })),
    localPrice?.priceEurPerLitre ?? null,
  )
}

export async function createExpenseClaim(
  data: CreateExpenseClaim,
  user: JWTUser,
): Promise<ExpenseClaim> {
  // Read the current rate before opening the transaction — a plain read, no need to
  // hold it open for the duration of the write.
  const effectiveRate = data.mileageLegs?.length
    ? ((await getCurrentMileageAllowance())?.effectiveRatePerKm ?? 0.275) // fallback: 50% of 0.55
    : 0

  const result = await camelDb.transaction().execute(async (txn) => {
    const inserted = await txn
      .insertInto('accts.expenseClaim')
      .values({
        memberId: user.memberId,
        categoryId: data.categoryId,
        aircraftId: data.aircraftId ?? null,
        flightLogId: data.flightLogId ?? null,
        title: data.title,
        description: data.description ?? null,
        status: ExpenseClaimStatus.DRAFT,
        fuelLitres: data.fuelLitres ?? null,
        fuelType: data.fuelType ?? null,
        refuelOutsideFinland: computeRefuelOutsideFinland(data.lineItems),
        expenseDate: data.expenseDate,
        iban: data.iban,
        ibanAccountName: data.ibanAccountName,
        ccy: data.currency ?? 'EUR',
        fxRate: data.fxRate ?? null,
        hetuEncrypted: data.hetu ? encryptField(data.hetu) : null,
        updatedAt: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await insertLineItems(txn, inserted.id, data.lineItems)
    if (data.mileageLegs) {
      await replaceMileageLegs(txn, inserted.id, data.mileageLegs, effectiveRate)
    }
    return inserted.id
  })

  const claim = await getExpenseClaimById(result)
  if (!claim) {
    throw new Error('Failed to load created expense claim')
  }

  return claim
}

export async function updateExpenseClaim(
  id: string,
  data: UpdateExpenseClaim,
  user: JWTUser,
): Promise<ExpenseClaim | undefined> {
  const effectiveRate = data.mileageLegs?.length
    ? ((await getCurrentMileageAllowance())?.effectiveRatePerKm ?? 0.275)
    : 0

  await camelDb.transaction().execute(async (txn) => {
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
      // Revert to DRAFT whenever the member saves changes, so they must explicitly re-submit.
      // Safe because only DRAFT and PENDING_INFO claims reach this path (enforced by the API route).
      status: ExpenseClaimStatus.DRAFT,
    }

    if (hasOwn(data, 'categoryId')) patch.category_id = data.categoryId
    if (hasOwn(data, 'aircraftId')) patch.aircraft_id = data.aircraftId ?? null
    if (hasOwn(data, 'flightLogId')) patch.flight_log_id = data.flightLogId ?? null
    if (hasOwn(data, 'title')) patch.title = data.title
    if (hasOwn(data, 'description')) patch.description = data.description ?? null
    if (hasOwn(data, 'fuelLitres')) patch.fuel_litres = data.fuelLitres ?? null
    if (hasOwn(data, 'fuelType')) patch.fuel_type = data.fuelType ?? null
    if (hasOwn(data, 'expenseDate')) patch.expense_date = data.expenseDate ?? null
    if (hasOwn(data, 'iban')) patch.iban = data.iban ?? null
    if (hasOwn(data, 'ibanAccountName')) patch.iban_account_name = data.ibanAccountName ?? null
    if (hasOwn(data, 'currency')) patch.ccy = data.currency ?? null
    if (hasOwn(data, 'fxRate')) patch.fx_rate = data.fxRate ?? null
    // Only overwrite the stored HETU when a new one was actually submitted — edit flows
    // that don't re-collect it (it's never sent back to the client unmasked) must leave
    // the existing encrypted value untouched instead of nulling it out.
    if (data.hetu) patch.hetu_encrypted = encryptField(data.hetu)
    if (data.lineItems) patch.refuel_outside_finland = computeRefuelOutsideFinland(data.lineItems)

    await txn.updateTable('accts.expenseClaim').set(patch).where('id', '=', id).execute()

    if (data.lineItems) {
      await txn.deleteFrom('accts.expenseClaimLineItem').where('claimId', '=', id).execute()
      await insertLineItems(txn, id, data.lineItems)
    }

    if (data.mileageLegs) {
      await replaceMileageLegs(txn, id, data.mileageLegs, effectiveRate)
    }

    await txn
      .insertInto('accts.expenseClaimMessage')
      .values({
        claimId: id,
        senderId: user.memberId,
        messageType: ExpenseMessageType.SYSTEM,
        body: 'Claim updated by member.',
      })
      .execute()
  })

  return getExpenseClaimById(id)
}

export async function deleteExpenseClaim(id: string): Promise<boolean> {
  const result = await camelDb
    .deleteFrom('accts.expenseClaim')
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numDeletedRows > BigInt(0)
}

export async function retractExpenseClaim(
  id: string,
  userId: string,
  executor: Executor = camelDb,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      status: ExpenseClaimStatus.DRAFT,
      submittedAt: null,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .where('memberId', '=', userId)
    .where('status', '=', ExpenseClaimStatus.SUBMITTED)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function submitExpenseClaim(
  id: string,
  user: JWTUser,
  executor: Executor = camelDb,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      status: ExpenseClaimStatus.SUBMITTED,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .where('memberId', '=', user.memberId)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function approveExpenseClaim(
  id: string,
  approverId: string,
  executor: Executor = camelDb,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      status: ExpenseClaimStatus.APPROVED,
      approvedAt: new Date(),
      approvedBy: approverId,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function rejectExpenseClaim(
  id: string,
  rejectorId: string,
  reason: string,
  executor: Executor = camelDb,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      status: ExpenseClaimStatus.REJECTED,
      rejectedAt: new Date(),
      rejectedBy: rejectorId,
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function overrideFuelPrice(
  id: string,
  efnuPrice: number,
  executor: Executor = camelDb,
): Promise<boolean> {
  await executor
    .updateTable('accts.expenseClaimLineItem')
    .set({
      unitPrice: sql<number>`LEAST(unit_price, ${efnuPrice})`,
      // Only recompute the persisted total for line items the cap actually affects,
      // otherwise an already-exact total gets reconstructed from unit_price and drifts.
      totalCost: sql<number>`CASE WHEN unit_price > ${efnuPrice} THEN quantity * ${efnuPrice} ELSE total_cost END`,
    })
    .where('claimId', '=', id)
    .execute()

  const note = `EFNU fuel price cap of ${efnuPrice.toFixed(2)} EUR/L has been applied to this claim.`
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      description: sql<string>`coalesce(description, '') || ${'\n\n' + note}`,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function setExpenseClaimToDraft(
  id: string,
  adminId: string,
  executor: Executor = camelDb,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      status: ExpenseClaimStatus.DRAFT,
      submittedAt: null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  await executor
    .insertInto('accts.expenseClaimMessage')
    .values({
      claimId: id,
      senderId: adminId,
      messageType: ExpenseMessageType.SYSTEM,
      body: 'Claim returned to draft by administrator.',
    })
    .execute()

  return result.numUpdatedRows > BigInt(0)
}

export async function markExpenseClaimPendingInfo(
  id: string,
  executor: Executor = camelDb,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      status: ExpenseClaimStatus.PENDING_INFO,
      updatedAt: new Date(),
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

export async function setExpenseReceipt(
  claimId: string,
  receipt: { storageKey: string; fileName: string; fileSize: number; mimeType: string } | null,
  executor: Executor = camelDb,
): Promise<void> {
  await executor
    .updateTable('accts.expenseClaim')
    .set(
      receipt
        ? {
            receiptStorageKey: receipt.storageKey,
            receiptFileName: receipt.fileName,
            receiptFileSize: receipt.fileSize,
            receiptMimeType: receipt.mimeType,
            receiptUploadedAt: new Date(),
            updatedAt: new Date(),
          }
        : {
            receiptStorageKey: null,
            receiptFileName: null,
            receiptFileSize: null,
            receiptMimeType: null,
            receiptUploadedAt: null,
            updatedAt: new Date(),
          },
    )
    .where('id', '=', claimId)
    .execute()
}

export async function addExpenseMessage(
  claimId: string,
  senderId: string,
  type: ExpenseMessageType,
  body: string,
  executor: Executor = camelDb,
): Promise<ExpenseClaimMessage> {
  const inserted = await executor
    .insertInto('accts.expenseClaimMessage')
    .values({
      claimId: claimId,
      senderId: senderId,
      messageType: type,
      body,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapMessage(inserted)
}

export async function updateExpenseSimplbooksId(
  claimId: string,
  purchaseId: number,
  executor: Executor = camelDb,
): Promise<boolean> {
  const result = await executor
    .updateTable('accts.expenseClaim')
    .set({
      simplbooksPurchaseId: purchaseId,
      status: ExpenseClaimStatus.SYNCED,
      updatedAt: new Date(),
    })
    .where('id', '=', claimId)
    .executeTakeFirstOrThrow()

  return result.numUpdatedRows > BigInt(0)
}

// ─── Treasurer edit (issue #1028) ────────────────────────────────────────────
// Deliberately not the same code path as updateExpenseClaim: this must never touch
// status (the whole point is the claim stays exactly where it is in the approval
// queue) and must log a field-level diff for every changed value, since this mutates
// a claim the member no longer controls.

const LINE_ITEM_FIELD_COLUMNS: Record<string, string> = {
  itemId: 'item_id',
  description: 'description',
  date: 'fuel_date',
  quantity: 'quantity',
  unit: 'unit',
  unitPrice: 'unit_price',
  totalCost: 'total_cost',
  costCentreCode: 'cost_centre_code',
  airport: 'airport',
  paidWithClubCard: 'paid_with_club_card',
}

type EditAuditRow = {
  claimId: string
  lineItemId: number | null
  fieldName: string
  oldValue: string | null
  newValue: string | null
  editedBy: string
}

const toAuditString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value)

export async function treasurerEditExpenseClaim(
  claimId: string,
  patch: TreasurerEditExpenseClaim,
  treasurer: JWTUser,
): Promise<{ claim: ExpenseClaim; changedFieldCount: number }> {
  const existing = await getExpenseClaimById(claimId)
  if (!existing) {
    throw new Error('Expense claim not found')
  }

  const auditRows: EditAuditRow[] = []

  await camelDb.transaction().execute(async (txn) => {
    const claimPatch: Record<string, unknown> = {}

    const diffClaimField = (field: 'title' | 'aircraftId' | 'expenseDate', column: string) => {
      if (!hasOwn(patch, field)) return
      const newValue = patch[field] ?? null
      const oldValue = (existing[field] ?? null) as unknown
      if (newValue === oldValue) return
      auditRows.push({
        claimId: claimId,
        lineItemId: null,
        fieldName: field,
        oldValue: toAuditString(oldValue),
        newValue: toAuditString(newValue),
        editedBy: treasurer.memberId,
      })
      claimPatch[column] = newValue
    }

    diffClaimField('title', 'title')
    diffClaimField('aircraftId', 'aircraft_id')
    diffClaimField('expenseDate', 'expense_date')

    if (Object.keys(claimPatch).length > 0) {
      claimPatch.updated_at = new Date()
      await txn
        .updateTable('accts.expenseClaim')
        .set(claimPatch)
        .where('id', '=', claimId)
        .execute()
    }

    for (const lineItemPatch of patch.lineItems ?? []) {
      const existingLineItem = existing.lineItems?.find((li) => li.id === lineItemPatch.id)
      if (!existingLineItem) continue

      const liPatch: Record<string, unknown> = {}
      for (const [field, column] of Object.entries(LINE_ITEM_FIELD_COLUMNS)) {
        if (!hasOwn(lineItemPatch, field)) continue
        const newValue = (lineItemPatch as Record<string, unknown>)[field] ?? null
        const oldValue = (existingLineItem as Record<string, unknown>)[field] ?? null
        if (newValue === oldValue) continue
        auditRows.push({
          claimId: claimId,
          lineItemId: lineItemPatch.id,
          fieldName: field,
          oldValue: toAuditString(oldValue),
          newValue: toAuditString(newValue),
          editedBy: treasurer.memberId,
        })
        liPatch[column] = newValue
      }

      // Correcting quantity/unitPrice invalidates any previously-stored explicit
      // total_cost (see applyTotalCost in expenseShared.tsx, which lets a member type a
      // known total and back-derives unitPrice from it) — clear it so the claim total
      // (coalesce(total_cost, quantity * unit_price)) recomputes from the corrected
      // values instead of silently keeping the stale total. Skipped when the patch sends
      // its own totalCost: the treasurer's edit form derives unitPrice from the total the
      // treasurer typed, so that total is the authoritative figure, not a stale leftover
      // (issue #1024 — reconstructing it from a rounded unit_price drifts).
      if (
        !hasOwn(lineItemPatch, 'totalCost') &&
        (hasOwn(liPatch, 'quantity') || hasOwn(liPatch, 'unit_price')) &&
        existingLineItem.totalCost != null
      ) {
        auditRows.push({
          claimId: claimId,
          lineItemId: lineItemPatch.id,
          fieldName: 'totalCost',
          oldValue: toAuditString(existingLineItem.totalCost),
          newValue: null,
          editedBy: treasurer.memberId,
        })
        liPatch.total_cost = null
      }

      if (Object.keys(liPatch).length > 0) {
        await txn
          .updateTable('accts.expenseClaimLineItem')
          .set(liPatch)
          .where('id', '=', lineItemPatch.id)
          .where('claimId', '=', claimId)
          .execute()
      }
    }

    // Recompute refuel_outside_finland from the merged (existing + patched) line items —
    // a treasurer edit can change a fuel line item's airport, and the claim-level flag
    // must stay in sync with it (mirrors updateExpenseClaim's own recompute above).
    const mergedLineItems = (existing.lineItems ?? []).map((li) => {
      const edit = patch.lineItems?.find((p) => p.id === li.id)
      return edit && hasOwn(edit, 'airport') ? { ...li, airport: edit.airport ?? null } : li
    })
    const newRefuelOutsideFinland = computeRefuelOutsideFinland(mergedLineItems)
    if (newRefuelOutsideFinland !== existing.refuelOutsideFinland) {
      auditRows.push({
        claimId: claimId,
        lineItemId: null,
        fieldName: 'refuelOutsideFinland',
        oldValue: toAuditString(existing.refuelOutsideFinland),
        newValue: toAuditString(newRefuelOutsideFinland),
        editedBy: treasurer.memberId,
      })
      await txn
        .updateTable('accts.expenseClaim')
        .set({ refuelOutsideFinland: newRefuelOutsideFinland, updatedAt: new Date() })
        .where('id', '=', claimId)
        .execute()
    }

    if (auditRows.length > 0) {
      await txn.insertInto('accts.expenseClaimEditAudit').values(auditRows).execute()
    }
  })

  const claim = await getExpenseClaimById(claimId)
  if (!claim) {
    throw new Error('Failed to load edited expense claim')
  }

  return { claim, changedFieldCount: auditRows.length }
}

export async function getExpenseClaimEditAudit(
  claimId: string,
): Promise<ExpenseClaimEditAuditEntry[]> {
  const rows = await camelDb
    .selectFrom('accts.expenseClaimEditAudit')
    .selectAll()
    .where('claimId', '=', claimId)
    .orderBy('editedAt', 'desc')
    .execute()

  return rows.map((row) => ({
    fieldName: row.fieldName,
    oldValue: row.oldValue,
    newValue: row.newValue,
    lineItemId: row.lineItemId,
    editedBy: row.editedBy,
    editedAt: toIsoString(row.editedAt),
  }))
}
