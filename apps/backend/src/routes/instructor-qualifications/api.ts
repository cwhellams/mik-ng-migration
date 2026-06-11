import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import {
  getInstructorQualification,
  upsertInstructorQualification,
  getInstructorQualificationHistory,
  getAllInstructorStatuses,
  getAllInstructorStatusesAtDate,
  getQualificationSnapshotAtDate,
  appendProofUploadedEvent,
} from '../../db/instructor-qualification-queries.ts'
import {
  addQualificationProof,
  getQualificationProofs,
} from '../../db/qualification-proof-queries.ts'
import {
  InstructorQualificationUpsertSchema,
  type InstructorQualification,
  type InstructorQualificationHistory,
  type InstructorStatusListResponse,
  type ProofFile,
  type ProofDocumentCategory,
  type QualificationSnapshot,
} from './models.ts'
import { getMemberById } from '../../db/member-queries.ts'
import { storageService } from '../../services/storage.ts'
import logger from '../../lib/logger.ts'

const ProofDocumentCategorySchema = z.enum(['LICENSE', 'MEDICAL'])

export const router = Router()

// All routes require at least MEMBER or MEMBER_ADMIN permission
router.use(validateUser(MIKPermissions.MEMBER, MIKPermissions.MEMBER_ADMIN))

// Multer for proof file uploads (PDF/JPEG/PNG only, 10MB max)
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF, JPEG, JPG and PNG files are allowed'))
    }
  },
})

// GET /api/v1/instructor-qualifications
// List all instructor statuses (admin only).
// Optional ?date=YYYY-MM-DD returns a historical snapshot at that date.
router.get(
  '/',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request, res: Response<InstructorStatusListResponse>) => {
    const dateStr = req.query.date as string | undefined

    if (dateStr) {
      const parsed = z.string().date().safeParse(dateStr)
      if (!parsed.success) {
        return problem({ status: 400, detail: 'Invalid date format. Use YYYY-MM-DD.' })
      }
      const instructors = await getAllInstructorStatusesAtDate(new Date(parsed.data))
      return res.status(200).json({ instructors })
    }

    const instructors = await getAllInstructorStatuses()
    res.status(200).json({ instructors })
  },
)

// GET /api/v1/instructor-qualifications/me
router.get('/me', async (req: Request, res: Response<InstructorQualification>) => {
  const memberId = req.user!.memberId

  const member = await getMemberById(memberId)
  if (!member) {
    return problem({ status: 404, detail: 'Member not found' })
  }

  const qualification = await getInstructorQualification(memberId)
  if (!qualification) {
    return problem({ status: 404, detail: 'No qualification record found' })
  }

  res.status(200).json(qualification)
})

// PUT /api/v1/instructor-qualifications/me
// Returns { qualification, historyId } so the client can link proof upload to this history entry
router.put(
  '/me',
  async (
    req: Request,
    res: Response<{ qualification: InstructorQualification; historyId: number }>,
  ) => {
    const memberId = req.user!.memberId

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404, detail: 'Member not found' })
    }

    const data = InstructorQualificationUpsertSchema.parse(req.body)
    const result = await upsertInstructorQualification(memberId, data, req.user!)

    res.status(200).json(result)
  },
)

// GET /api/v1/instructor-qualifications/me/proof
router.get('/me/proof', async (req: Request, res: Response<ProofFile[]>) => {
  const memberId = req.user!.memberId
  const proofs = await getQualificationProofs(memberId)
  res.status(200).json(proofs)
})

// POST /api/v1/instructor-qualifications/me/proof
// Accepts optional historyId body field to link the proof to a history entry
// Requires documentCategory: 'LICENSE' | 'MEDICAL'
router.post(
  '/me/proof',
  proofUpload.single('file'),
  async (req: Request, res: Response<ProofFile>) => {
    if (!req.file) {
      return problem({ status: 400, detail: 'No file uploaded' })
    }

    const categoryResult = ProofDocumentCategorySchema.safeParse(req.body.documentCategory)
    const documentCategory: ProofDocumentCategory = categoryResult.success
      ? categoryResult.data
      : 'LICENSE'

    const memberId = req.user!.memberId
    const historyId = req.body.historyId ? Number(req.body.historyId) : null
    const folder = `instructor-qualifications/${memberId}`
    const fileName = `${nanoid()}-${req.file.originalname}`

    try {
      await storageService.uploadFile(req.file.buffer, fileName, req.file.mimetype, folder)
    } catch (err) {
      logger.error('Proof file upload failed:', err)
      return problem({ status: 500, detail: 'Failed to upload file' })
    }

    const storageKey = `${folder}/${fileName}`
    const proof = await addQualificationProof(
      memberId,
      req.file.originalname,
      storageKey,
      req.file.mimetype,
      req.user!.memberId,
      historyId,
      documentCategory,
    )

    await appendProofUploadedEvent(
      memberId,
      proof.id,
      req.file.originalname,
      documentCategory,
      req.user!.memberId,
    )

    res.status(201).json(proof)
  },
)

// GET /api/v1/instructor-qualifications/:memberId
// Get qualification details for a specific member (admin or self only)
router.get(
  '/:memberId',
  async (req: Request<{ memberId: string }>, res: Response<InstructorQualification>) => {
    const { memberId } = req.params
    const isAdmin = req.user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN)
    const isOwnProfile = req.user?.memberId === memberId

    if (!isAdmin && !isOwnProfile) {
      return problem({ status: 403, detail: "Not authorized to view this member's qualifications" })
    }

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404, detail: 'Member not found' })
    }

    const qualification = await getInstructorQualification(memberId)
    if (!qualification) {
      return problem({ status: 404, detail: 'No qualification record found' })
    }

    res.status(200).json(qualification)
  },
)

// PUT /api/v1/instructor-qualifications/:memberId
// Create or update qualification for a member (admin or self only)
// Returns { qualification, historyId } so client can link proof uploads to this history entry
router.put(
  '/:memberId',
  async (
    req: Request<{ memberId: string }>,
    res: Response<{ qualification: InstructorQualification; historyId: number }>,
  ) => {
    const { memberId } = req.params
    const isAdmin = req.user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN)
    const isOwnProfile = req.user?.memberId === memberId

    if (!isAdmin && !isOwnProfile) {
      return problem({
        status: 403,
        detail: "Not authorized to update this member's qualifications",
      })
    }

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404, detail: 'Member not found' })
    }

    const data = InstructorQualificationUpsertSchema.parse(req.body)
    const result = await upsertInstructorQualification(memberId, data, req.user!)

    res.status(200).json(result)
  },
)

// GET /api/v1/instructor-qualifications/:memberId/proof
router.get(
  '/:memberId/proof',
  async (req: Request<{ memberId: string }>, res: Response<ProofFile[]>) => {
    const { memberId } = req.params
    const isAdmin = req.user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN)
    const isOwnProfile = req.user?.memberId === memberId

    if (!isAdmin && !isOwnProfile) {
      return problem({ status: 403, detail: 'Not authorized to view proof files' })
    }

    const proofs = await getQualificationProofs(memberId)
    res.status(200).json(proofs)
  },
)

// GET /api/v1/instructor-qualifications/:memberId/proof/:proofId/download
// Returns a short-lived presigned URL for the given proof file.
// Admin or the member themselves can download their own proof documents.
router.get(
  '/:memberId/proof/:proofId/download',
  async (req: Request<{ memberId: string; proofId: string }>, res: Response<{ url: string }>) => {
    const { memberId, proofId } = req.params
    const isAdmin = req.user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN)
    const isOwnProfile = req.user?.memberId === memberId

    if (!isAdmin && !isOwnProfile) {
      return problem({ status: 403, detail: 'Not authorized to download this proof file' })
    }

    const proofIdNum = Number(proofId)
    if (isNaN(proofIdNum)) {
      return problem({ status: 400, detail: 'Invalid proof file ID' })
    }

    const proofs = await getQualificationProofs(memberId)
    const proof = proofs.find((p) => p.id === proofIdNum)

    if (!proof) {
      return problem({ status: 404, detail: 'Proof file not found' })
    }

    try {
      const url = await storageService.getPresignedUrl(proof.storageKey, 300)
      res.status(200).json({ url })
    } catch (err) {
      logger.error('Failed to generate presigned URL for proof file:', err)
      return problem({ status: 500, detail: 'Failed to generate download link' })
    }
  },
)

// POST /api/v1/instructor-qualifications/:memberId/proof
// Accepts optional historyId body field to link the proof to a specific history entry
// Requires documentCategory: 'LICENSE' | 'MEDICAL'
router.post(
  '/:memberId/proof',
  proofUpload.single('file'),
  async (req: Request<{ memberId: string }>, res: Response<ProofFile>) => {
    const { memberId } = req.params
    const isAdmin = req.user?.permissions?.includes(MIKPermissions.MEMBER_ADMIN)
    const isOwnProfile = req.user?.memberId === memberId

    if (!isAdmin && !isOwnProfile) {
      return problem({ status: 403, detail: 'Not authorized to upload proof files' })
    }

    if (!req.file) {
      return problem({ status: 400, detail: 'No file uploaded' })
    }

    const categoryResult = ProofDocumentCategorySchema.safeParse(req.body.documentCategory)
    const documentCategory: ProofDocumentCategory = categoryResult.success
      ? categoryResult.data
      : 'LICENSE'

    const historyId = req.body.historyId ? Number(req.body.historyId) : null
    const folder = `instructor-qualifications/${memberId}`
    const fileName = `${nanoid()}-${req.file.originalname}`

    try {
      await storageService.uploadFile(req.file.buffer, fileName, req.file.mimetype, folder)
    } catch (err) {
      logger.error('Proof file upload failed:', err)
      return problem({ status: 500, detail: 'Failed to upload file' })
    }

    const storageKey = `${folder}/${fileName}`
    const proof = await addQualificationProof(
      memberId,
      req.file.originalname,
      storageKey,
      req.file.mimetype,
      req.user!.memberId,
      historyId,
      documentCategory,
    )

    await appendProofUploadedEvent(
      memberId,
      proof.id,
      req.file.originalname,
      documentCategory,
      req.user!.memberId,
    )

    res.status(201).json(proof)
  },
)

// GET /api/v1/instructor-qualifications/:memberId/history
// Get qualification change history for a member (admin only)
router.get(
  '/:memberId/history',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<InstructorQualificationHistory[]>) => {
    const { memberId } = req.params

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404, detail: 'Member not found' })
    }

    const history = await getInstructorQualificationHistory(memberId)
    res.status(200).json(history)
  },
)

// GET /api/v1/instructor-qualifications/:memberId/snapshot?date=YYYY-MM-DD
// Returns the qualification state (dates + proof files) as it was at end of the given date.
// Admin only — used for EASA audit reconstruction.
router.get(
  '/:memberId/snapshot',
  validateUser(MIKPermissions.MEMBER_ADMIN),
  async (req: Request<{ memberId: string }>, res: Response<QualificationSnapshot>) => {
    const { memberId } = req.params
    const dateStr = req.query.date as string | undefined

    if (!dateStr) {
      return problem({ status: 400, detail: 'Query parameter ?date=YYYY-MM-DD is required' })
    }

    const parsed = z.string().date().safeParse(dateStr)
    if (!parsed.success) {
      return problem({ status: 400, detail: 'Invalid date format. Use YYYY-MM-DD.' })
    }

    const member = await getMemberById(memberId)
    if (!member) {
      return problem({ status: 404, detail: 'Member not found' })
    }

    const snapshot = await getQualificationSnapshotAtDate(memberId, new Date(parsed.data))
    res.status(200).json(snapshot)
  },
)
