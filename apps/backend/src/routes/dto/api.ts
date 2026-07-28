import { Router, type Request, type Response } from 'express'
import { HttpStatusCode } from 'axios'
import multer from 'multer'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import {
  TrainingProgramUpsertSchema,
  SyllabusImportSchema,
  VerifyAttemptSchema,
  PublishSyllabusSchema,
  SyllabusTextPatchSchema,
  SyllabusUpsertBodySchema,
  FlightTypeEnum,
} from './models.ts'
import {
  getTrainingPrograms,
  getTrainingProgramById,
  insertTrainingProgram,
  updateTrainingProgram,
  getSyllabiByProgram,
  getSyllabusById,
  getSyllabusWithFlights,
  getLatestPublishedSyllabus,
  insertSyllabus,
  updateSyllabus,
  submitSyllabusForApproval,
  withdrawSyllabusFromApproval,
  publishSyllabus,
  patchSyllabusText,
  upsertSyllabusFlights,
  importSyllabusFromJson,
  getActiveSyllabusForMember,
  assignSyllabusToMember,
  getMemberSyllabusByIdWithFlights,
  getMemberSyllabusOwnerId,
  getAttemptByFlightLogId,
  getAttemptByIdWithFlightData,
  getAttemptsByMemberSyllabus,
  getAttemptsByMemberSyllabusWithFlightLog,
  getPendingVerifications,
  getPendingVerificationsCount,
  insertAttempt,
  updateAttemptSyllabusFlight,
  verifyAttempt,
  getItemOutcomesByAttempt,
  getItemOutcomesByAttempts,
  getOpenHilForMember,
  getStudentProgress,
  getFlightsBySyllabus,
  getSyllabusFlightWithItems,
  copySyllabusAsDraft,
} from '../../db/dto-queries.ts'
import { z } from 'zod'

export const router = Router()

// Multer for JSON file uploads (in-memory, max 1 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true)
    } else {
      cb(new Error('Only JSON files are allowed'))
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Training Programs
// ─────────────────────────────────────────────────────────────────────────────

/** GET /dto/programs — list all training programs */
router.get(
  '/programs',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (_req: Request<Record<string, string>>, res: Response) => {
    const programs = await getTrainingPrograms()
    res.json(programs)
  },
)

/** GET /dto/programs/:programId */
router.get(
  '/programs/:programId',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const program = await getTrainingProgramById(req.params.programId)
    if (!program) return problem({ status: 404, detail: 'Training program not found' })
    res.json(program)
  },
)

/** POST /dto/programs — create training program (admin) */
router.post(
  '/programs',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = TrainingProgramUpsertSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid program data',
        extensions: { errors: parsed.error.issues },
      })
    }
    const program = await insertTrainingProgram(parsed.data, req.user!.memberId)
    res.status(HttpStatusCode.Created).json(program)
  },
)

/** PUT /dto/programs/:programId — update training program (admin) */
router.put(
  '/programs/:programId',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = TrainingProgramUpsertSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid program data',
        extensions: { errors: parsed.error.issues },
      })
    }
    const program = await updateTrainingProgram(
      req.params.programId,
      parsed.data,
      req.user!.memberId,
    )
    if (!program) return problem({ status: 404, detail: 'Training program not found' })
    res.json(program)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Syllabi
// ─────────────────────────────────────────────────────────────────────────────

/** GET /dto/programs/:programId/syllabi — list syllabi for a program */
router.get(
  '/programs/:programId/syllabi',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const syllabi = await getSyllabiByProgram(req.params.programId)
    res.json(syllabi)
  },
)

/** GET /dto/programs/:programId/syllabi/latest-published */
router.get(
  '/programs/:programId/syllabi/latest-published',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const syllabus = await getLatestPublishedSyllabus(req.params.programId)
    if (!syllabus) return problem({ status: 404, detail: 'No published syllabus found' })
    res.json(syllabus)
  },
)

/** GET /dto/syllabi/:syllabusId */
router.get(
  '/syllabi/:syllabusId',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const syllabus = await getSyllabusWithFlights(req.params.syllabusId)
    if (!syllabus) return problem({ status: 404, detail: 'Syllabus not found' })
    res.json(syllabus)
  },
)

/** POST /dto/programs/:programId/syllabi — create new draft syllabus (admin) */
router.post(
  '/programs/:programId/syllabi',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = SyllabusUpsertBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid syllabus data' })
    }
    const syllabus = await insertSyllabus(req.params.programId, parsed.data, req.user!.memberId)
    res.status(HttpStatusCode.Created).json(syllabus)
  },
)

/** PUT /dto/syllabi/:syllabusId — update syllabus description and settings (admin, draft only) */
router.put(
  '/syllabi/:syllabusId',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = SyllabusUpsertBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid syllabus data' })
    }
    const syllabus = await updateSyllabus(req.params.syllabusId, parsed.data, req.user!.memberId)
    if (!syllabus) {
      return problem({ status: 404, detail: 'Syllabus not found or not editable' })
    }
    res.json(syllabus)
  },
)

/** POST /dto/syllabi/:syllabusId/submit-for-approval — submit a draft for authority approval (admin) */
router.post(
  '/syllabi/:syllabusId/submit-for-approval',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const syllabus = await submitSyllabusForApproval(req.params.syllabusId, req.user!.memberId)
    if (!syllabus) {
      return problem({ status: 404, detail: 'Syllabus not found or not a draft' })
    }
    res.json(syllabus)
  },
)

/** POST /dto/syllabi/:syllabusId/withdraw — withdraw a syllabus back to draft (admin) */
router.post(
  '/syllabi/:syllabusId/withdraw',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const syllabus = await withdrawSyllabusFromApproval(req.params.syllabusId, req.user!.memberId)
    if (!syllabus) {
      return problem({ status: 404, detail: 'Syllabus not found or not awaiting approval' })
    }
    res.json(syllabus)
  },
)

/** POST /dto/syllabi/:syllabusId/publish — publish a syllabus awaiting approval (admin) */
router.post(
  '/syllabi/:syllabusId/publish',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = PublishSyllabusSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid publish data' })
    }
    const syllabus = await publishSyllabus(
      req.params.syllabusId,
      req.user!.memberId,
      parsed.data.approvalReference,
    )
    if (!syllabus) {
      return problem({ status: 404, detail: 'Syllabus not found or not awaiting approval' })
    }
    res.json(syllabus)
  },
)

/** PATCH /dto/syllabi/:syllabusId/text — typo-fix text-only edits on a PUBLISHED syllabus (admin) */
router.patch(
  '/syllabi/:syllabusId/text',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = SyllabusTextPatchSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid text patch data',
        extensions: { errors: parsed.error.issues },
      })
    }
    const syllabus = await patchSyllabusText(req.params.syllabusId, parsed.data, req.user!.memberId)
    if (!syllabus) {
      return problem({ status: 404, detail: 'Syllabus not found or not published' })
    }
    res.json(syllabus)
  },
)

/** GET /dto/syllabi/:syllabusId/export — export syllabus as importable JSON (admin) */
router.get(
  '/syllabi/:syllabusId/export',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const syllabus = await getSyllabusWithFlights(req.params.syllabusId)
    if (!syllabus) return problem({ status: 404, detail: 'Syllabus not found' })

    const program = await getTrainingProgramById(syllabus.programId)
    const exportData = {
      title: program?.name ?? 'Untitled',
      version: syllabus.version,
      description: syllabus.description ?? undefined,
      requirementsExperienceCredit: syllabus.requirementsExperienceCredit ?? undefined,
      generalInformation: syllabus.generalInformation ?? undefined,
      minBlockTimeMins: syllabus.minBlockTimeMins ?? undefined,
      flights: (syllabus.flights ?? []).map((f) => ({
        code: f.code,
        name: f.name,
        description: f.description ?? undefined,
        tags: f.tags,
        isInterimCheckpoint: f.isInterimCheckpoint,
        recommendedBlockTimeMins: f.recommendedBlockTimeMins ?? undefined,
        flightType: f.flightType ?? undefined,
        easaFclReference: f.easaFclReference ?? undefined,
        items: (f.items ?? []).map((i) => ({
          name: i.name,
          description: i.description ?? undefined,
          mandatory: i.mandatory,
        })),
      })),
    }

    const filename = `syllabus-${syllabus.version}.json`
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/json')
    res.json(exportData)
  },
)

/** POST /dto/syllabi/:syllabusId/copy — copy syllabus as new draft (admin) */
router.post(
  '/syllabi/:syllabusId/copy',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const copy = await copySyllabusAsDraft(req.params.syllabusId, req.user!.memberId)
    if (!copy) return problem({ status: 404, detail: 'Syllabus not found' })
    res.status(HttpStatusCode.Created).json(copy)
  },
)

/** PUT /dto/syllabi/:syllabusId/flights — replace all flights in a draft syllabus (admin) */
router.put(
  '/syllabi/:syllabusId/flights',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const syllabus = await getSyllabusById(req.params.syllabusId)
    if (!syllabus) return problem({ status: 404, detail: 'Syllabus not found' })
    if (syllabus.status !== 'DRAFT') {
      return problem({ status: HttpStatusCode.Conflict, detail: 'Syllabus is not editable' })
    }

    const schema = z.object({
      flights: z.array(
        z.object({
          code: z.string().min(1),
          name: z.string().min(1),
          description: z.string().nullable().optional(),
          tags: z.array(z.string()).default([]),
          isInterimCheckpoint: z.boolean().default(false),
          recommendedBlockTimeMins: z.number().int().positive().nullable().optional(),
          flightType: FlightTypeEnum.nullable().optional(),
          easaFclReference: z.string().nullable().optional(),
          items: z
            .array(
              z.object({
                name: z.string().min(1),
                description: z.string().nullable().optional(),
                mandatory: z.boolean(),
              }),
            )
            .optional(),
        }),
      ),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid flights data',
        extensions: { errors: parsed.error.issues },
      })
    }

    // Validate: at most one interim checkpoint
    const interimCheckpointCount = parsed.data.flights.filter((f) => f.isInterimCheckpoint).length
    if (interimCheckpointCount > 1) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'At most one flight can be marked as interim checkpoint',
      })
    }

    // Validate: unique codes
    const codes = parsed.data.flights.map((f) => f.code)
    if (new Set(codes).size !== codes.length) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Flight codes must be unique within a syllabus',
      })
    }

    await upsertSyllabusFlights(req.params.syllabusId, parsed.data.flights)
    const updated = await getSyllabusWithFlights(req.params.syllabusId)
    res.json(updated)
  },
)

/** GET /dto/syllabi/:syllabusId/flights — list flights for a syllabus */
router.get(
  '/syllabi/:syllabusId/flights',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const flights = await getFlightsBySyllabus(req.params.syllabusId)
    res.json(flights)
  },
)

/** GET /dto/flights/:flightId — get a specific syllabus flight with its items */
router.get(
  '/flights/:flightId',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const flight = await getSyllabusFlightWithItems(req.params.flightId)
    if (!flight) return problem({ status: 404, detail: 'Syllabus flight not found' })
    res.json(flight)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// JSON Import
// ─────────────────────────────────────────────────────────────────────────────

/** POST /dto/programs/:programId/syllabi/import — import syllabus from JSON (admin) */
router.post(
  '/programs/:programId/syllabi/import',
  validateUser(MIKPermissions.DTO_ADMIN),
  upload.single('file'),
  async (req: Request<Record<string, string>>, res: Response) => {
    if (!req.file) {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'No JSON file uploaded' })
    }

    let json: unknown
    try {
      json = JSON.parse(req.file.buffer.toString('utf-8'))
    } catch {
      return problem({ status: HttpStatusCode.BadRequest, detail: 'Invalid JSON file' })
    }

    const parsed = SyllabusImportSchema.safeParse(json)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Syllabus JSON validation failed',
        extensions: { errors: parsed.error.issues },
      })
    }

    const data = parsed.data

    // Validate: at most one interim checkpoint
    const interimCheckpointCount = data.flights.filter((f) => f.isInterimCheckpoint).length
    if (interimCheckpointCount > 1) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'At most one flight can be marked as interim checkpoint',
      })
    }

    // Validate unique flight codes
    const codes = data.flights.map((f) => f.code)
    if (new Set(codes).size !== codes.length) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Flight codes must be unique within the syllabus',
      })
    }

    const syllabus = await importSyllabusFromJson(req.params.programId, data, req.user!.memberId)
    res.status(HttpStatusCode.Created).json(syllabus)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Member Syllabus Assignment
// ─────────────────────────────────────────────────────────────────────────────

/** GET /dto/me/syllabus — get active syllabus for the currently authenticated member */
router.get(
  '/me/syllabus',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const assignment = await getActiveSyllabusForMember(req.user!.memberId)
    if (!assignment) return res.json(null)
    const syllabus = await getSyllabusWithFlights(assignment.syllabusId)
    res.json({ ...assignment, syllabusDetail: syllabus })
  },
)

/** GET /dto/members/:memberId/syllabus — get active syllabus for member */
router.get(
  '/members/:memberId/syllabus',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const user = req.user!
    // Members can only view their own syllabus unless they are instructor/admin
    if (
      req.params.memberId !== user.memberId &&
      !user.permissions.includes(MIKPermissions.DTO_INSTRUCTOR) &&
      !user.permissions.includes(MIKPermissions.DTO_ADMIN)
    ) {
      return problem({ status: 403, detail: 'Forbidden' })
    }

    const assignment = await getActiveSyllabusForMember(req.params.memberId)
    if (!assignment) return res.json(null)

    const syllabus = await getSyllabusWithFlights(assignment.syllabusId)
    res.json({ ...assignment, syllabusDetail: syllabus })
  },
)

/** POST /dto/members/:memberId/syllabus — assign latest published syllabus (admin) */
router.post(
  '/members/:memberId/syllabus',
  validateUser(MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const schema = z.object({ programId: z.string().guid() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'programId is required',
      })
    }

    // Check no active syllabus
    const existing = await getActiveSyllabusForMember(req.params.memberId)
    if (existing) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'Member already has an active syllabus assignment',
      })
    }

    // Get latest published syllabus
    const latestPublished = await getLatestPublishedSyllabus(parsed.data.programId)
    if (!latestPublished) {
      return problem({
        status: HttpStatusCode.UnprocessableEntity,
        detail: 'No published syllabus found for this program',
      })
    }

    const assignment = await assignSyllabusToMember(
      req.params.memberId,
      latestPublished.syllabusId,
      req.user!.memberId,
    )
    res.status(HttpStatusCode.Created).json(assignment)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Flight Attempts
// ─────────────────────────────────────────────────────────────────────────────

/** GET /dto/flight-logs/:flightLogId/attempt — get DTO attempt for a flight log */
router.get(
  '/flight-logs/:flightLogId/attempt',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const attempt = await getAttemptByFlightLogId(req.params.flightLogId)
    if (!attempt) return res.json(null)
    res.json(attempt)
  },
)

/** POST /dto/flight-logs/:flightLogId/attempt — link a flight log to a syllabus flight */
router.post(
  '/flight-logs/:flightLogId/attempt',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const schema = z.object({
      syllabusFlightId: z.string().guid(),
      memberSyllabusId: z.string().guid(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid attempt data',
        extensions: { errors: parsed.error.issues },
      })
    }

    const user = req.user!
    const isInstructorOrAdmin =
      user.permissions.includes(MIKPermissions.DTO_INSTRUCTOR) ||
      user.permissions.includes(MIKPermissions.DTO_ADMIN)
    if (!isInstructorOrAdmin) {
      const ownerId = await getMemberSyllabusOwnerId(parsed.data.memberSyllabusId)
      if (ownerId !== user.memberId) {
        return problem({ status: 403, detail: 'Forbidden' })
      }
    }

    const existing = await getAttemptByFlightLogId(req.params.flightLogId)
    if (existing) {
      return problem({
        status: HttpStatusCode.Conflict,
        detail: 'A DTO attempt already exists for this flight log',
      })
    }

    const attempt = await insertAttempt(
      req.params.flightLogId,
      parsed.data.syllabusFlightId,
      parsed.data.memberSyllabusId,
      user.memberId,
    )
    res.status(HttpStatusCode.Created).json(attempt)
  },
)

/** PATCH /dto/flight-logs/:flightLogId/attempt — update syllabus flight link (instructor/admin only) */
router.patch(
  '/flight-logs/:flightLogId/attempt',
  validateUser(MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const schema = z.object({ syllabusFlightId: z.string().guid() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'syllabusFlightId is required',
        extensions: { errors: parsed.error.issues },
      })
    }

    const attempt = await updateAttemptSyllabusFlight(
      req.params.flightLogId,
      parsed.data.syllabusFlightId,
    )
    if (!attempt) {
      return problem({ status: 404, detail: 'Attempt not found for this flight log' })
    }
    res.json(attempt)
  },
)

/** GET /dto/attempts/:attemptId — get a specific attempt with flight log data */
router.get(
  '/attempts/:attemptId',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const attempt = await getAttemptByIdWithFlightData(req.params.attemptId)
    if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })

    const user = req.user!
    const isInstructorOrAdmin =
      user.permissions.includes(MIKPermissions.DTO_INSTRUCTOR) ||
      user.permissions.includes(MIKPermissions.DTO_ADMIN)
    if (!isInstructorOrAdmin) {
      const ownerId = await getMemberSyllabusOwnerId(attempt.memberSyllabusId)
      if (ownerId !== user.memberId) {
        return problem({ status: 403, detail: 'Forbidden' })
      }
    }

    const outcomes = await getItemOutcomesByAttempt(req.params.attemptId)
    res.json({ ...attempt, itemOutcomes: outcomes })
  },
)

/** POST /dto/attempts/:attemptId/verify — instructor verifies a flight attempt */
router.post(
  '/attempts/:attemptId/verify',
  validateUser(MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const parsed = VerifyAttemptSchema.safeParse(req.body)
    if (!parsed.success) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: 'Invalid verification data',
        extensions: { errors: parsed.error.issues },
      })
    }

    const attempt = await verifyAttempt(req.params.attemptId, parsed.data, req.user!.memberId)
    if (!attempt) {
      return problem({
        status: 404,
        detail: 'Attempt not found or already verified',
      })
    }
    res.json(attempt)
  },
)

/** GET /dto/instructor/pending — get pending verifications for current instructor */
router.get(
  '/instructor/pending',
  validateUser(MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const attempts = await getPendingVerifications()
    res.json(attempts)
  },
)

/** GET /dto/instructor/pending/count — count pending verifications */
router.get(
  '/instructor/pending/count',
  validateUser(MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const count = await getPendingVerificationsCount()
    res.json({ count })
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// HIL Queue
// ─────────────────────────────────────────────────────────────────────────────

/** GET /dto/members/:memberId/hil — get open HIL entries for a member */
router.get(
  '/members/:memberId/hil',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const user = req.user!
    if (
      req.params.memberId !== user.memberId &&
      !user.permissions.includes(MIKPermissions.DTO_INSTRUCTOR) &&
      !user.permissions.includes(MIKPermissions.DTO_ADMIN)
    ) {
      return problem({ status: 403, detail: 'Forbidden' })
    }
    const hil = await getOpenHilForMember(req.params.memberId)
    res.json(hil)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Progress / Dashboard
// ─────────────────────────────────────────────────────────────────────────────

/** GET /dto/progress — get progress for all DTO students */
router.get(
  '/progress',
  validateUser(MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (_req: Request<Record<string, string>>, res: Response) => {
    const progress = await getStudentProgress()
    res.json(progress)
  },
)

/** GET /dto/member-syllabus/:memberSyllabusId/attempts — get all attempts for a member's syllabus assignment */
router.get(
  '/member-syllabus/:memberSyllabusId/attempts',
  validateUser(MIKPermissions.DTO_USER, MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const user = req.user!
    const isInstructorOrAdmin =
      user.permissions.includes(MIKPermissions.DTO_INSTRUCTOR) ||
      user.permissions.includes(MIKPermissions.DTO_ADMIN)
    if (!isInstructorOrAdmin) {
      const ownerId = await getMemberSyllabusOwnerId(req.params.memberSyllabusId)
      if (ownerId !== user.memberId) {
        return problem({ status: 403, detail: 'Forbidden' })
      }
    }
    const attempts = await getAttemptsByMemberSyllabus(req.params.memberSyllabusId)
    res.json(attempts)
  },
)

/** GET /dto/member-syllabus/:memberSyllabusId/detail — full progress detail for an instructor */
router.get(
  '/member-syllabus/:memberSyllabusId/detail',
  validateUser(MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN),
  async (req: Request<Record<string, string>>, res: Response) => {
    const memberSyllabusId = req.params.memberSyllabusId
    const memberSyllabus = await getMemberSyllabusByIdWithFlights(memberSyllabusId)
    if (!memberSyllabus) {
      return problem({ status: 404, detail: 'Member syllabus not found' })
    }
    const attempts = await getAttemptsByMemberSyllabusWithFlightLog(memberSyllabusId)
    const outcomesMap = await getItemOutcomesByAttempts(attempts.map((a) => a.attemptId))
    const attemptsWithOutcomes = attempts.map((attempt) => ({
      ...attempt,
      itemOutcomes: outcomesMap.get(attempt.attemptId) ?? [],
    }))
    const hilItems = await getOpenHilForMember(memberSyllabus.memberId)
    res.json({ memberSyllabus, attemptsWithOutcomes, hilItems })
  },
)
