import { HttpStatusCode } from 'axios'
import dayjs from 'dayjs'
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import logger from '../../lib/logger.ts'
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
  getExpenseClaimsByMember,
  getPendingExpenseClaimsCount,
  markExpenseClaimPendingInfo,
  overrideFuelPrice,
  rejectExpenseClaim,
  retractExpenseClaim,
  setExpenseClaimToDraft,
  submitExpenseClaim,
  updateExpenseClaim,
} from '../../db/expense-queries.ts'
import { insertOutboxItem } from '../../db/outbox-simplbooks-queries.ts'
import {
  getMileageDetailFullHetu,
  getMileageReportRows,
  recordMileageHetuAccess,
} from '../../db/mileage-queries.ts'
import { db } from '../../db/connection.ts'
import { getMemberById, updateMember } from '../../db/member-queries.ts'
import { storageService } from '../../services/storage.ts'
import { SimplbooksEventType } from '../../services/simplbooks/models.ts'
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
  UpdateExpenseClaimSchema,
} from './models.ts'
import { expenseApprovedEmailTemplate } from '../../templates/expenseApprovedEmailTemplate.ts'
import { expenseRejectedEmailTemplate } from '../../templates/expenseRejectedEmailTemplate.ts'
import { expenseRequestInfoEmailTemplate } from '../../templates/expenseRequestInfoEmailTemplate.ts'
import { expenseSetToDraftEmailTemplate } from '../../templates/expenseSetToDraftEmailTemplate.ts'
import { getEcbFxRate } from '../../services/ecbFxRate.ts'

export const router = Router()

const RECEIPT_BUCKET =
  process.env.EXPENSE_RECEIPT_BUCKET ??
  (process.env.NODE_ENV === 'production' ? 'mik-expense-receipts' : 'mik-expense-receipts-test')
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB — raw upload limit before compression
const MAX_RECEIPT_BYTES = 1 * 1024 * 1024 // 1 MB — post-compression image limit
const MAX_PDF_BYTES = 5 * 1024 * 1024 // 5 MB — PDF size limit

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
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

  const buildImage = () =>
    sharp(file.buffer)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })

  let buffer = await buildImage().jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  if (buffer.length > MAX_RECEIPT_BYTES) {
    buffer = await buildImage().jpeg({ quality: 70, mozjpeg: true }).toBuffer()
  }

  if (buffer.length > MAX_RECEIPT_BYTES) {
    problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Receipt image is too large after compression. Please upload a smaller image.',
    })
  }

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

    const hetu = await getMileageDetailFullHetu(claim.id)
    if (!hetu) {
      return problem({ status: HttpStatusCode.NotFound, detail: 'No HETU on file for this claim' })
    }

    // Fail closed: if the audit write throws, the request throws too and no HETU is sent.
    await recordMileageHetuAccess(claim.id, req.user!.memberId)

    res.status(HttpStatusCode.Ok).json({ hetu })
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

    const claim = await updateExpenseClaim(req.params.id, patch, req.user!)
    await syncMemberIbanFromClaim(req.user!, claim?.iban, claim?.ibanAccountName)

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
