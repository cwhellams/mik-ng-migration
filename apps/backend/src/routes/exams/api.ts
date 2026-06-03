import { Router, type Request, type Response } from 'express'
import { HttpStatusCode } from 'axios'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import {
  ExamUpsertSchema,
  ExamVersionCreateSchema,
  ExamVersionUpsertSchema,
  ExamVersionTranslationSchema,
  QuestionUpsertSchema,
  ChoiceUpsertSchema,
  AttemptAnswerUpsertSchema,
  AttemptFiltersSchema,
  StartAttemptSchema,
} from './models.ts'
import {
  getExams,
  getExamById,
  getExamWithPublishedVersion,
  getExamsWithPublishedVersions,
  insertExam,
  updateExam,
  deleteExam,
  getVersionsByExamId,
  getVersionById,
  getVersionByQuestionId,
  getVersionByChoiceId,
  getVersionDetail,
  createVersion,
  updateVersion,
  publishVersion,
  deleteVersion,
  upsertVersionTranslation,
  upsertQuestion,
  deleteQuestion,
  upsertChoice,
  deleteChoice,
  createAttempt,
  getAttemptById,
  getAttempts,
  validateAnswerInputs,
  upsertAttemptAnswer,
  getAttemptAnswers,
  submitAttempt,
  abandonAttempt,
  getAttemptVersionDetail,
} from '../../db/exam-queries.ts'

export const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// User-facing exam listing & attempt endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Any exam user can list published exams
router.get(
  '/',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (_req: Request, res: Response) => {
    const exams = await getExamsWithPublishedVersions()
    res.json(exams)
  },
)

// Get a single exam with its published version (user-facing)
router.get(
  '/:examId',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const exam = await getExamWithPublishedVersion(req.params.examId)
    if (!exam) return problem({ status: 404, detail: 'Exam not found' })
    res.json(exam)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Attempts (member-facing)
// ─────────────────────────────────────────────────────────────────────────────

// Start a new attempt for the published version of an exam
router.post(
  '/:examId/attempts',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const exam = await getExamWithPublishedVersion(req.params.examId)
    if (!exam || !exam.currentVersion) {
      return problem({ status: 404, detail: 'No published version for this exam' })
    }
    const { language } = StartAttemptSchema.parse(req.body)
    const attempt = await createAttempt(exam.currentVersion.versionId, req.user!.memberId, language)
    res.status(HttpStatusCode.Created).json(attempt)
  },
)

// Get member's own attempts
router.get(
  '/my/attempts',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const filters = AttemptFiltersSchema.parse({
      ...req.query,
      memberId: req.user!.memberId,
    })
    const result = await getAttempts(filters)
    res.json(result)
  },
)

// Get a specific attempt (must be own attempt, or admin)
router.get(
  '/attempts/:attemptId',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const attempt = await getAttemptById(req.params.attemptId)
    if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })

    const isAdmin = req.user?.permissions?.includes(MIKPermissions.EXAM_ADMIN) ?? false
    if (!isAdmin && attempt.memberId !== req.user!.memberId) {
      return problem({ status: 403, detail: 'Forbidden' })
    }
    res.json(attempt)
  },
)

// Get the version detail for an attempt (works even if version is no longer published)
router.get(
  '/attempts/:attemptId/version',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const attempt = await getAttemptById(req.params.attemptId)
    if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })

    const isAdmin = req.user?.permissions?.includes(MIKPermissions.EXAM_ADMIN) ?? false
    if (!isAdmin && attempt.memberId !== req.user!.memberId) {
      return problem({ status: 403, detail: 'Forbidden' })
    }
    const detail = await getAttemptVersionDetail(req.params.attemptId)
    if (!detail) return problem({ status: 404, detail: 'Version not found' })
    res.json(detail)
  },
)

// Get answers for an attempt
router.get(
  '/attempts/:attemptId/answers',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const attempt = await getAttemptById(req.params.attemptId)
    if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })

    const isAdmin = req.user?.permissions?.includes(MIKPermissions.EXAM_ADMIN) ?? false
    if (!isAdmin && attempt.memberId !== req.user!.memberId) {
      return problem({ status: 403, detail: 'Forbidden' })
    }
    const answers = await getAttemptAnswers(req.params.attemptId)
    res.json(answers)
  },
)

// Save/update an answer
router.put(
  '/attempts/:attemptId/answers',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const attempt = await getAttemptById(req.params.attemptId)
    if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })
    if (attempt.memberId !== req.user!.memberId)
      return problem({ status: 403, detail: 'Forbidden' })
    if (attempt.status !== 'IN_PROGRESS')
      return problem({ status: 409, detail: 'Attempt is not in progress' })

    const data = AttemptAnswerUpsertSchema.parse(req.body)

    const validation = await validateAnswerInputs(
      req.params.attemptId,
      data.questionId,
      data.choiceId,
    )
    if (!validation.valid)
      return problem({ status: 400, detail: validation.detail ?? 'Invalid answer input' })

    const answer = await upsertAttemptAnswer(req.params.attemptId, data)
    res.json(answer)
  },
)

// Submit attempt for grading
router.post(
  '/attempts/:attemptId/submit',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const attempt = await getAttemptById(req.params.attemptId)
    if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })
    if (attempt.memberId !== req.user!.memberId)
      return problem({ status: 403, detail: 'Forbidden' })

    const graded = await submitAttempt(req.params.attemptId)
    res.json(graded)
  },
)

// Abandon an attempt
router.post(
  '/attempts/:attemptId/abandon',
  validateUser(MIKPermissions.EXAM_USER, MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const attempt = await getAttemptById(req.params.attemptId)
    if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })
    if (attempt.memberId !== req.user!.memberId)
      return problem({ status: 403, detail: 'Forbidden' })

    const abandoned = await abandonAttempt(req.params.attemptId, req.body.reason)
    res.json(abandoned)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Exam CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/admin/exams',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (_req: Request, res: Response) => {
    const exams = await getExams()
    res.json(exams)
  },
)

router.post(
  '/admin/exams',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const data = ExamUpsertSchema.parse(req.body)
    const exam = await insertExam(data, req.user!)
    res.status(HttpStatusCode.Created).json(exam)
  },
)

router.put(
  '/admin/exams/:examId',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const exam = await getExamById(req.params.examId)
    if (!exam) return problem({ status: 404, detail: 'Exam not found' })
    const data = ExamUpsertSchema.partial().parse(req.body)
    const updated = await updateExam(req.params.examId, data, req.user!)
    res.json(updated)
  },
)

router.delete(
  '/admin/exams/:examId',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const exam = await getExamById(req.params.examId)
    if (!exam) return problem({ status: 404, detail: 'Exam not found' })
    await deleteExam(req.params.examId)
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Versions
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/admin/exams/:examId/versions',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const versions = await getVersionsByExamId(req.params.examId)
    res.json(versions)
  },
)

router.post(
  '/admin/exams/:examId/versions',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const data = ExamVersionCreateSchema.parse(req.body)
    const version = await createVersion(
      req.params.examId,
      {
        defaultLanguage: data.defaultLanguage,
        supportedLanguages: data.supportedLanguages,
        passPercent: data.passPercent,
      },
      req.user!,
      data.cloneFromPublished,
    )
    res.status(HttpStatusCode.Created).json(version)
  },
)

router.get(
  '/admin/versions/:versionId',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const detail = await getVersionDetail(req.params.versionId)
    if (!detail) return problem({ status: 404, detail: 'Version not found' })
    res.json(detail)
  },
)

router.put(
  '/admin/versions/:versionId',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const version = await getVersionById(req.params.versionId)
    if (!version) return problem({ status: 404, detail: 'Version not found' })
    if (version.status !== 'DRAFT')
      return problem({ status: 409, detail: 'Only DRAFT versions can be edited' })
    const data = ExamVersionUpsertSchema.partial().parse(req.body)
    const updated = await updateVersion(req.params.versionId, data, req.user!)
    res.json(updated)
  },
)

router.post(
  '/admin/versions/:versionId/publish',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const published = await publishVersion(req.params.versionId, req.user!)
    res.json(published)
  },
)

router.delete(
  '/admin/versions/:versionId',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const version = await getVersionById(req.params.versionId)
    if (!version) return problem({ status: 404, detail: 'Version not found' })
    if (version.status !== 'DRAFT')
      return problem({ status: 409, detail: 'Cannot delete a non-DRAFT version' })
    await deleteVersion(req.params.versionId)
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Translations
// ─────────────────────────────────────────────────────────────────────────────

router.put(
  '/admin/versions/:versionId/translations/:language',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const version = await getVersionById(req.params.versionId)
    if (!version) return problem({ status: 404, detail: 'Version not found' })
    if (version.status !== 'DRAFT')
      return problem({ status: 409, detail: 'Only DRAFT versions can be edited' })
    const { title, description } = ExamVersionTranslationSchema.pick({
      title: true,
      description: true,
    }).parse(req.body)
    await upsertVersionTranslation(
      req.params.versionId,
      req.params.language,
      title,
      description ?? null,
    )
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Questions
// ─────────────────────────────────────────────────────────────────────────────

router.put(
  '/admin/versions/:versionId/questions',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const version = await getVersionById(req.params.versionId)
    if (!version) return problem({ status: 404, detail: 'Version not found' })
    if (version.status !== 'DRAFT')
      return problem({ status: 409, detail: 'Only DRAFT versions can be edited' })
    const data = QuestionUpsertSchema.parse(req.body)
    const question = await upsertQuestion(req.params.versionId, data)
    res.json(question)
  },
)

router.delete(
  '/admin/questions/:questionId',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const version = await getVersionByQuestionId(req.params.questionId)
    if (!version) return problem({ status: 404, detail: 'Question not found' })
    if (version.status !== 'DRAFT')
      return problem({ status: 409, detail: 'Only DRAFT versions can be edited' })
    await deleteQuestion(req.params.questionId)
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Choices
// ─────────────────────────────────────────────────────────────────────────────

router.put(
  '/admin/questions/:questionId/choices',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const version = await getVersionByQuestionId(req.params.questionId)
    if (!version) return problem({ status: 404, detail: 'Question not found' })
    if (version.status !== 'DRAFT')
      return problem({ status: 409, detail: 'Only DRAFT versions can be edited' })
    const data = ChoiceUpsertSchema.parse(req.body)
    const choice = await upsertChoice(req.params.questionId, data)
    res.json(choice)
  },
)

router.delete(
  '/admin/choices/:choiceId',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const version = await getVersionByChoiceId(req.params.choiceId)
    if (!version) return problem({ status: 404, detail: 'Choice not found' })
    if (version.status !== 'DRAFT')
      return problem({ status: 409, detail: 'Only DRAFT versions can be edited' })
    await deleteChoice(req.params.choiceId)
    res.status(HttpStatusCode.NoContent).send()
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Admin — All attempts
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/admin/attempts',
  validateUser(MIKPermissions.EXAM_ADMIN),
  async (req: Request, res: Response) => {
    const filters = AttemptFiltersSchema.parse(req.query)
    const result = await getAttempts(filters)
    res.json(result)
  },
)
