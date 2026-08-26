import { HttpStatusCode } from 'axios'

import logger from '../../lib/logger.ts'
import { problem } from '../response.ts'
import type { ExpenseLineItem } from '@mik/contracts/expenses'
import {
  computeLiquidRecordLock,
  LiquidLockReason,
  LiquidType,
  round4,
  type LiquidRecord,
} from '@mik/contracts/liquid'
import { toHelsinki } from '@mik/contracts/date'
import { db } from '../../db/connection.ts'
import { getLiquidRecordById } from '../../db/liquid-queries.ts'
import { getLiquidRecordAttachments } from '../../db/liquid-attachment-queries.ts'
import { addExpenseAttachment, getExpenseAttachments } from '../../db/expense-attachment-queries.ts'
import { storageService } from '../../services/storage.ts'
import { RECEIPT_BUCKET } from '../../util/receiptUpload.ts'

/**
 * Turning selected fuel records into an expense claim (#1119).
 *
 * "Members select an existing fuel record instead of re-entering fuel details.
 * The selected record supplies fuel, quantity, airport, provider, cost, and
 * tax-status information."
 *
 * The point is that the member enters the fuelling **once**. Before this, they
 * reported it at the pump and then typed the same litres, airport and cost into
 * the claim form, and the two could disagree — the claim being the one the club
 * paid against. So the line items here are *derived*, and whatever `lineItems`
 * the client sent alongside `liquidRecordIds` is discarded rather than merged:
 * a client-supplied cost is exactly the thing this removes.
 */

/**
 * Loads the records, checking each one may actually go on this member's claim.
 *
 * Every rejection is a 400 naming the record, because the member picked these
 * from a list and needs to know which one went stale — most likely because they
 * claimed it from another tab.
 *
 * `recordIds` arrives deduplicated: `liquidRecordIds` is a set in the claim
 * schema, which matters because one id twice would become two line items here
 * and double the claim's total.
 */
export async function loadClaimableFuelRecords(
  recordIds: string[],
  memberId: string,
  /** The claim being edited, whose own records are legitimately already linked. */
  claimId?: string,
  /** Same escape hatch `assertRecordMutable` gives a liquid admin editing directly. */
  isLiquidAdmin = false,
): Promise<LiquidRecord[]> {
  const records: LiquidRecord[] = []

  for (const recordId of recordIds) {
    const record = await getLiquidRecordById(recordId)

    if (!record || record.deletedAt) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'One of the selected fuel records no longer exists.',
      })
    }
    if (record.memberId !== memberId) {
      // A 400 rather than a 403: the member is not being denied a permission,
      // they have picked something that was never theirs to claim.
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'One of the selected fuel records belongs to another member.',
      })
    }
    if (record.liquidType !== LiquidType.FUEL) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Only fuel records can be claimed as an expense.',
      })
    }
    // Same lock direct edits enforce (assertRecordMutable): a record past its
    // edit window, or whose flight log has since been validated, can't be
    // pulled onto a brand-new claim either -- claiming links the record
    // (linkRecordsToClaim writes to it), so bypassing the lock here would let
    // an otherwise-frozen record be mutated through the back door. Already
    // being on *this* claim (the update path re-submitting its own records)
    // isn't a lock -- substituted to null so LINKED_TO_EXPENSE_CLAIM only
    // fires for a record genuinely attached elsewhere, which the check below
    // reports with a clearer message anyway.
    const lock = computeLiquidRecordLock(
      {
        memberId: record.memberId,
        expenseClaimId: record.expenseClaimId === claimId ? null : record.expenseClaimId,
        flightLogStatus: record.flightLogStatus,
        createdAt: record.createdAt,
        deletedAt: record.deletedAt,
      },
      { memberId, isLiquidAdmin },
    )
    if (
      !lock.canEdit &&
      (lock.reason === LiquidLockReason.EDIT_WINDOW_EXPIRED ||
        lock.reason === LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG)
    ) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail:
          lock.reason === LiquidLockReason.EDIT_WINDOW_EXPIRED
            ? `The fuelling at ${record.airport ?? 'the home base'} is more than a week old and can no longer be claimed. Ask a liquid administrator.`
            : `The fuelling at ${record.airport ?? 'the home base'} is linked to a validated flight log and can no longer be claimed. Ask a liquid administrator.`,
      })
    }
    if (record.totalCost == null) {
      // No cost means the club was invoiced directly — there is nothing to
      // reimburse, and a zero-value line item would misrepresent the claim.
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `The fuelling at ${record.airport ?? 'the home base'} has no cost recorded, so there is nothing to claim.`,
      })
    }
    if (record.expenseClaimId && record.expenseClaimId !== claimId) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'One of the selected fuel records is already attached to another expense claim.',
      })
    }

    records.push(record)
  }

  return records
}

/**
 * One line item per fuelling.
 *
 * `unitPrice` and `totalCost` are both stored, matching what the claim form does
 * by hand (#1024): the total is what the member paid, and reconstructing it as
 * `quantity * unitPrice` drifts once the unit price is rounded to the four
 * decimals the column holds.
 *
 * The prices here are in the **claim's currency**, as paid. The tax-adjusted EUR
 * figure is frozen onto the liquid record by `linkRecordsToClaim`, and belongs
 * there rather than on a line item: it is a comparison figure, not something the
 * member handed over.
 */
export function deriveLineItemsFromRecords(
  records: LiquidRecord[],
  /**
   * Cost centre codes, which are aircraft registrations. Supplied so the derived
   * items carry the one a hand-entered fuel item is required to have — without
   * it the claim would fail its own line-item validation.
   */
  costCentreCodes: Set<string> = new Set(),
): ExpenseLineItem[] {
  return records.map((record, index) => ({
    description: [
      `${record.quantityLitres} l ${record.fuelType ?? ''}`.trim(),
      record.airport,
      record.providerName,
    ]
      .filter(Boolean)
      .join(' · '),
    // The club's own calendar date, not UTC's: a fuelling reported just after
    // local midnight but before UTC midnight would otherwise land on the
    // claim a day early.
    date: toHelsinki(record.recordedAt).format('YYYY-MM-DD'),
    quantity: record.quantityLitres,
    unit: 'l' as const,
    unitPrice: round4(record.totalCost! / record.quantityLitres),
    totalCost: record.totalCost,
    sortOrder: index,
    costCentreCode: costCentreCodes.has(record.aircraftRegistration)
      ? record.aircraftRegistration
      : null,
    airport: record.airport,
    fuelType: record.fuelType as ExpenseLineItem['fuelType'],
    paidWithClubCard: false,
  }))
}

/**
 * The claim-level `fuel_litres` / `fuel_type` columns, which SimplBooks and the
 * reimbursement cap still read.
 *
 * `fuelType` is only set when every record agrees. A trip that mixed Jet A-1 and
 * 100LL has no single claim-level fuel type, and picking the first record's would
 * be a quietly wrong answer — the per-line-item values carry the detail either
 * way.
 */
export function summariseFuelRecords(records: LiquidRecord[]): {
  fuelLitres: number | undefined
  fuelType: ExpenseLineItem['fuelType']
} {
  if (records.length === 0) return { fuelLitres: undefined, fuelType: undefined }

  const fuelTypes = new Set(records.map((r) => r.fuelType))
  return {
    fuelLitres: Math.round(records.reduce((sum, r) => sum + r.quantityLitres, 0) * 1000) / 1000,
    fuelType: fuelTypes.size === 1 ? ([...fuelTypes][0] as ExpenseLineItem['fuelType']) : undefined,
  }
}

/** The cost centre codes that exist, for `deriveLineItemsFromRecords`. */
export async function loadCostCentreCodes(): Promise<Set<string>> {
  const rows = await db.selectFrom('accts.costCentre').select(['code']).execute()
  return new Set(rows.map((row) => row.code))
}

/**
 * The claim's own `flight_log_id`, derived the same way `summariseFuelRecords`
 * derives `fuelType`: only when every selected record agrees. A member no
 * longer answers "was this for a flight?" by hand (#1119 follow-up) — each
 * fuelling already carries its own link, set when it was reported from inside
 * a flight log or via the flight log's own "link fuel record" action. A trip
 * that mixed a flight-linked fuelling with an unlinked one, or two different
 * flights, has no single answer, so the claim is left unlinked rather than
 * guessing the first record's.
 */
export function deriveFlightLogId(records: LiquidRecord[]): string | null {
  if (records.length === 0) return null
  const flightLogIds = new Set(records.map((r) => r.flightLogId))
  return flightLogIds.size === 1 ? [...flightLogIds][0]! : null
}

/** Matches the expense-attachments route's own cap (`api.ts`). */
export const MAX_ATTACHMENTS_PER_CLAIM = 10

/**
 * Carries a receipt the member already attached while reporting the fuelling
 * (`liquid.record_attachment`) onto the claim it ends up on, so they don't have
 * to remember to re-attach it in the claim wizard.
 *
 * Additive only: copying is skipped for a record attachment already copied
 * (tracked via `sourceLiquidAttachmentId`, so re-saving the claim — every PUT
 * re-derives its line items from the same records — never duplicates it), and
 * a record's attachment is never removed from the claim just because the
 * member later deselects that record. The member can remove it themselves via
 * the ordinary delete-attachment endpoint, same as anything else on the claim.
 * Hitting `MAX_ATTACHMENTS_PER_CLAIM` stops copying further rather than
 * failing the claim save — this is a convenience, not member-entered data.
 */
export async function syncClaimAttachmentsFromRecords(
  claimId: string,
  records: LiquidRecord[],
): Promise<void> {
  const existing = await getExpenseAttachments(claimId)
  const alreadyCopied = new Set(
    existing.map((a) => a.sourceLiquidAttachmentId).filter((id): id is number => id != null),
  )

  let count = existing.length
  for (const record of records) {
    if (count >= MAX_ATTACHMENTS_PER_CLAIM) break
    const attachments = await getLiquidRecordAttachments(record.recordId)
    for (const attachment of attachments) {
      if (alreadyCopied.has(attachment.id)) continue
      if (count >= MAX_ATTACHMENTS_PER_CLAIM) break

      const destKey = `expense-receipts/${claimId}/${Date.now()}_${attachment.fileName}`
      try {
        await storageService.copyFile(attachment.storageKey, destKey, RECEIPT_BUCKET)
        await addExpenseAttachment(claimId, {
          storageKey: destKey,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          sourceLiquidAttachmentId: attachment.id,
        })
        count += 1
      } catch (error) {
        // A copy failing is a receipt the member still has, and can attach by
        // hand from the wizard -- not a reason to fail the whole claim save.
        logger.error('Failed to auto-copy liquid record attachment onto claim', error)
      }
    }
  }
}
