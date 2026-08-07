import { HttpStatusCode } from 'axios'
import dayjs from 'dayjs'
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import logger from '../../lib/logger.ts'
import { compressImageForUpload, IMAGE_UPLOAD_RAW_BYTES } from '../../util/imageUpload.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import {
  addExpenseMessage,
  setExpenseReceipt,
  approveExpenseClaim,
  createExpenseClaim,
  deleteExpenseClaim,
  getAllExpenseClaims,
  getExpenseCategories,
  getExpenseClaimById,
  getExpenseClaimEditAudit,
  getExpenseClaimsByMember,
  getPendingExpenseClaimsCount,
  markExpenseClaimPendingInfo,
  overrideFuelPrice,
  rejectExpenseClaim,
  retractExpenseClaim,
  setExpenseClaimToDraft,
  submitExpenseClaim,
  treasurerEditExpenseClaim,
  updateExpenseClaim,
} from '../../db/expense-queries.ts'
import { insertOutboxItem } from '../../db/outbox-simplbooks-queries.ts'
import {
  getClaimHetuFull,
  getMileageHetuAccessLog,
  getMileageReportRows,
  recordMileageHetuAccess,
} from '../../db/mileage-queries.ts'
import { db } from '../../db/connection.ts'
import { getMemberById, updateMember } from '../../db/member-queries.ts'
import { storageService } from '../../services/storage.ts'
import { SimplbooksEventType } from '../../services/simplbooks/models.ts'
import { computeDirectDistanceKm } from '../../services/mileageRouting.ts'
import {
  addExpenseAttachment,
  getExpenseAttachment,
  deleteExpenseAttachment,
} from '../../db/expense-attachment-queries.ts'
import { mergeAttachmentsToPdf } from '../../util/mergeAttachmentsToPdf.ts'
import { MIKPermissions } from '../members/models.ts'
import type { JWTUser } from '../auth/token.ts'
import { problem } from '../response.ts'
import {
  CreateExpenseClaimSchema,
  ExpenseClaimFiltersSchema,
  ExpenseClaimStatus,
  ExpenseMessageType,
  MileageReportFiltersSchema,
  OverrideFuelPriceSchema,
  RejectExpenseClaimSchema,
  RequestInfoSchema,
  TreasurerEditExpenseClaimSchema,
  UpdateExpenseClaimSchema,
} from './models.ts'
import type { CreateMileageLeg } from './mileageModels.ts'
import { expenseApprovedEmailTemplate } from '../../templates/expenseApprovedEmailTemplate.ts'
import { expenseRejectedEmailTemplate } from '../../templates/expenseRejectedEmailTemplate.ts'
import { expenseRequestInfoEmailTemplate } from '../../templates/expenseRequestInfoEmailTemplate.ts'
import { expenseSetToDraftEmailTemplate } from '../../templates/expenseSetToDraftEmailTemplate.ts'
import { expenseTreasurerEditedEmailTemplate } from '../../templates/expenseTreasurerEditedEmailTemplate.ts'
import { getEcbFxRate } from '../../services/ecbFxRate.ts'

export const router = Router()

const RECEIPT_BUCKET =
  process.env.EXPENSE_RECEIPT_BUCKET ??
  (process.env.NODE_ENV === 'production' ? 'mik-expense-receipts' : 'mik-expense-receipts-test')
const MAX_RECEIPT_BYTES = 1 * 1024 * 1024 // 1 MB — post-compression image limit
const MAX_PDF_BYTES = 5 * 1024 * 1024 // 5 MB — PDF size limit

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_RAW_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only image files or PDF documents are allowed for receipts'))
    }
  },
})

const hasExpenseAdmin = (req: Request): boolean =>
  req.user?.permissions.includes(MIKPermissions.EXPENSE_ADMIN) ?? false

const sanitizeFileName = (fileName: string): string => {
  const sanitized = fileName
    .replace(/\.[^.]+$/, '')
    .replaceAll(/[^a-zA-Z0-9_-]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '')

  return sanitized || 'receipt'
}

const buildClaimUrl = (claimId: string): string =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/expenses/${claimId}`

async function processReceipt(
  file: Express.Multer.File,
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  if (file.mimetype === 'application/pdf') {
    if (file.buffer.length > MAX_PDF_BYTES) {
      problem({
        status: HttpStatusCode.BadRequest,
        detail: `PDF receipt is too large (max ${MAX_PDF_BYTES / 1024 / 1024} MB).`,
      })
    }
    const safeName = `${sanitizeFileName(file.originalname)}.pdf`
    return { buffer: file.buffer, fileName: safeName, mimeType: 'application/pdf' }
  }

  const buffer = await compressImageForUpload(file.buffer, {
    maxWidth: 2000,
    maxHeight: 2000,
    targetBytes: MAX_RECEIPT_BYTES,
  })

  return {
    buffer,
    fileName: `${sanitizeFileName(file.originalname)}.jpg`,
    mimeType: 'image/jpeg',
  }
}

async function requireClaimForUser(req: Request<Record<string, string>>, claimId: string) {
  const claim = await getExpenseClaimById(claimId)
  if (!claim) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'Expense claim not found' })
  }

  if (!hasExpenseAdmin(req) && claim.memberId !== req.user!.memberId) {
    return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
  }

  return claim
}

// Claims created before this shipped (2026-07-25, see V1490 migration) may have fuel
// line items with no airport/date recorded — grandfathered in below so they remain
// submittable without backfilling. Anything created from this point on is expected to
// always have it filled in by submit time (see the comment on enforceFuelLineItemDetails).
const FUEL_LINE_ITEM_AIRPORT_DATE_CUTOFF = new Date('2026-07-26T00:00:00.000Z')

// Claims created before per-line-item aircraft selection shipped (2026-07-17, #963)
// may have no costCentreCode on their fuel line items - aircraft was still a
// claim-level field back then. Grandfathered in the same way as the airport/date
// cutoff above, so a legacy claim moved back to DRAFT (e.g. by an admin) and
// resubmitted isn't blocked on backfilling a field that didn't exist for it yet.
const FUEL_LINE_ITEM_AIRCRAFT_CUTOFF = new Date('2026-07-18T00:00:00.000Z')

async function validateCategoryRequirements(data: {
  categoryId?: number
  flightLogId?: string | null
  lineItems?: {
    id?: number
    costCentreCode?: string | null
    airport?: string | null
    date?: string | null
  }[]
  // Per-line-item fuel completeness (aircraft/airport/date) is a submit-time
  // requirement, not a create/save-draft one — a claim must be saveable mid-flight,
  // before the user has filled in every line item. Only POST /:id/submit passes true.
  enforceFuelLineItemDetails?: boolean
  // Only meaningful (and only needed) when enforceFuelLineItemDetails is true — used
  // to grandfather in claims that predate the airport/date field.
  claimCreatedAt?: string
}) {
  const categories = await getExpenseCategories()
  const category = categories.find((item) => item.id === data.categoryId)
  if (!category) {
    return problem({ status: HttpStatusCode.BadRequest, detail: 'Expense category not found' })
  }

  if (category.code === 'fuel' && data.enforceFuelLineItemDetails) {
    // NOT based on whether a line item has a persisted id, since by submit time every
    // item in a normal draft-then-submit flow already has one (it was assigned on the
    // earlier save-draft request), which would otherwise exempt everything.
    const claimCreatedAt = data.claimCreatedAt ? new Date(data.claimCreatedAt) : undefined
    const predatesAircraftField =
      !!claimCreatedAt && claimCreatedAt < FUEL_LINE_ITEM_AIRCRAFT_CUTOFF
    const predatesAirportDateField =
      !!claimCreatedAt && claimCreatedAt < FUEL_LINE_ITEM_AIRPORT_DATE_CUTOFF

    // Aircraft selection moved from claim-level to per-line-item (see V1360 migration),
    // so it's enforced here instead of the old claim-level aircraftId requirement.
    // Grandfathers in claims that predate the field (see FUEL_LINE_ITEM_AIRCRAFT_CUTOFF).
    if (!predatesAircraftField && (data.lineItems ?? []).some((item) => !item.costCentreCode)) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Each fuel line item requires an aircraft to be selected.',
      })
    }
    // Airport and date let us report recent fuel prices by outstation (see issue #966).
    // Grandfathers in claims that predate the field (issue #1020).
    if (
      !predatesAirportDateField &&
      (data.lineItems ?? []).some((item) => !item.airport || !item.date)
    ) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Each fuel line item requires an airport and date to be selected.',
      })
    }
  }

  return category
}

// Server-authoritative check for the >20% justification-note requirement (issue #1021).
// A client-submitted leg.directDistanceKm is advisory only — trusting it would let a
// client bypass the justification requirement outright by simply omitting the field
// (the "no directDistanceKm means skip the check" case, used for OSRM-outage tolerance,
// would otherwise apply unconditionally). This recomputes the direct distance itself via
// OSRM and overwrites each leg's directDistanceKm with that value before it's persisted,
// so both the stored figure and the justification check are based on a value the client
// never controls.
async function verifyMileageLegDistances(legs?: CreateMileageLeg[]): Promise<void> {
  if (!legs?.length) return
  // Each leg's OSRM lookup is independent — resolve them concurrently rather than
  // paying one round trip per leg back-to-back, then validate sequentially so the
  // first invalid leg's problem() response wins deterministically.
  const results = await Promise.all(
    legs.map(async (leg) => {
      // No coordinates (address lookup was unavailable when the member filled this leg
      // in, so they typed the address by hand) — nothing to verify against, same as an
      // unreachable OSRM: the justification check is skipped for this leg rather than
      // blocking submission on it.
      if (
        leg.startLat == null ||
        leg.startLon == null ||
        leg.endLat == null ||
        leg.endLon == null
      ) {
        return { leg, serverDirectKm: null }
      }
      const serverDirectKm = await computeDirectDistanceKm(
        { lat: leg.startLat, lon: leg.startLon },
        { lat: leg.endLat, lon: leg.endLon },
      )
      return { leg, serverDirectKm }
    }),
  )
  for (const { leg, serverDirectKm } of results) {
    leg.directDistanceKm = serverDirectKm ?? undefined
    // Nullish check, not falsy — serverDirectKm can legitimately be 0.
    if (
      serverDirectKm != null &&
      leg.distanceKm > serverDirectKm * 1.2 &&
      !leg.justificationNote?.trim()
    ) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `A justification note is required: the leg from "${leg.startAddress}" to "${leg.endAddress}" (${leg.distanceKm} km) is more than 20% longer than the direct route (${serverDirectKm} km).`,
      })
    }
  }
}

async function syncMemberIbanFromClaim(
  user: JWTUser,
  iban?: string | null,
  ibanAccountName?: string | null,
): Promise<void> {
  const normalizedIban = iban?.trim()
  if (!normalizedIban) {
    return
  }

  const member = await getMemberById(user.memberId)
  if (!member) {
    return
  }

  const normalizedCurrentIban = member.iban?.trim() ?? null
  const normalizedCurrentAccountName = member.ibanAccountName?.trim() ?? null
  const normalizedClaimAccountName = ibanAccountName?.trim() ?? normalizedCurrentAccountName

  if (
    normalizedCurrentIban === normalizedIban &&
    normalizedCurrentAccountName === normalizedClaimAccountName
  ) {
    return
  }

  await updateMember(
    user.memberId,
    {
      iban: normalizedIban,
      ibanAccountName: normalizedClaimAccountName,
    },
    user,
  )
}

router.get(
  '/categories',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (_req: Request<Record<string, string>>, res: Response) => {
    res.status(HttpStatusCode.Ok).json(await getExpenseCategories())
  },
)

router.get(
  '/fx-rate',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const { date, currency } = req.query
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'date must be YYYY-MM-DD' })
    }
    if (typeof currency !== 'string' || currency.length !== 3) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'currency must be a 3-letter ISO 4217 code',
      })
    }
    try {
      const result = await getEcbFxRate(currency.toUpperCase(), date)
      res.status(HttpStatusCode.Ok).json(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch FX rate'
      return problem({ status: HttpStatusCode.BadGateway, detail: msg })
    }
  },
)

router.get(
  '/',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const filters = ExpenseClaimFiltersSchema.parse(req.query)
    res.status(HttpStatusCode.Ok).json(await getExpenseClaimsByMember(req.user!.memberId, filters))
  },
)

router.post(
  '/',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const data = CreateExpenseClaimSchema.parse(req.body)
    await validateCategoryRequirements({
      categoryId: data.categoryId,
      flightLogId: data.flightLogId ?? null,
      lineItems: data.lineItems,
    })
    await verifyMileageLegDistances(data.mileageLegs)

    // Auto-populate IBAN from member profile if not supplied in request
    const claimData = { ...data }
    if (!claimData.iban) {
      const member = await getMemberById(req.user!.memberId)
      if (member?.iban) {
        claimData.iban = member.iban
        claimData.ibanAccountName = claimData.ibanAccountName ?? member.ibanAccountName ?? undefined
      }
    }

    const claim = await createExpenseClaim(claimData, req.user!)
    await syncMemberIbanFromClaim(req.user!, claim.iban, claim.ibanAccountName)

    res.status(HttpStatusCode.Created).json(claim)
  },
)

router.get(
  '/admin/all',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const filters = ExpenseClaimFiltersSchema.parse(req.query)
    res.status(HttpStatusCode.Ok).json(await getAllExpenseClaims(filters))
  },
)

router.get(
  '/admin/pending/count',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (_req: Request<Record<string, string>>, res: Response) => {
    res.status(HttpStatusCode.Ok).json({ count: await getPendingExpenseClaimsCount() })
  },
)

// Tulorekisteri (Finnish income register) mileage report — see issue #1022.
// Never includes HETU: it's a worklist of claims to file, not the filing itself.
router.get(
  '/admin/mileage-report',
  validateUser(MIKPermissions.EXPENSE_HETU_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = MileageReportFiltersSchema.safeParse(req.query)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'startDate and endDate are required in YYYY-MM-DD format.',
        extensions: { errors: parsed.error.issues },
      })
    }
    const filters = parsed.data

    if (dayjs(filters.endDate).isAfter(dayjs(), 'day')) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'End date cannot be in the future.',
      })
    }
    if (dayjs(filters.startDate).isAfter(dayjs(filters.endDate), 'day')) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Start date cannot be after end date.',
      })
    }

    res.status(HttpStatusCode.Ok).json({ data: await getMileageReportRows(filters), filters })
  },
)

router.get(
  '/:id',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    res.status(HttpStatusCode.Ok).json(await requireClaimForUser(req, req.params.id))
  },
)

// Audited plaintext HETU reveal — see issue #1022. Narrower than EXPENSE_ADMIN:
// only treasurer/chairman (whoever holds EXPENSE_HETU_ADMIN) may reveal it, and
// no owner-self-service path exists, unlike the other :id-scoped routes below.
router.get(
  '/:id/mileage/hetu',
  validateUser(MIKPermissions.EXPENSE_HETU_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await getExpenseClaimById(req.params.id)
    if (!claim) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Expense claim not found' })
    }
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'HETU can only be revealed for approved claims.',
      })
    }

    const hetu = await getClaimHetuFull(claim.id)
    if (!hetu) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'No HETU on file for this claim' })
    }

    // Fail closed: if the audit write throws, the request throws too and no HETU is sent.
    await recordMileageHetuAccess(claim.id, req.user!.memberId)

    res.status(HttpStatusCode.Ok).json({ hetu })
  },
)

// Who has viewed this claim's HETU and when — visible to the claim owner (and
// EXPENSE_ADMIN) so members can see who accessed their personal identifier,
// separate from EXPENSE_HETU_ADMIN which gates revealing the value itself.
router.get(
  '/:id/mileage/hetu/access-log',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    res.status(HttpStatusCode.Ok).json({ data: await getMileageHetuAccessLog(claim.id) })
  },
)

router.put(
  '/:id',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await requireClaimForUser(req, req.params.id)
    if (existing.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (![ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.PENDING_INFO].includes(existing.status)) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Only draft or pending-info claims can be edited.',
      })
    }

    const patch = UpdateExpenseClaimSchema.parse(req.body)
    await validateCategoryRequirements({
      categoryId: patch.categoryId ?? existing.categoryId,
      flightLogId: patch.flightLogId ?? existing.flightLogId ?? undefined,
      lineItems: patch.lineItems ?? existing.lineItems,
    })
    await verifyMileageLegDistances(patch.mileageLegs)

    const claim = await updateExpenseClaim(req.params.id, patch, req.user!)
    await syncMemberIbanFromClaim(req.user!, claim?.iban, claim?.ibanAccountName)

    res.status(HttpStatusCode.Ok).json(claim)
  },
)

// Treasurer-only surgical edit of a claim awaiting approval (issue #1028) — lets a
// treasurer fix small mistakes (wrong item code, wrong airport, etc.) without sending
// the claim back to the member. Deliberately narrower than PUT /:id above: only
// EXPENSE_ADMIN may call it, it never resets status, and every changed field is logged
// to accts.expense_claim_edit_audit (see treasurerEditExpenseClaim).
router.patch(
  '/:id/edit',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const existing = await requireClaimForUser(req, req.params.id)
    if (existing.memberId === req.user!.memberId) {
      return problem({
        status: HttpStatusCode.Forbidden,
        detail: 'You cannot edit your own expense claim this way — use the normal edit flow.',
      })
    }
    if (
      ![ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO].includes(existing.status)
    ) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Only claims awaiting approval (submitted or pending info) can be edited this way.',
      })
    }

    const patch = TreasurerEditExpenseClaimSchema.parse(req.body)
    await validateCategoryRequirements({
      categoryId: existing.categoryId,
      flightLogId: existing.flightLogId ?? undefined,
      // Merge each patched field onto the existing line item — a partial edit (e.g.
      // just { id, airport }) must not replace the whole item wholesale, or the other
      // required fields (quantity, unit, costCentreCode, ...) vanish from validation.
      lineItems: patch.lineItems?.length
        ? existing.lineItems?.map((li) => {
            const edit = patch.lineItems!.find((edited) => edited.id === li.id)
            return edit ? { ...li, ...edit } : li
          })
        : existing.lineItems,
      enforceFuelLineItemDetails: true,
      claimCreatedAt: existing.createdAt,
    })

    const { claim, changedFieldCount } = await treasurerEditExpenseClaim(
      req.params.id,
      patch,
      req.user!,
    )

    if (changedFieldCount > 0) {
      await addExpenseMessage(
        claim.id,
        req.user!.memberId,
        ExpenseMessageType.SYSTEM,
        `Treasurer corrected ${changedFieldCount} field${changedFieldCount === 1 ? '' : 's'} on this claim before approval.`,
      )

      const member = await getMemberById(claim.memberId)
      if (member) {
        const auditEntries = await getExpenseClaimEditAudit(claim.id)
        const changesSummary = auditEntries
          .slice(0, changedFieldCount)
          .map(
            (entry) =>
              `- **${entry.fieldName}**: ${entry.oldValue ?? '—'} → ${entry.newValue ?? '—'}`,
          )
          .join('\n')
        const template = expenseTreasurerEditedEmailTemplate(member.lang, {
          memberName: `${member.firstName} ${member.lastName}`,
          claimTitle: claim.title,
          claimUrl: buildClaimUrl(claim.id),
          changesSummary,
        })
        void sendEmail(member.email, template.subject, template.html).catch((error) => {
          logger.error('Failed to send treasurer-edited expense claim email', error)
        })
      }
    }

    res.status(HttpStatusCode.Ok).json(claim)
  },
)

router.delete(
  '/:id',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (claim.status !== ExpenseClaimStatus.DRAFT) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Only draft claims can be deleted.',
      })
    }

    await deleteExpenseClaim(req.params.id)
    res.status(HttpStatusCode.NoContent).end()
  },
)

router.post(
  '/:id/submit',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (![ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({ status: HttpStatusCode.Conflict, detail: 'Claim cannot be submitted.' })
    }

    await validateCategoryRequirements({
      categoryId: claim.categoryId,
      flightLogId: claim.flightLogId ?? undefined,
      lineItems: claim.lineItems,
      enforceFuelLineItemDetails: true,
      claimCreatedAt: claim.createdAt,
    })

    // Line items are intentionally not required to be complete at creation/save-draft
    // time (see ExpenseLineItemSchema/CreateExpenseClaimSchema in models.ts) so a
    // partially-filled claim can still be saved and resumed later — enforced here
    // instead, at the point the claim actually becomes payable.
    if (!claim.lineItems?.length) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'At least one line item is required.',
      })
    }
    if (claim.lineItems.some((item) => !item.description?.trim())) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Every line item needs a description.',
      })
    }

    if (!claim.iban?.trim()) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'IBAN is required for reimbursement.',
      })
    }

    if (!claim.ibanAccountName?.trim()) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Account holder name is required.',
      })
    }

    if (!claim.expenseDate) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Expense date is required.' })
    }

    // Mileage claims have no receipt to attach — the reimbursement is computed from the
    // server-verified distance instead. Every other category needs at least one
    // (new-flow) attachment or a (legacy) single receipt on file before it can be paid.
    if (claim.categoryCode !== 'mileage' && !claim.attachments?.length && !claim.receipt) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'At least one receipt attachment is required before submitting.',
      })
    }

    const claimTotal = (claim.lineItems ?? []).reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    )
    if (claimTotal <= 0) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Total amount must be greater than zero.',
      })
    }

    await submitExpenseClaim(req.params.id, req.user!)
    res.status(HttpStatusCode.Ok).json(await getExpenseClaimById(req.params.id))
  },
)

router.post(
  '/:id/retract',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (claim.status !== ExpenseClaimStatus.SUBMITTED) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Only submitted claims can be retracted.',
      })
    }
    const success = await retractExpenseClaim(req.params.id, req.user!.memberId)
    if (!success) {
      return problem({ status: HttpStatusCode.Conflict, detail: 'Claim could not be retracted.' })
    }
    res.status(HttpStatusCode.Ok).json(await getExpenseClaimById(req.params.id))
  },
)

router.post(
  '/:id/receipt',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  receiptUpload.single('file'),
  async (req: Request<Record<string, string>>, res: Response) => {
    if (!req.file) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'No receipt uploaded' })
    }

    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (![ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Receipts can only be modified while the claim is editable.',
      })
    }

    // Delete previous receipt file from storage if one exists
    if (claim.receipt?.storageKey) {
      await storageService.deleteFile(claim.receipt.storageKey, RECEIPT_BUCKET).catch((err) => {
        logger.error('Failed to delete previous receipt file', err)
      })
    }

    let uploadKey: string | undefined
    try {
      const { buffer, fileName, mimeType } = await processReceipt(req.file)
      const upload = await storageService.uploadFile(
        buffer,
        `${Date.now()}_${fileName}`,
        mimeType,
        `expense-receipts/${req.params.id}`,
        RECEIPT_BUCKET,
      )
      uploadKey = upload.key

      await setExpenseReceipt(req.params.id, {
        storageKey: upload.key,
        fileName,
        fileSize: buffer.length,
        mimeType,
      })

      const updated = await getExpenseClaimById(req.params.id)
      res.status(HttpStatusCode.Ok).json(updated?.receipt)
    } catch (error) {
      if (uploadKey) {
        await storageService.deleteFile(uploadKey, RECEIPT_BUCKET).catch((deleteError) => {
          logger.error('Failed to roll back uploaded receipt file', deleteError)
        })
      }
      logger.error('Expense receipt upload failed', error)
      throw error
    }
  },
)

router.delete(
  '/:id/receipt',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (![ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Receipts can only be removed while the claim is editable.',
      })
    }
    if (!claim.receipt?.storageKey) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'No receipt to delete' })
    }

    await setExpenseReceipt(req.params.id, null)
    await storageService.deleteFile(claim.receipt.storageKey, RECEIPT_BUCKET)

    res.status(HttpStatusCode.NoContent).end()
  },
)

router.get(
  '/:id/receipt',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (!claim.receipt?.storageKey) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'No receipt found' })
    }
    const url = await storageService.getPresignedUrl(claim.receipt.storageKey, 300, RECEIPT_BUCKET)
    res.status(HttpStatusCode.Ok).json({ url })
  },
)

// ─── Multiple attachments (issue #955) ───────────────────────────────────────
// New claims use this instead of the singular /:id/receipt above — SimplBooks only
// accepts one attachment per purchase, so they're merged into a single PDF below.

const MAX_ATTACHMENTS_PER_CLAIM = 10

router.post(
  '/:id/attachments',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  receiptUpload.array('files', MAX_ATTACHMENTS_PER_CLAIM),
  async (req: Request<Record<string, string>>, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined
    if (!files?.length) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'No files uploaded' })
    }

    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (![ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Attachments can only be modified while the claim is editable.',
      })
    }
    const existingCount = claim.attachments?.length ?? 0
    if (existingCount + files.length > MAX_ATTACHMENTS_PER_CLAIM) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `A claim can have at most ${MAX_ATTACHMENTS_PER_CLAIM} attachments.`,
      })
    }

    const uploadedKeys: string[] = []
    try {
      const uploaded = []
      for (const file of files) {
        const { buffer, fileName, mimeType } = await processReceipt(file)
        const upload = await storageService.uploadFile(
          buffer,
          `${Date.now()}_${fileName}`,
          mimeType,
          `expense-receipts/${req.params.id}`,
          RECEIPT_BUCKET,
        )
        uploadedKeys.push(upload.key)
        uploaded.push(
          await addExpenseAttachment(req.params.id, {
            storageKey: upload.key,
            fileName,
            fileSize: buffer.length,
            mimeType,
          }),
        )
      }
      res.status(HttpStatusCode.Created).json(uploaded)
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) =>
          storageService.deleteFile(key, RECEIPT_BUCKET).catch((deleteError) => {
            logger.error('Failed to roll back uploaded attachment file', deleteError)
          }),
        ),
      )
      logger.error('Expense attachment upload failed', error)
      throw error
    }
  },
)

router.delete(
  '/:id/attachments/:attachmentId',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.memberId !== req.user!.memberId) {
      return problem({ status: HttpStatusCode.Forbidden, detail: 'Protected Content' })
    }
    if (![ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Attachments can only be removed while the claim is editable.',
      })
    }
    const attachment = await getExpenseAttachment(req.params.id, Number(req.params.attachmentId))
    if (!attachment) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'Attachment not found' })
    }

    await deleteExpenseAttachment(req.params.id, attachment.id)
    await storageService.deleteFile(attachment.storageKey, RECEIPT_BUCKET)

    res.status(HttpStatusCode.NoContent).end()
  },
)

// Combined PDF for both the member's pre-submit preview and the admin's approval-time
// review — SimplBooks needs exactly one attachment, so this is also what gets sent
// there at approval time (see createExpenseReimbursement in simplbooksOutboxHandler.ts).
router.get(
  '/:id/attachments/merged-preview',
  validateUser(MIKPermissions.EXPENSE_USER, MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (!claim.attachments?.length) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'No attachments to preview' })
    }

    const files = await Promise.all(
      claim.attachments.map(async (attachment) => ({
        buffer: await storageService.downloadFile(attachment.storageKey, RECEIPT_BUCKET),
        mimeType: attachment.mimeType,
      })),
    )
    const merged = await mergeAttachmentsToPdf(files)

    res.setHeader('Content-Type', 'application/pdf')
    res.status(HttpStatusCode.Ok).send(merged)
  },
)

router.post(
  '/:id/approve',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (req.user!.memberId === claim.memberId) {
      return problem({
        status: HttpStatusCode.Forbidden,
        detail: 'You cannot approve your own expense claim. Another user must approve.',
      })
    }
    if (![ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({ status: HttpStatusCode.Conflict, detail: 'Claim is not awaiting approval.' })
    }
    if (!claim.categoryCode) {
      return problem({
        status: HttpStatusCode.InternalServerError,
        detail: 'Expense category missing.',
      })
    }

    await db.transaction().execute(async (txn) => {
      await approveExpenseClaim(req.params.id, req.user!.memberId, txn)
      await insertOutboxItem(
        SimplbooksEventType.REIMBURSEMENT,
        {
          claimId: claim.id,
          number: claim.id,
          memberId: claim.memberId,
          categoryCode: claim.categoryCode,
          aircraftRegistration: claim.aircraftId ?? undefined,
          currency: claim.currency ?? 'EUR',
          fxRate: claim.fxRate ?? null,
          transactionDate: (claim.expenseDate as string | null | undefined) ?? undefined,
          submittedAt: claim.submittedAt ?? undefined,
          due: claim.submittedAt
            ? new Date(new Date(claim.submittedAt).getTime() + 14 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)
            : undefined,
          claimIban: claim.iban ?? undefined,
          claimTitle: claim.title,
          lineItems: (claim.lineItems ?? []).map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalCost: item.totalCost ?? null,
            articleId: item.itemId ?? null,
            costCentreCode: item.costCentreCode ?? undefined,
          })),
        },
        txn,
      )
    })

    const member = await getMemberById(claim.memberId)
    if (member) {
      const template = expenseApprovedEmailTemplate(member.lang, {
        memberName: `${member.firstName} ${member.lastName}`,
        claimTitle: claim.title,
        claimUrl: buildClaimUrl(claim.id),
      })
      void sendEmail(member.email, template.subject, template.html).catch((error) => {
        logger.error('Failed to send expense approval email', error)
      })
    }

    res.status(HttpStatusCode.Ok).json(await getExpenseClaimById(req.params.id))
  },
)

router.post(
  '/:id/reject',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (![ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({ status: HttpStatusCode.Conflict, detail: 'Claim is not awaiting approval.' })
    }

    const { reason } = RejectExpenseClaimSchema.parse(req.body)
    await rejectExpenseClaim(req.params.id, req.user!.memberId, reason)

    const member = await getMemberById(claim.memberId)
    if (member) {
      const template = expenseRejectedEmailTemplate(member.lang, {
        memberName: `${member.firstName} ${member.lastName}`,
        claimTitle: claim.title,
        rejectionReason: reason,
        claimUrl: buildClaimUrl(claim.id),
      })
      void sendEmail(member.email, template.subject, template.html).catch((error) => {
        logger.error('Failed to send expense rejection email', error)
      })
    }

    res.status(HttpStatusCode.Ok).json(await getExpenseClaimById(req.params.id))
  },
)

router.post(
  '/:id/override-fuel-price',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (claim.categoryCode !== 'fuel') {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'EFNU fuel price override only applies to fuel claims.',
      })
    }
    if (![ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({ status: HttpStatusCode.Conflict, detail: 'Claim is not awaiting approval.' })
    }

    const { efnuPrice } = OverrideFuelPriceSchema.parse(req.body)
    await overrideFuelPrice(req.params.id, efnuPrice)
    await addExpenseMessage(
      claim.id,
      req.user!.memberId,
      ExpenseMessageType.SYSTEM,
      `EFNU fuel price cap of ${efnuPrice.toFixed(2)} EUR/L applied by administrator.`,
    )

    res.status(HttpStatusCode.Ok).json(await getExpenseClaimById(req.params.id))
  },
)

router.post(
  '/:id/request-info',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    if (![ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO].includes(claim.status)) {
      return problem({ status: HttpStatusCode.Conflict, detail: 'Claim is not awaiting review.' })
    }

    const { message } = RequestInfoSchema.parse(req.body)
    await db.transaction().execute(async (txn) => {
      await addExpenseMessage(
        claim.id,
        req.user!.memberId,
        ExpenseMessageType.REQUEST_INFO,
        message,
        txn,
      )
      await markExpenseClaimPendingInfo(claim.id, txn)
    })

    const member = await getMemberById(claim.memberId)
    if (member) {
      const template = expenseRequestInfoEmailTemplate(member.lang, {
        memberName: `${member.firstName} ${member.lastName}`,
        claimTitle: claim.title,
        adminMessage: message,
        claimUrl: buildClaimUrl(claim.id),
      })
      void sendEmail(member.email, template.subject, template.html).catch((error) => {
        logger.error('Failed to send expense info-request email', error)
      })
    }

    res.status(HttpStatusCode.Ok).json(await getExpenseClaimById(req.params.id))
  },
)

router.post(
  '/:id/set-draft',
  validateUser(MIKPermissions.EXPENSE_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const claim = await requireClaimForUser(req, req.params.id)
    const allowedStatuses = [
      ExpenseClaimStatus.SUBMITTED,
      ExpenseClaimStatus.PENDING_INFO,
      ExpenseClaimStatus.APPROVED,
      ExpenseClaimStatus.REJECTED,
    ]
    if (!allowedStatuses.includes(claim.status)) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Claim cannot be set back to draft from its current status.',
      })
    }

    await setExpenseClaimToDraft(req.params.id, req.user!.memberId)

    const member = await getMemberById(claim.memberId)
    if (member) {
      const template = expenseSetToDraftEmailTemplate(member.lang, {
        memberName: `${member.firstName} ${member.lastName}`,
        claimTitle: claim.title,
        claimUrl: buildClaimUrl(claim.id),
      })
      void sendEmail(member.email, template.subject, template.html).catch((error) => {
        logger.error('Failed to send expense set-to-draft email', error)
      })
    }

    res.status(HttpStatusCode.Ok).json(await getExpenseClaimById(req.params.id))
  },
)
