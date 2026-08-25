import { randomBytes } from 'node:crypto'
import { HttpStatusCode } from 'axios'
import { Router, type Request, type Response } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { problem } from '../response.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  AssignQrCodeSchema,
  CreateQrBatchSchema,
  QrCodeFilterSchema,
  QrResolveStatus,
  QrTargetType,
  type QrBatch,
  type QrCode,
  type QrResolveResponse,
} from '@mik/contracts/liquid'
import {
  assignQrCode,
  createQrBatch,
  getOilCanisterById,
  getQrBatch,
  getQrCodeByCode,
  listFuelStations,
  listOilCanisters,
  listQrBatches,
  listQrCodes,
  resolveQrPrefill,
} from '../../db/liquid-queries.ts'
import { buildQrSheetPdf } from '../../services/liquid/qrSheet.ts'
import { isLiquidAdmin } from './guards.ts'

export const qrRouter = Router()

const publicUrl = () => process.env.PUBLIC_URL ?? 'http://localhost:5173'

/**
 * GET /v1/liquid/qr/:code/resolve — what a scanned sticker means.
 *
 * Open to every liquid user, because scanning is how a member reports. What they
 * get back depends on who they are:
 *
 *   - assigned → the reporting context to prefill;
 *   - unassigned, liquid admin → the assignment flow;
 *   - unassigned, anyone else → "not assigned yet", and nothing more. Non-admins
 *     must not be able to assign a code, so they are not offered the option.
 *
 * Declared before the collection routes because `:code` would otherwise swallow
 * `batches`.
 */
qrRouter.get(
  '/:code/resolve',
  validateUser(MIKPermissions.LIQUID_USER, MIKPermissions.LIQUID_ADMIN),
  async (req: Request<{ code: string }>, res: Response<QrResolveResponse>) => {
    const code = req.params.code
    const qr = await getQrCodeByCode(code)
    if (!qr) {
      return problem({
        status: HttpStatusCode.NotFound,
        detail: 'That QR code was not issued by the club.',
      })
    }

    if (qr.targetType) {
      const prefill = await resolveQrPrefill(qr)
      if (!prefill) {
        // The sticker outlived its target — a canister that was deleted, or a
        // pump taken out of service. Not a bad scan, but there is nothing to
        // prefill, and the binding is permanent so it cannot be repointed.
        return problem({
          status: HttpStatusCode.Gone,
          detail:
            'This code points at something that no longer exists. Tell a liquid administrator.',
        })
      }
      return void res.json({ status: QrResolveStatus.ASSIGNED, code, prefill })
    }

    if (isLiquidAdmin(req.user!)) {
      return void res.json({ status: QrResolveStatus.UNASSIGNED_ASSIGNABLE, code, qr })
    }

    res.json({ status: QrResolveStatus.UNASSIGNED, code })
  },
)

// Everything below manages codes rather than using them.
qrRouter.use(validateUser(MIKPermissions.LIQUID_ADMIN))

qrRouter.get('/batches', async (_req: Request, res: Response<QrBatch[]>) => {
  res.json(await listQrBatches())
})

/**
 * POST /v1/liquid/qr/batches — mint N unassigned identities.
 *
 * "Generate QR identities before assigning them to a target": the rows exist
 * immediately, the targets come later, and the printed image never encodes one.
 */
qrRouter.post('/batches', async (req: Request, res: Response) => {
  const { label, count } = CreateQrBatchSchema.parse(req.body)
  const { batch, codes } = await createQrBatch(label, count, req.user!.memberId!, (bytes) =>
    randomBytes(bytes),
  )
  res.status(HttpStatusCode.Created).json({ batch, codes })
})

/**
 * A batch's codes are minted once and never change, so the rendered sheet for
 * a given batchId is the same PDF forever — cached so the Ctrl-P workflow this
 * is meant for doesn't re-run PDF generation (and, per code, N QR renders) on
 * every hit. Unbounded by batch count (there can only be so many QR batches)
 * and cleared by a process restart, which is fine: re-rendering once is cheap,
 * it's the repeat hits this avoids.
 */
const qrSheetCache = new Map<string, Buffer>()

/**
 * GET /v1/liquid/qr/batches/:batchId/sheet.pdf — the printable A4 sheets.
 *
 * Inline rather than an attachment: the admin's next action is Ctrl-P, and a
 * download that lands in a folder adds a step to that.
 */
qrRouter.get(
  '/batches/:batchId/sheet.pdf',
  async (req: Request<{ batchId: string }>, res: Response) => {
    const batch = await getQrBatch(req.params.batchId)
    if (!batch) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'QR batch not found.' })
    }

    let pdf = qrSheetCache.get(batch.batchId)
    if (!pdf) {
      const codes = await listQrCodes({ batchId: batch.batchId, unassignedOnly: false })
      pdf = await buildQrSheetPdf(codes, { publicUrl: publicUrl(), batchLabel: batch.label })
      qrSheetCache.set(batch.batchId, pdf)
    }

    res
      .status(HttpStatusCode.Ok)
      .contentType('application/pdf')
      .setHeader(
        'Content-Disposition',
        `inline; filename="mik-liquid-qr-${batch.batchId.slice(0, 8)}.pdf"`,
      )
      .send(pdf)
  },
)

qrRouter.get('/', async (req: Request, res: Response<QrCode[]>) => {
  res.json(await listQrCodes(QrCodeFilterSchema.parse(req.query)))
})

/**
 * GET /v1/liquid/qr/targets — everything a code can currently be pointed at.
 *
 * One request rather than two, because the assignment form is a single dropdown
 * of "canister or pump".
 */
qrRouter.get('/targets', async (_req: Request, res: Response) => {
  const [stations, allCanisters, allCodes] = await Promise.all([
    listFuelStations(),
    // Only assignable stock: sticking a code on an empty canister would burn the
    // identity permanently on something already out of inventory.
    listOilCanisters({ includeEmpty: false }),
    listQrCodes({ unassignedOnly: false }),
  ])

  const alreadyStickered = new Set(
    allCodes.filter((c) => c.targetType === QrTargetType.OIL_CANISTER).map((c) => c.targetId),
  )
  const canisters = allCanisters.filter((c) => !alreadyStickered.has(c.canisterId))

  res.json({
    oilCanisters: canisters.map((c) => ({
      targetId: c.canisterId,
      label: `${c.clubCanisterRef} · ${c.aircraftRegistration} · ${c.make} ${c.modelViscosity}`,
    })),
    fuelStations: stations.map((s) => ({
      targetId: s.stationId,
      label: [s.label, s.providerName].filter(Boolean).join(' · '),
    })),
  })
})

/**
 * POST /v1/liquid/qr/:code/assign — bind a code to a target, permanently.
 *
 * The sticker is physically on the object, so a reassignment would send every
 * future scan to the wrong canister. Refused here, refused again by a BEFORE
 * UPDATE trigger, and the `target_type IS NULL` predicate on the update makes
 * two admins racing on the same fresh code safe.
 */
qrRouter.post('/:code/assign', async (req: Request<{ code: string }>, res: Response<QrCode>) => {
  const { targetType, targetId } = AssignQrCodeSchema.parse(req.body)
  const existing = await getQrCodeByCode(req.params.code)
  if (!existing) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'QR code not found.' })
  }
  if (existing.targetType) {
    return problem({
      status: HttpStatusCode.Conflict,
      detail: `${existing.code} is already assigned to ${existing.targetLabel ?? existing.targetId} and cannot be reassigned.`,
    })
  }

  await assertTargetExists(targetType, targetId)

  const assigned = await assignQrCode(req.params.code, targetType, targetId, req.user!.memberId!)
  if (!assigned) {
    // Lost the race: somebody assigned this code between the read above and the
    // update. The binding is permanent, so there is nothing to retry.
    return problem({
      status: HttpStatusCode.Conflict,
      detail: 'That QR code was just assigned by someone else.',
    })
  }
  res.json(assigned)
})

async function assertTargetExists(targetType: QrTargetType, targetId: string): Promise<void> {
  if (targetType === QrTargetType.OIL_CANISTER) {
    const canister = await getOilCanisterById(targetId)
    if (!canister) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Unknown oil canister.' })
    }
    if (canister.isEmpty) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'That canister is empty. Assign the code to one still in inventory.',
      })
    }
    return
  }

  const stations = await listFuelStations()
  if (!stations.some((s) => s.stationId === targetId)) {
    return problem({ status: HttpStatusCode.BadRequest, detail: 'Unknown fuel station.' })
  }
}
