import { z } from 'zod'
import { AuditableSchema } from '../../types/schema.ts'

// ── Enums ─────────────────────────────────────────────────────────────────────
export const ExamTypeEnum = z.enum(['AFM', 'SELF_STUDY', 'DTO', 'OTHER'])
export type ExamType = z.infer<typeof ExamTypeEnum>

export const ExamVersionStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'RETIRED'])
export type ExamVersionStatus = z.infer<typeof ExamVersionStatusEnum>

export const AttemptStatusEnum = z.enum(['IN_PROGRESS', 'SUBMITTED', 'GRADED', 'ABANDONED'])
export type AttemptStatus = z.infer<typeof AttemptStatusEnum>

// ── Exam family ───────────────────────────────────────────────────────────────
export const ExamSchema = AuditableSchema.extend({
  examId: z.string().max(9),
  examType: ExamTypeEnum.default('OTHER'),
  name: z.string(),
})
export type Exam = z.infer<typeof ExamSchema>

export const ExamUpsertSchema = ExamSchema.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
}).extend({
  examId: z.string().max(9).optional(),
})
export type ExamUpsert = z.infer<typeof ExamUpsertSchema>

// ── Exam version ──────────────────────────────────────────────────────────────
export const ExamVersionSchema = AuditableSchema.extend({
  versionId: z.string().max(9),
  examId: z.string().max(9),
  versionNumber: z.number().int().default(1),
  status: ExamVersionStatusEnum.default('DRAFT'),
  defaultLanguage: z.string().max(5).default('en'),
  supportedLanguages: z.array(z.string()).default([]),
  passPercent: z.number().nonnegative().default(75),
  questionCount: z.number().int().positive().nullable().optional(),
})
export type ExamVersion = z.infer<typeof ExamVersionSchema>

export const ExamVersionUpsertSchema = ExamVersionSchema.omit({
  versionId: true,
  examId: true,
  versionNumber: true,
  status: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
})
export type ExamVersionUpsert = z.infer<typeof ExamVersionUpsertSchema>

export const ExamVersionCreateSchema = ExamVersionUpsertSchema.extend({
  cloneFromPublished: z.boolean().optional(),
})
export type ExamVersionCreate = z.infer<typeof ExamVersionCreateSchema>

// ── Translations ──────────────────────────────────────────────────────────────
export const ExamVersionTranslationSchema = z.object({
  versionId: z.string().max(9),
  language: z.string().max(5),
  title: z.string(),
  description: z.string().optional().nullable(),
})
export type ExamVersionTranslation = z.infer<typeof ExamVersionTranslationSchema>

// ── Questions ─────────────────────────────────────────────────────────────────
export const QuestionTranslationSchema = z.object({
  prompt: z.string(),
  reasoning: z.string().optional().nullable(),
})
export type QuestionTranslation = z.infer<typeof QuestionTranslationSchema>

export const QuestionSchema = z.object({
  questionId: z.string().max(9),
  versionId: z.string().max(9),
  sortOrder: z.number().int().default(0),
  translations: z.record(z.string(), QuestionTranslationSchema).default({}),
})
export type Question = z.infer<typeof QuestionSchema>

export const QuestionUpsertSchema = z.object({
  questionId: z.string().max(9).optional(),
  sortOrder: z.number().int().default(0),
  translations: z.record(z.string(), QuestionTranslationSchema).default({}),
})
export type QuestionUpsert = z.infer<typeof QuestionUpsertSchema>

// ── Choices ───────────────────────────────────────────────────────────────────
export const ChoiceTranslationSchema = z.object({
  text: z.string(),
})
export type ChoiceTranslation = z.infer<typeof ChoiceTranslationSchema>

export const ChoiceSchema = z.object({
  choiceId: z.string().max(9),
  questionId: z.string().max(9),
  isCorrect: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  translations: z.record(z.string(), ChoiceTranslationSchema).default({}),
})
export type Choice = z.infer<typeof ChoiceSchema>

export const ChoiceUpsertSchema = z.object({
  choiceId: z.string().max(9).optional(),
  isCorrect: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  translations: z.record(z.string(), ChoiceTranslationSchema).default({}),
})
export type ChoiceUpsert = z.infer<typeof ChoiceUpsertSchema>

// ── Exam version detail (full tree) ──────────────────────────────────────────
export const ExamVersionDetailSchema = ExamVersionSchema.extend({
  translations: z
    .record(
      z.string(),
      z.object({ title: z.string(), description: z.string().nullable().optional() }),
    )
    .default({}),
  questions: z
    .array(QuestionSchema.extend({ choices: z.array(ChoiceSchema).default([]) }))
    .default([]),
})
export type ExamVersionDetail = z.infer<typeof ExamVersionDetailSchema>

// ── Exam with current published version (user-facing) ─────────────────────────
export const ExamWithVersionSchema = ExamSchema.extend({
  currentVersion: ExamVersionDetailSchema.optional().nullable(),
})
export type ExamWithVersion = z.infer<typeof ExamWithVersionSchema>

// ── Attempts ──────────────────────────────────────────────────────────────────
export const AttemptSchema = z.object({
  attemptId: z.string().max(9),
  versionId: z.string().max(9),
  examId: z.string().max(9).optional().nullable(),
  examName: z.string().optional().nullable(),
  examType: ExamTypeEnum.optional().nullable(),
  versionNumber: z.number().int().optional().nullable(),
  latestPublishedVersionNumber: z.number().int().optional().nullable(),
  memberId: z.string().max(9),
  language: z.string().max(5),
  status: AttemptStatusEnum,
  scorePercent: z.number().nullable().optional(),
  correctCount: z.number().int().nullable().optional(),
  totalCount: z.number().int().nullable().optional(),
  passed: z.boolean().nullable().optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  gradedAt: z.string().datetime().nullable().optional(),
  abandonedAt: z.string().datetime().nullable().optional(),
  abandonReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Attempt = z.infer<typeof AttemptSchema>

export const AttemptAnswerSchema = z.object({
  attemptId: z.string().max(9),
  questionId: z.string().max(9),
  choiceId: z.string().max(9).nullable().optional(),
  updatedAt: z.string().datetime(),
})
export type AttemptAnswer = z.infer<typeof AttemptAnswerSchema>

export const AttemptAnswerUpsertSchema = z.object({
  questionId: z.string().max(9),
  choiceId: z.string().max(9).nullable().optional(),
})
export type AttemptAnswerUpsert = z.infer<typeof AttemptAnswerUpsertSchema>

export const StartAttemptSchema = z.object({
  language: z.string().max(5).default('en'),
})
export type StartAttempt = z.infer<typeof StartAttemptSchema>

// ── Bulk import ───────────────────────────────────────────────────────────────

export const ExamImportChoiceSchema = z.object({
  sortOrder: z.number().int(),
  isCorrect: z.boolean(),
  translations: z.record(z.string().max(5), ChoiceTranslationSchema),
})

export const ExamImportQuestionSchema = z.object({
  sortOrder: z.number().int(),
  translations: z.record(z.string().max(5), QuestionTranslationSchema),
  choices: z.array(ExamImportChoiceSchema),
})

export const ExamImportVersionSchema = z.object({
  defaultLanguage: z.string().max(5).default('fi'),
  supportedLanguages: z.array(z.string().max(5)).default([]),
  passPercent: z.number().nonnegative().default(75),
  translations: z.record(
    z.string().max(5),
    z.object({ title: z.string(), description: z.string().nullable().optional() }),
  ),
  questions: z.array(ExamImportQuestionSchema),
})

export const ExamImportSchema = z
  .object({
    name: z.string(),
    examType: ExamTypeEnum.default('OTHER'),
    version: ExamImportVersionSchema,
  })
  .superRefine((data, ctx) => {
    for (const [qi, q] of data.version.questions.entries()) {
      const correctCount = q.choices.filter((c) => c.isCorrect).length
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Question at index ${qi} must have exactly one correct choice, found ${correctCount}`,
          path: ['version', 'questions', qi, 'choices'],
        })
      }
    }
  })

export type ExamImport = z.infer<typeof ExamImportSchema>

// ── Bulk import result ────────────────────────────────────────────────────────

export const ExamImportResultSchema = z.object({
  examId: z.string().max(9),
  versionId: z.string().max(9),
})
export type ExamImportResult = z.infer<typeof ExamImportResultSchema>

// ── Filter schemas ────────────────────────────────────────────────────────────
export const AttemptFiltersSchema = z.object({
  examId: z.string().max(9).optional(),
  memberId: z.string().max(9).optional(),
  status: AttemptStatusEnum.optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})
export type AttemptFilters = z.infer<typeof AttemptFiltersSchema>

export const AttemptListResponseSchema = z.object({
  items: z.array(AttemptSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  hasMore: z.boolean(),
})
export type AttemptListResponse = z.infer<typeof AttemptListResponseSchema>
