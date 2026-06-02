import { z } from 'zod'

// ── Enums ─────────────────────────────────────────────────────────────────────
export const SyllabusStatusEnum = z.enum(['DRAFT', 'WAITING_FOR_APPROVAL', 'PUBLISHED', 'ARCHIVED'])
export type SyllabusStatus = z.infer<typeof SyllabusStatusEnum>

export const ItemOutcomeEnum = z.enum(['COMPLETED', 'FAILED', 'MOVED_TO_HIL'])
export type ItemOutcome = z.infer<typeof ItemOutcomeEnum>

export const VerificationResultEnum = z.enum(['APPROVED', 'FAILED'])
export type VerificationResult = z.infer<typeof VerificationResultEnum>

// ── Training Program ──────────────────────────────────────────────────────────
export const TrainingProgramSchema = z.object({
  programId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
})
export type TrainingProgram = z.infer<typeof TrainingProgramSchema>

export const TrainingProgramUpsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
})
export type TrainingProgramUpsert = z.infer<typeof TrainingProgramUpsertSchema>

// ── Syllabus Flight Item ───────────────────────────────────────────────────────
export const SyllabusFlightItemSchema = z.object({
  itemId: z.string().uuid(),
  syllabusFlightId: z.string().uuid(),
  sortOrder: z.number().int(),
  name: z.string(),
  description: z.string().nullable().optional(),
  mandatory: z.boolean(),
})
export type SyllabusFlightItem = z.infer<typeof SyllabusFlightItemSchema>

export const SyllabusFlightItemUpsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  mandatory: z.boolean(),
})
export type SyllabusFlightItemUpsert = z.infer<typeof SyllabusFlightItemUpsertSchema>

// ── Syllabus Flight ────────────────────────────────────────────────────────────
export const SyllabusFlightSchema = z.object({
  flightId: z.string().uuid(),
  syllabusId: z.string().uuid(),
  sortOrder: z.number().int(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()),
  isInterimCheckpoint: z.boolean(),
  recommendedBlockTimeMins: z.number().int().positive().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(SyllabusFlightItemSchema).optional(),
})
export type SyllabusFlight = z.infer<typeof SyllabusFlightSchema>

export const SyllabusFlightUpsertSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  isInterimCheckpoint: z.boolean().default(false),
  recommendedBlockTimeMins: z.number().int().positive().nullable().optional(),
  items: z.array(SyllabusFlightItemUpsertSchema).optional(),
})
export type SyllabusFlightUpsert = z.infer<typeof SyllabusFlightUpsertSchema>

// ── Syllabus ───────────────────────────────────────────────────────────────────
export const SyllabusSchema = z.object({
  syllabusId: z.string().uuid(),
  programId: z.string().uuid(),
  majorVersion: z.number().int(),
  minorVersion: z.number().int(),
  patchVersion: z.number().int(),
  version: z.string(),
  description: z.string().nullable().optional(),
  minBlockTimeMins: z.number().int().positive().nullable().optional(),
  status: SyllabusStatusEnum,
  publishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  flights: z.array(SyllabusFlightSchema).optional(),
})
export type Syllabus = z.infer<typeof SyllabusSchema>

export const SyllabusWithFlightsSchema = SyllabusSchema.extend({
  flights: z.array(SyllabusFlightSchema),
})
export type SyllabusWithFlights = z.infer<typeof SyllabusWithFlightsSchema>

// ── JSON Import ────────────────────────────────────────────────────────────────
export const ImportFlightItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  mandatory: z.boolean(),
})

export const ImportFlightSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  isInterimCheckpoint: z.boolean().optional(),
  recommendedBlockTimeMins: z.number().int().positive().nullable().optional(),
  items: z.array(ImportFlightItemSchema).optional(),
})

export const SyllabusImportSchema = z.object({
  title: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  minBlockTimeMins: z.number().int().positive().nullable().optional(),
  flights: z.array(ImportFlightSchema).min(1),
})
export type SyllabusImport = z.infer<typeof SyllabusImportSchema>

// ── Member Syllabus Assignment ─────────────────────────────────────────────────
export const MemberSyllabusSchema = z.object({
  memberSyllabusId: z.string().uuid(),
  memberId: z.string(),
  syllabusId: z.string().uuid(),
  isActive: z.boolean(),
  assignedAt: z.string(),
  assignedBy: z.string(),
  deactivatedAt: z.string().nullable().optional(),
})
export type MemberSyllabus = z.infer<typeof MemberSyllabusSchema>

// ── Syllabus Flight Attempt ────────────────────────────────────────────────────
export const SyllabusFlightAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  flightLogId: z.string(),
  syllabusFlightId: z.string().uuid(),
  memberSyllabusId: z.string().uuid(),
  instructorMemberId: z.string(),
  instructorComments: z.string().nullable().optional(),
  verificationResult: VerificationResultEnum.nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  verifiedBy: z.string().nullable().optional(),
  verifierName: z.string().nullable().optional(),
  requiresReverification: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SyllabusFlightAttempt = z.infer<typeof SyllabusFlightAttemptSchema>

export const AttemptUpsertSchema = z.object({
  syllabusFlightId: z.string().uuid(),
})
export type AttemptUpsert = z.infer<typeof AttemptUpsertSchema>

// ── Item Outcomes ──────────────────────────────────────────────────────────────
export const FlightItemOutcomeSchema = z.object({
  attemptId: z.string().uuid(),
  itemId: z.string().uuid(),
  outcome: ItemOutcomeEnum,
  remarks: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type FlightItemOutcome = z.infer<typeof FlightItemOutcomeSchema>

export const ItemOutcomeUpsertSchema = z.object({
  itemId: z.string().uuid(),
  outcome: ItemOutcomeEnum,
  remarks: z.string().nullable().optional(),
})
export type ItemOutcomeUpsert = z.infer<typeof ItemOutcomeUpsertSchema>

// ── Verification ───────────────────────────────────────────────────────────────
export const VerifyAttemptSchema = z.object({
  result: VerificationResultEnum,
  instructorComments: z.string().nullable().optional(),
  itemOutcomes: z.array(ItemOutcomeUpsertSchema).optional(),
})
export type VerifyAttempt = z.infer<typeof VerifyAttemptSchema>

// ── HIL Queue ─────────────────────────────────────────────────────────────────
export const HilEntrySchema = z.object({
  hilId: z.string().uuid(),
  memberId: z.string(),
  syllabusId: z.string().uuid(),
  itemId: z.string().uuid(),
  openedOnAttemptId: z.string().uuid(),
  openedAt: z.string(),
  resolvedOnAttemptId: z.string().uuid().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  resolutionOutcome: ItemOutcomeEnum.nullable().optional(),
  notes: z.string().nullable().optional(),
})
export type HilEntry = z.infer<typeof HilEntrySchema>

// ── Progress ───────────────────────────────────────────────────────────────────
export const StudentProgressSchema = z.object({
  memberId: z.string(),
  memberName: z.string(),
  memberSyllabusId: z.string().uuid().nullable().optional(),
  syllabusId: z.string().uuid().nullable().optional(),
  syllabusTitle: z.string().nullable().optional(),
  syllabusVersion: z.string().nullable().optional(),
  totalFlights: z.number().int(),
  completedFlights: z.number().int(),
  lastDtoFlightDate: z.string().nullable().optional(),
  interimCheckpointCompleted: z.boolean(),
  totalBlockTimeMins: z.number().int(),
  minBlockTimeMins: z.number().int().positive().nullable().optional(),
  meetsTimeRequirement: z.boolean(),
})
export type StudentProgress = z.infer<typeof StudentProgressSchema>

// ── Pending Verifications Count ────────────────────────────────────────────────
export const PendingVerificationCountSchema = z.object({
  count: z.number().int(),
})
export type PendingVerificationCount = z.infer<typeof PendingVerificationCountSchema>
