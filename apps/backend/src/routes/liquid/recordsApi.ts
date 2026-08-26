import { HttpStatusCode } from 'axios'
import { Router, type Request, type Response } from 'express'

import logger from '../../lib/logger.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { problem } from '../response.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  computeLiquidRecordLock,
  CreateLiquidRecordSchema,
  LiquidRecordFilterSchema,
  LiquidType,
  LinkFlightLogSchema,
  OIL_MAX_LITRES,
  OilSource,
  UpdateLiquidRecordSchema,
  type ClaimableFuelSummary,
  type FuelProvider,
  type LiquidRecord,
  type LiquidRecordListResponse,
} from '@mik/contracts/liquid'
import { FlightLogStatus } from '@mik/contracts/flight-log'
import {
  createLiquidRecord,
  getClaimableFuelSummary,
  getFuelProviders,
  getLinkableRecords,
  getLiquidRecordById,
  getOilCanisterById,
  getQrCodeByCode,
  listLiquidRecords,
  softDeleteLiquidRecord,
  updateLiquidRecord,
} from '../../db/liquid-queries.ts'
import {
  addLiquidRecordAttachment,
  countLiquidRecordAttachments,
  deleteLiquidRecordAttachment,
  getLiquidRecordAttachment,
  getLiquidRecordAttachments,
  MAX_ATTACHMENTS_PER_RECORD,
} from '../../db/liquid-attachment-queries.ts'
import { db } from '../../db/connection.ts'
import { storageService } from '../../services/storage.ts'
import { processReceipt, RECEIPT_BUCKET, receiptUpload } from '../../util/receiptUpload.ts'
import {
  assertCostPresentIfRequired,
  assertFuelTypeAllowed,
  assertRecordLinkable,
  assertRecordMutable,
  assertRecordVisible,
  isLiquidAdmin,
  resolveProviderId,
} from './guards.ts'

export const recordsRouter = Router()

// Reporting the fuel or oil you just put into an aircraft is part of flying it,
// so every liquid user reaches these; the admin gate is per-operation below.
recordsRouter.use(validateUser(MIKPermissions.LIQUID_USER, MIKPermissions.LIQUID_ADMIN))

/**
 * The lock a client needs to know before it renders an edit button. Attached to
 * every record on the way out so the UI never has to re-derive it, and never
 * shows a control the API would reject.
 */
const withLock = (record: LiquidRecord, req: Request) => ({
  ...record,
  lock: computeLiquidRecordLock(
    {
      memberId: record.memberId,
      expenseClaimId: record.expenseClaimId,
      flightLogStatus: record.flightLogStatus,
      createdAt: record.createdAt,
      deletedAt: record.deletedAt,
    },
    { memberId: req.user!.memberId!, isLiquidAdmin: isLiquidAdmin(req.user!) },
  ),
})

/** The fetch-or-404 every mutating/detail route on `:recordId` starts with. */
async function getExistingRecordOr404(recordId: string): Promise<LiquidRecord> {
  const record = await getLiquidRecordById(recordId)
  if (!record) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'Liquid record not found.' })
  }
  return record
}

// GET /v1/liquid/providers — reference data for the reporting form.
recordsRouter.get('/providers', async (_req: Request, res: Response<FuelProvider[]>) => {
  res.json(await getFuelProviders())
})

/**
 * GET /v1/liquid/records/claimable — the dashboard prompt's counter.
 *
 * Must precede `/records/:recordId`, or Express matches `claimable` as an id.
 */
recordsRouter.get(
  '/records/claimable',
  async (req: Request, res: Response<ClaimableFuelSummary>) => {
    res.json(await getClaimableFuelSummary(req.user!.memberId!))
  },
)

/**
 * GET /v1/liquid/records/linkable — "suggest the aircraft's most recent
 * eligible liquid records when linking" one to a flight log.
 */
recordsRouter.get('/records/linkable', async (req: Request, res: Response) => {
  const aircraftRegistration = String(req.query.aircraftRegistration ?? '')
  const liquidType = String(req.query.liquidType ?? '')
  if (!aircraftRegistration || !Object.values(LiquidType).includes(liquidType as LiquidType)) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'aircraftRegistration and liquidType are required.',
    })
  }
  const records = await getLinkableRecords(
    aircraftRegistration,
    liquidType as LiquidType,
    req.user!.memberId!,
  )
  res.json({ records: records.map((r) => withLock(r, req)) })
})

// GET /v1/liquid/records — own records, or anyone's for a liquid admin.
recordsRouter.get('/records', async (req: Request, res: Response<LiquidRecordListResponse>) => {
  const filter = LiquidRecordFilterSchema.parse(req.query)
  const admin = isLiquidAdmin(req.user!)

  // A member's filter is pinned to themselves whatever they asked for: without
  // this, `?memberId=` would turn a member-scoped list into a fleet-wide one.
  // The one exception is a flight's own liquid section (`?flightLogId=`):
  // either party on a shared flight may have added the fuelling, so pinning to
  // the requester's own memberId there would hide the other party's record
  // entirely. `assertFlightViewable` still confines it to someone who was
  // actually on that flight.
  let memberId = admin ? filter.memberId : req.user!.memberId!
  if (!admin && filter.flightLogId) {
    await assertFlightViewable(filter.flightLogId, req.user!.memberId!)
    memberId = filter.memberId
  }

  const { records, total } = await listLiquidRecords({
    ...filter,
    memberId,
    includeDeleted: admin ? filter.includeDeleted : false,
  })

  res.json({ records: records.map((r) => withLock(r, req)), total })
})

recordsRouter.get(
  '/records/:recordId',
  async (req: Request<{ recordId: string }>, res: Response) => {
    const record = await getExistingRecordOr404(req.params.recordId)
    assertRecordVisible(record, req.user!)
    res.json(withLock(record, req))
  },
)

/**
 * POST /v1/liquid/records — report an uplift.
 *
 * Deliberately reachable without a flight log: the record is the point, and a
 * member may fuel an aircraft whose flight is then cancelled.
 */
recordsRouter.post('/records', async (req: Request, res: Response) => {
  const data = CreateLiquidRecordSchema.parse(req.body)
  const memberId = req.user!.memberId!

  let providerId = data.providerId
  if (data.liquidType === LiquidType.FUEL) {
    await assertFuelTypeAllowed(data.aircraftRegistration, data.fuelType!)
    providerId = await resolveProviderId(data.airport!, data.fuelType!, data.providerId)
  }

  if (data.liquidType === LiquidType.OIL && data.oilCanisterId) {
    const canister = await getOilCanisterById(data.oilCanisterId)
    if (!canister) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Unknown oil canister.' })
    }
    // "Enter the amount used and aircraft (restricted to the canister's
    // assigned aircraft)." The canister's aircraft is permanent, so this is the
    // authority — not what the form happened to send.
    if (canister.aircraftRegistration !== data.aircraftRegistration) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `Canister ${canister.clubCanisterRef} belongs to ${canister.aircraftRegistration}.`,
      })
    }
    if (canister.isEmpty) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `Canister ${canister.clubCanisterRef} is marked empty and is no longer in inventory.`,
      })
    }
  }

  if (data.flightLogId) {
    const flight = await assertFlightLogLinkable(data.flightLogId, memberId, req)
    if (flight.aircraftRegistration !== data.aircraftRegistration) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `That flight was in ${flight.aircraftRegistration}, but this record is for ${data.aircraftRegistration}.`,
      })
    }
  }

  // The scanned code is recorded on the record, so "how was this reported" is
  // answerable later. An unknown code is not fatal — the uplift is real either
  // way — but an unassigned one would be a lie about provenance, so both are
  // simply not recorded.
  const qr = data.qrCode ? await getQrCodeByCode(data.qrCode) : undefined

  const record = await createLiquidRecord(
    { ...data, providerId },
    memberId,
    qr?.targetType ? qr.qrId : null,
  )
  res.status(HttpStatusCode.Created).json(withLock(record, req))
})

recordsRouter.patch(
  '/records/:recordId',
  async (req: Request<{ recordId: string }>, res: Response) => {
    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordMutable(existing, req.user!)

    const data = UpdateLiquidRecordSchema.parse(req.body)

    // An edit is validated against the record as it will be, not as it was: a
    // PATCH moving the airport out of Finland changes what "required" means.
    const merged = {
      aircraftRegistration: data.aircraftRegistration ?? existing.aircraftRegistration,
      airport: data.airport !== undefined ? data.airport : existing.airport,
      fuelType: data.fuelType !== undefined ? data.fuelType : existing.fuelType,
      totalCost: data.totalCost !== undefined ? data.totalCost : existing.totalCost,
      ccy: data.ccy !== undefined ? data.ccy : existing.ccy,
      fxRate: data.fxRate !== undefined ? data.fxRate : existing.fxRate,
      oilCanisterId: data.oilCanisterId !== undefined ? data.oilCanisterId : existing.oilCanisterId,
    }

    // UpdateLiquidRecordSchema can't apply the create schema's cross-field
    // refinements (ccy/fxRate pairing, the OIL canister-vs-source CHECK) on its
    // own -- a PATCH only carries the fields being changed, so the check has to
    // see them merged onto what the record already has, same as the FUEL block
    // below.
    if ((merged.ccy ?? 'EUR') !== 'EUR' && merged.fxRate == null) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'An exchange rate is required for a non-EUR purchase.',
      })
    }
    if (existing.liquidType === LiquidType.OIL) {
      const requiresCanister = existing.oilSource === OilSource.CANISTER
      if (requiresCanister !== (merged.oilCanisterId != null)) {
        return problem({
          status: HttpStatusCode.BadRequest,
          detail: requiresCanister
            ? 'Select the canister the oil came from.'
            : 'Oil from another source cannot name a club canister.',
        })
      }

      if (data.quantityLitres != null && data.quantityLitres > OIL_MAX_LITRES) {
        return problem({
          status: HttpStatusCode.BadRequest,
          detail: `Oil quantity cannot exceed ${OIL_MAX_LITRES} litres.`,
        })
      }

      // Only re-checked when the edit actually touches the canister or the
      // aircraft: POST's aircraft-match/isEmpty checks (above) apply here too,
      // but re-running them on every unrelated field edit would reject a record
      // whose canister has since emptied through normal, unrelated use.
      if (merged.oilCanisterId && (data.oilCanisterId !== undefined || data.aircraftRegistration)) {
        const canister = await getOilCanisterById(merged.oilCanisterId)
        if (!canister) {
          return problem({ status: HttpStatusCode.BadRequest, detail: 'Unknown oil canister.' })
        }
        if (canister.aircraftRegistration !== merged.aircraftRegistration) {
          return problem({
            status: HttpStatusCode.BadRequest,
            detail: `Canister ${canister.clubCanisterRef} belongs to ${canister.aircraftRegistration}.`,
          })
        }
        if (canister.isEmpty) {
          return problem({
            status: HttpStatusCode.BadRequest,
            detail: `Canister ${canister.clubCanisterRef} is marked empty and is no longer in inventory.`,
          })
        }
      }
    }

    let providerId = data.providerId
    if (existing.liquidType === LiquidType.FUEL) {
      if (!merged.airport || !merged.fuelType) {
        return problem({
          status: HttpStatusCode.BadRequest,
          detail: 'A fuel record must keep its airport and fuel type.',
        })
      }
      await assertFuelTypeAllowed(merged.aircraftRegistration, merged.fuelType)
      assertCostPresentIfRequired(LiquidType.FUEL, merged.airport, merged.totalCost)
      // Re-resolved rather than carried over: the old provider may not sell at
      // the new airport, and at EFNU the fuel type decides it outright.
      providerId = await resolveProviderId(
        merged.airport,
        merged.fuelType,
        data.providerId ?? (existing.airport === merged.airport ? existing.providerId! : undefined),
      )
    }

    if (data.flightLogId) {
      const flight = await assertFlightLogLinkable(data.flightLogId, existing.memberId, req)
      if (flight.aircraftRegistration !== merged.aircraftRegistration) {
        return problem({
          status: HttpStatusCode.BadRequest,
          detail: `That flight was in ${flight.aircraftRegistration}, but this record is for ${merged.aircraftRegistration}.`,
        })
      }
    }

    const updated = await updateLiquidRecord(
      req.params.recordId,
      { ...data, providerId },
      req.user!.memberId!,
    )
    res.json(withLock(updated, req))
  },
)

/**
 * DELETE /v1/liquid/records/:recordId — a soft delete.
 *
 * The row stays so the audit trail and any FK from a claim or flight log stay
 * intact; every read filters it out.
 */
recordsRouter.delete(
  '/records/:recordId',
  async (req: Request<{ recordId: string }>, res: Response) => {
    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordMutable(existing, req.user!)
    await softDeleteLiquidRecord(req.params.recordId, req.user!.memberId!)
    res.status(HttpStatusCode.NoContent).send()
  },
)

/**
 * POST /v1/liquid/records/:recordId/link — attach an existing record to a
 * flight log, the "link one existing unlinked record" half of the flight-log
 * flow. The other half is just creating a record with `flightLogId` set.
 */
recordsRouter.post(
  '/records/:recordId/link',
  async (req: Request<{ recordId: string }>, res: Response) => {
    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordLinkable(existing, req.user!)

    const { flightLogId } = LinkFlightLogSchema.parse(req.body)

    // "A liquid record can be linked to at most one flight log."
    if (existing.flightLogId && existing.flightLogId !== flightLogId) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: `This record is already attached to flight ${existing.flightLogId}.`,
      })
    }

    // Authorized against the *caller*, not the record's original reporter —
    // linking someone else's recent fuelling is exactly the point (see
    // assertRecordLinkable), so it's "is the caller on this flight" that
    // decides it, same as attaching one's own record.
    const flight = await assertFlightLogLinkable(flightLogId, req.user!.memberId!, req)
    if (flight.aircraftRegistration !== existing.aircraftRegistration) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `That flight was in ${flight.aircraftRegistration}, but this record is for ${existing.aircraftRegistration}.`,
      })
    }

    const updated = await updateLiquidRecord(
      req.params.recordId,
      { flightLogId },
      req.user!.memberId!,
    )
    res.json(withLock(updated, req))
  },
)

/** POST /v1/liquid/records/:recordId/unlink — detach from its flight log. */
recordsRouter.post(
  '/records/:recordId/unlink',
  async (req: Request<{ recordId: string }>, res: Response) => {
    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordMutable(existing, req.user!)
    const updated = await updateLiquidRecord(
      req.params.recordId,
      { flightLogId: null },
      req.user!.memberId!,
    )
    res.json(withLock(updated, req))
  },
)

/**
 * POST /v1/liquid/records/:recordId/attachments — an optional receipt captured
 * while reporting a self-paid fuelling, so the member doesn't have to
 * remember to attach it later in the expense claim wizard (it's copied onto
 * the claim built from this record instead — see `syncClaimAttachmentsFromRecords`).
 * `assertRecordMutable` guards it the same as any other edit to the record: a
 * locked/claimed/expired record can't gain new attachments either.
 */
recordsRouter.post(
  '/records/:recordId/attachments',
  receiptUpload.array('files', MAX_ATTACHMENTS_PER_RECORD),
  async (req: Request<{ recordId: string }>, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined
    if (!files?.length) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'No files uploaded' })
    }

    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordMutable(existing, req.user!)

    const existingCount = await countLiquidRecordAttachments(req.params.recordId)
    if (existingCount + files.length > MAX_ATTACHMENTS_PER_RECORD) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `A fuelling can have at most ${MAX_ATTACHMENTS_PER_RECORD} receipts.`,
      })
    }

    // Same upload-then-write-rows-then-roll-back-on-failure shape as the expense
    // attachments route: every file lands in storage first, and a DB failure
    // partway through deletes everything already uploaded rather than leaving
    // the record pointing at attachments whose files don't exist.
    const uploadedKeys: string[] = []
    try {
      const stored: { storageKey: string; fileName: string; fileSize: number; mimeType: string }[] =
        []
      for (const file of files) {
        const { buffer, fileName, mimeType } = await processReceipt(file)
        const upload = await storageService.uploadFile(
          buffer,
          `${Date.now()}_${fileName}`,
          mimeType,
          `liquid-receipts/${req.params.recordId}`,
          RECEIPT_BUCKET,
        )
        uploadedKeys.push(upload.key)
        stored.push({ storageKey: upload.key, fileName, fileSize: buffer.length, mimeType })
      }

      const uploaded = await db.transaction().execute(async (txn) => {
        // The pre-check above is only a fast, non-authoritative rejection: two
        // concurrent uploads on the same record can both pass it and then both
        // insert. Locking the record row serialises them, so the recount right
        // before inserting is the one that actually enforces the cap.
        await txn
          .selectFrom('liquid.record')
          .select('recordId')
          .where('recordId', '=', req.params.recordId)
          .forUpdate()
          .executeTakeFirstOrThrow()

        const currentCount = await countLiquidRecordAttachments(req.params.recordId, txn)
        if (currentCount + stored.length > MAX_ATTACHMENTS_PER_RECORD) {
          return problem({
            status: HttpStatusCode.BadRequest,
            detail: `A fuelling can have at most ${MAX_ATTACHMENTS_PER_RECORD} receipts.`,
          })
        }

        const rows = []
        for (const attachment of stored) {
          rows.push(await addLiquidRecordAttachment(req.params.recordId, attachment, txn))
        }
        return rows
      })

      res.status(HttpStatusCode.Created).json(uploaded)
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) =>
          storageService.deleteFile(key, RECEIPT_BUCKET).catch((deleteError) => {
            logger.error('Failed to roll back uploaded liquid record attachment file', deleteError)
          }),
        ),
      )
      logger.error('Liquid record attachment upload failed', error)
      throw error
    }
  },
)

/** GET /v1/liquid/records/:recordId/attachments — list, for the report form's own summary. */
recordsRouter.get(
  '/records/:recordId/attachments',
  async (req: Request<{ recordId: string }>, res: Response) => {
    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordVisible(existing, req.user!)
    res.json(await getLiquidRecordAttachments(req.params.recordId))
  },
)

/**
 * GET /v1/liquid/records/:recordId/attachments/:attachmentId/url — a presigned
 * URL to view the receipt. `assertRecordVisible` rather than `assertRecordMutable`:
 * viewing a receipt on a record that's since been locked (claimed, validated,
 * past the edit window) is still allowed — only changing it is not.
 */
recordsRouter.get(
  '/records/:recordId/attachments/:attachmentId/url',
  async (req: Request<{ recordId: string; attachmentId: string }>, res: Response) => {
    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordVisible(existing, req.user!)

    const attachment = await getLiquidRecordAttachment(
      req.params.recordId,
      Number(req.params.attachmentId),
    )
    if (!attachment) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Attachment not found' })
    }

    const url = await storageService.getPresignedUrl(attachment.storageKey, 300, RECEIPT_BUCKET)
    res.json({ url })
  },
)

/** DELETE /v1/liquid/records/:recordId/attachments/:attachmentId */
recordsRouter.delete(
  '/records/:recordId/attachments/:attachmentId',
  async (req: Request<{ recordId: string; attachmentId: string }>, res: Response) => {
    const existing = await getExistingRecordOr404(req.params.recordId)
    assertRecordMutable(existing, req.user!)

    const attachment = await getLiquidRecordAttachment(
      req.params.recordId,
      Number(req.params.attachmentId),
    )
    if (!attachment) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Attachment not found' })
    }

    await deleteLiquidRecordAttachment(req.params.recordId, attachment.id)
    await storageService.deleteFile(attachment.storageKey, RECEIPT_BUCKET)

    res.status(HttpStatusCode.NoContent).send()
  },
)

/**
 * Guards `GET /records?flightLogId=` for a non-admin: the requester has to
 * have actually been on that flight (either party), not just anyone who knows
 * its id. 404 rather than 403, same reasoning as `assertRecordVisible` — a
 * member with no business on that flight shouldn't learn it exists.
 */
async function assertFlightViewable(flightLogId: string, memberId: string): Promise<void> {
  const flight = await db
    .selectFrom('flight.logs')
    .select(['billableMemberId', 'picMemberId'])
    .where('flightId', '=', flightLogId)
    .executeTakeFirst()

  if (!flight || (flight.billableMemberId !== memberId && flight.picMemberId !== memberId)) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'Flight log not found.' })
  }
}

/**
 * A flight log a record may be attached to: it has to exist, and — for anyone
 * but a liquid admin — still be editable and belong to the member.
 *
 * Returns the aircraft so a caller can compare it without a second read.
 */
async function assertFlightLogLinkable(
  flightLogId: string,
  recordMemberId: string,
  req: Request,
): Promise<{ aircraftRegistration: string }> {
  const flight = await db
    .selectFrom('flight.logs')
    .select(['aircraftRegistration', 'status', 'billableMemberId', 'picMemberId'])
    .where('flightId', '=', flightLogId)
    .executeTakeFirst()

  if (!flight) {
    return problem({ status: HttpStatusCode.BadRequest, detail: 'Unknown flight log.' })
  }

  if (isLiquidAdmin(req.user!)) {
    return { aircraftRegistration: flight.aircraftRegistration }
  }

  // Attaching an uplift to a validated flight would change a figure the club has
  // already checked — that is a liquid admin's call, not the member's.
  if (flight.status !== FlightLogStatus.NEW) {
    return problem({
      status: HttpStatusCode.Conflict,
      detail: 'That flight log has already been validated.',
    })
  }

  // The member has to have been on the flight, or it isn't theirs to annotate.
  if (flight.billableMemberId !== recordMemberId && flight.picMemberId !== recordMemberId) {
    return problem({
      status: HttpStatusCode.Forbidden,
      detail: 'That flight log belongs to another member.',
    })
  }

  return { aircraftRegistration: flight.aircraftRegistration }
}
