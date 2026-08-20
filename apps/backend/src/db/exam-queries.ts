import { auditCreate, auditUpdate } from './audit.ts'
import { db, type DbRow } from './connection.ts'
import { generateShortId } from '../util/nanoId.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'
import type {
  Exam,
  ExamUpsert,
  ExamVersion,
  ExamVersionUpsert,
  ExamVersionDetail,
  ExamWithVersion,
  Question,
  QuestionUpsert,
  Choice,
  ChoiceUpsert,
  Attempt,
  AttemptAnswer,
  AttemptAnswerUpsert,
  AttemptFilters,
  AttemptListResponse,
  ExamImport,
  ExamImportResult,
} from '@mik/contracts/exams'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toIso(d: Date | string | null | undefined): string {
  if (d == null) throw new Error('toIso: unexpected null/undefined timestamp')
  return d instanceof Date ? d.toISOString() : d
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Exams
// ─────────────────────────────────────────────────────────────────────────────

export async function getExams(): Promise<Exam[]> {
  const rows = await db.selectFrom('exam.exams').selectAll().orderBy('name').execute()
  return rows.map((r) => ({
    examId: r.examId,
    examType: r.examType,
    name: r.name,
    createdAt: toIso(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toIso(r.updatedAt),
    updatedBy: r.updatedBy,
  }))
}

export async function getExamById(examId: string): Promise<Exam | undefined> {
  const r = await db
    .selectFrom('exam.exams')
    .selectAll()
    .where('examId', '=', examId)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    examId: r.examId,
    examType: r.examType,
    name: r.name,
    createdAt: toIso(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toIso(r.updatedAt),
    updatedBy: r.updatedBy,
  }
}

export async function getExamWithPublishedVersion(
  examId: string,
): Promise<ExamWithVersion | undefined> {
  const exam = await getExamById(examId)
  if (!exam) return undefined

  const publishedVersion = await db
    .selectFrom('exam.examVersions')
    .selectAll()
    .where('examId', '=', examId)
    .where('status', '=', 'PUBLISHED')
    .executeTakeFirst()

  if (!publishedVersion) return undefined

  const detail = await getVersionDetail(publishedVersion.versionId)
  if (!detail) return undefined
  return { ...exam, currentVersion: detail }
}

export async function getExamsWithPublishedVersions(): Promise<ExamWithVersion[]> {
  const exams = await getExams()
  if (exams.length === 0) return []

  const examIds = exams.map((e) => e.examId)

  // Single query to find all published versions for these exams
  const publishedRows = await db
    .selectFrom('exam.examVersions')
    .select(['examId', 'versionId'])
    .where('examId', 'in', examIds)
    .where('status', '=', 'PUBLISHED')
    .execute()

  const publishedVersionByExam = new Map(publishedRows.map((r) => [r.examId, r.versionId]))
  const versionIds = [...new Set(publishedVersionByExam.values())]

  // Load all version details in parallel (each detail query is already batched)
  const detailEntries = await Promise.all(
    versionIds.map(async (vId) => {
      const detail = await getVersionDetail(vId)
      return [vId, detail] as const
    }),
  )
  const versionDetails = new Map(
    detailEntries.filter(([, d]) => d != null) as [string, ExamVersionDetail][],
  )

  return exams.flatMap((exam) => {
    const vId = publishedVersionByExam.get(exam.examId)
    const detail = vId ? versionDetails.get(vId) : undefined
    return detail ? [{ ...exam, currentVersion: detail }] : []
  })
}

export async function insertExam(data: ExamUpsert, user: JWTUser): Promise<Exam> {
  const id = data.examId ?? generateShortId()
  const now = new Date()
  await db
    .insertInto('exam.exams')
    .values({
      examId: id,
      examType: data.examType ?? 'OTHER',
      name: data.name,
      ...auditCreate(user.memberId, now),
    })
    .execute()
  const created = await getExamById(id)
  if (!created) return problem({ status: 500, detail: 'Failed to create exam' })
  return created
}

export async function updateExam(
  examId: string,
  data: Partial<ExamUpsert>,
  user: JWTUser,
): Promise<Exam> {
  await db
    .updateTable('exam.exams')
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.examType !== undefined && { examType: data.examType }),
      ...auditUpdate(user.memberId),
    })
    .where('examId', '=', examId)
    .execute()
  const updated = await getExamById(examId)
  if (!updated) return problem({ status: 404, detail: 'Exam not found' })
  return updated
}

export async function deleteExam(examId: string): Promise<void> {
  await db.deleteFrom('exam.exams').where('examId', '=', examId).execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam versions
// ─────────────────────────────────────────────────────────────────────────────

export async function getVersionsByExamId(examId: string): Promise<ExamVersion[]> {
  const rows = await db
    .selectFrom('exam.examVersions')
    .selectAll()
    .where('examId', '=', examId)
    .orderBy('versionNumber', 'desc')
    .execute()
  return rows.map((r) => ({
    versionId: r.versionId,
    examId: r.examId,
    versionNumber: r.versionNumber,
    status: r.status,
    defaultLanguage: r.defaultLanguage,
    supportedLanguages: r.supportedLanguages,
    passPercent: Number(r.passPercent),
    questionCount: r.questionCount ?? null,
    randomizeQuestionOrder: r.randomizeQuestionOrder,
    createdAt: toIso(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toIso(r.updatedAt),
    updatedBy: r.updatedBy,
  }))
}

export async function getVersionById(versionId: string): Promise<ExamVersion | undefined> {
  const r = await db
    .selectFrom('exam.examVersions')
    .selectAll()
    .where('versionId', '=', versionId)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    versionId: r.versionId,
    examId: r.examId,
    versionNumber: r.versionNumber,
    status: r.status,
    defaultLanguage: r.defaultLanguage,
    supportedLanguages: r.supportedLanguages,
    passPercent: Number(r.passPercent),
    questionCount: r.questionCount ?? null,
    randomizeQuestionOrder: r.randomizeQuestionOrder,
    createdAt: toIso(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toIso(r.updatedAt),
    updatedBy: r.updatedBy,
  }
}

export async function getVersionDetail(versionId: string): Promise<ExamVersionDetail | undefined> {
  const version = await getVersionById(versionId)
  if (!version) return undefined

  // translations
  const tranRows = await db
    .selectFrom('exam.examVersionTranslations')
    .selectAll()
    .where('versionId', '=', versionId)
    .execute()
  const translations: ExamVersionDetail['translations'] = {}
  for (const t of tranRows) {
    translations[t.language] = { title: t.title, description: t.description }
  }

  // Batch: questions
  const qRows = await db
    .selectFrom('exam.questions')
    .selectAll()
    .where('versionId', '=', versionId)
    // Rows imported or hand-numbered before ordering was a drag can share a
    // sort_order; the id breaks the tie so the editor shows the same order twice
    // running, and so a reorder starts from what the author actually saw.
    .orderBy('sortOrder')
    .orderBy('questionId')
    .execute()

  if (qRows.length === 0) {
    return { ...version, translations, questions: [] }
  }

  const questionIds = qRows.map((q) => q.questionId)

  // Batch: all question_translations for this version's questions
  const qtRows = await db
    .selectFrom('exam.questionTranslations')
    .selectAll()
    .where('questionId', 'in', questionIds)
    .execute()

  // Batch: all choices for this version's questions
  const cRows = await db
    .selectFrom('exam.choices')
    .selectAll()
    .where('questionId', 'in', questionIds)
    .orderBy('sortOrder')
    .orderBy('choiceId')
    .execute()

  // Batch: all choice_translations for fetched choices (skip if no choices)
  const choiceIds = cRows.map((c) => c.choiceId)
  const ctRows =
    choiceIds.length > 0
      ? await db
          .selectFrom('exam.choiceTranslations')
          .selectAll()
          .where('choiceId', 'in', choiceIds)
          .execute()
      : []

  // Assemble in memory
  const qtByQuestion = new Map<string, Question['translations']>()
  for (const qt of qtRows) {
    if (!qtByQuestion.has(qt.questionId)) qtByQuestion.set(qt.questionId, {})
    qtByQuestion.get(qt.questionId)![qt.language] = { prompt: qt.prompt, reasoning: qt.reasoning }
  }

  const ctByChoice = new Map<string, Choice['translations']>()
  for (const ct of ctRows) {
    if (!ctByChoice.has(ct.choiceId)) ctByChoice.set(ct.choiceId, {})
    ctByChoice.get(ct.choiceId)![ct.language] = { text: ct.text }
  }

  const choicesByQuestion = new Map<string, Choice[]>()
  for (const c of cRows) {
    if (!choicesByQuestion.has(c.questionId)) choicesByQuestion.set(c.questionId, [])
    choicesByQuestion.get(c.questionId)!.push({
      choiceId: c.choiceId,
      questionId: c.questionId,
      isCorrect: c.isCorrect,
      sortOrder: c.sortOrder,
      translations: ctByChoice.get(c.choiceId) ?? {},
    })
  }

  const questions: ExamVersionDetail['questions'] = qRows.map((q) => ({
    questionId: q.questionId,
    versionId: q.versionId,
    sortOrder: q.sortOrder,
    translations: qtByQuestion.get(q.questionId) ?? {},
    choices: choicesByQuestion.get(q.questionId) ?? [],
  }))

  return { ...version, translations, questions }
}

export async function createVersion(
  examId: string,
  data: ExamVersionUpsert,
  user: JWTUser,
  cloneFromPublished = false,
): Promise<ExamVersion> {
  const existing = await getVersionsByExamId(examId)
  const nextNumber = existing.length > 0 ? Math.max(...existing.map((v) => v.versionNumber)) + 1 : 1

  const id = generateShortId()
  const now = new Date()

  // Fetch the published detail before opening the transaction (read-only, safe outside tx)
  let publishedVersionDetail: Awaited<ReturnType<typeof getVersionDetail>> | undefined
  if (cloneFromPublished) {
    const published = existing.find((v) => v.status === 'PUBLISHED')
    if (published) publishedVersionDetail = await getVersionDetail(published.versionId)
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('exam.examVersions')
      .values({
        versionId: id,
        examId: examId,
        versionNumber: nextNumber,
        status: 'DRAFT',
        defaultLanguage: data.defaultLanguage ?? 'en',
        supportedLanguages: data.supportedLanguages ?? [],
        passPercent: data.passPercent ?? 75,
        questionCount: data.questionCount ?? null,
        randomizeQuestionOrder: data.randomizeQuestionOrder ?? true,
        ...auditCreate(user.memberId, now),
      })
      .execute()

    if (publishedVersionDetail) {
      // clone translations
      for (const [lang, t] of Object.entries(publishedVersionDetail.translations)) {
        await trx
          .insertInto('exam.examVersionTranslations')
          .values({
            versionId: id,
            language: lang,
            title: t.title,
            description: t.description ?? null,
          })
          .execute()
      }
      // clone questions and choices
      for (const q of publishedVersionDetail.questions) {
        const newQId = generateShortId()
        await trx
          .insertInto('exam.questions')
          .values({ questionId: newQId, versionId: id, sortOrder: q.sortOrder })
          .execute()
        for (const [lang, qt] of Object.entries(q.translations)) {
          await trx
            .insertInto('exam.questionTranslations')
            .values({
              questionId: newQId,
              language: lang,
              prompt: qt.prompt,
              reasoning: qt.reasoning ?? null,
            })
            .execute()
        }
        for (const c of q.choices) {
          const newCId = generateShortId()
          await trx
            .insertInto('exam.choices')
            .values({
              choiceId: newCId,
              questionId: newQId,
              isCorrect: c.isCorrect,
              sortOrder: c.sortOrder,
            })
            .execute()
          for (const [lang, ct] of Object.entries(c.translations)) {
            await trx
              .insertInto('exam.choiceTranslations')
              .values({ choiceId: newCId, language: lang, text: ct.text })
              .execute()
          }
        }
      }
    }
  })

  const created = await getVersionById(id)
  if (!created) return problem({ status: 500, detail: 'Failed to create version' })
  return created
}

export async function updateVersion(
  versionId: string,
  data: Partial<ExamVersionUpsert>,
  user: JWTUser,
): Promise<ExamVersion> {
  await db
    .updateTable('exam.examVersions')
    .set({
      ...(data.defaultLanguage !== undefined && { defaultLanguage: data.defaultLanguage }),
      ...(data.supportedLanguages !== undefined && {
        supportedLanguages: data.supportedLanguages,
      }),
      ...(data.passPercent !== undefined && { passPercent: data.passPercent }),
      ...('questionCount' in data && { questionCount: data.questionCount ?? null }),
      ...(data.randomizeQuestionOrder !== undefined && {
        randomizeQuestionOrder: data.randomizeQuestionOrder,
      }),
      ...auditUpdate(user.memberId),
    })
    .where('versionId', '=', versionId)
    .execute()
  const updated = await getVersionById(versionId)
  if (!updated) return problem({ status: 404, detail: 'Version not found' })
  return updated
}

export async function publishVersion(versionId: string, user: JWTUser): Promise<ExamVersion> {
  const version = await getVersionById(versionId)
  if (!version) return problem({ status: 404, detail: 'Version not found' })
  if (version.status !== 'DRAFT')
    return problem({ status: 409, detail: 'Only DRAFT versions can be published' })

  const now = new Date()
  await db.transaction().execute(async (trx) => {
    // Retire the currently published version (if any)
    await trx
      .updateTable('exam.examVersions')
      .set({ status: 'RETIRED', updatedAt: now, updatedBy: user.memberId })
      .where('examId', '=', version.examId)
      .where('status', '=', 'PUBLISHED')
      .execute()

    // Publish this version
    await trx
      .updateTable('exam.examVersions')
      .set({ status: 'PUBLISHED', updatedAt: now, updatedBy: user.memberId })
      .where('versionId', '=', versionId)
      .execute()
  })

  const updated = await getVersionById(versionId)
  if (!updated) return problem({ status: 500, detail: 'Failed to publish version' })
  return updated
}

export async function deleteVersion(versionId: string): Promise<void> {
  await db.deleteFrom('exam.examVersions').where('versionId', '=', versionId).execute()
}

export async function importExam(data: ExamImport, user: JWTUser): Promise<ExamImportResult> {
  const examId = generateShortId()
  const versionId = generateShortId()
  const now = new Date()

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('exam.exams')
      .values({
        examId: examId,
        examType: data.examType ?? 'OTHER',
        name: data.name,
        ...auditCreate(user.memberId, now),
      })
      .execute()

    await trx
      .insertInto('exam.examVersions')
      .values({
        versionId: versionId,
        examId: examId,
        versionNumber: 1,
        status: 'DRAFT',
        defaultLanguage: data.version.defaultLanguage ?? 'fi',
        supportedLanguages: data.version.supportedLanguages ?? [],
        passPercent: data.version.passPercent ?? 75,
        questionCount: null,
        randomizeQuestionOrder: data.version.randomizeQuestionOrder ?? true,
        ...auditCreate(user.memberId, now),
      })
      .execute()

    for (const [lang, t] of Object.entries(data.version.translations)) {
      await trx
        .insertInto('exam.examVersionTranslations')
        .values({
          versionId: versionId,
          language: lang,
          title: t.title,
          description: t.description ?? null,
        })
        .execute()
    }

    for (const q of data.version.questions) {
      const questionId = generateShortId()
      await trx
        .insertInto('exam.questions')
        .values({ questionId: questionId, versionId: versionId, sortOrder: q.sortOrder })
        .execute()

      for (const [lang, qt] of Object.entries(q.translations)) {
        await trx
          .insertInto('exam.questionTranslations')
          .values({
            questionId: questionId,
            language: lang,
            prompt: qt.prompt,
            reasoning: qt.reasoning ?? null,
          })
          .execute()
      }

      for (const c of q.choices) {
        const choiceId = generateShortId()
        await trx
          .insertInto('exam.choices')
          .values({
            choiceId: choiceId,
            questionId: questionId,
            isCorrect: c.isCorrect,
            sortOrder: c.sortOrder,
          })
          .execute()

        for (const [lang, ct] of Object.entries(c.translations)) {
          await trx
            .insertInto('exam.choiceTranslations')
            .values({ choiceId: choiceId, language: lang, text: ct.text })
            .execute()
        }
      }
    }
  })

  return { examId, versionId }
}

export async function getVersionByQuestionId(questionId: string): Promise<ExamVersion | undefined> {
  const row = await db
    .selectFrom('exam.questions')
    .innerJoin('exam.examVersions', 'exam.examVersions.versionId', 'exam.questions.versionId')
    .select([
      'exam.examVersions.versionId as versionId',
      'exam.examVersions.examId as examId',
      'exam.examVersions.versionNumber as versionNumber',
      'exam.examVersions.status as status',
      'exam.examVersions.defaultLanguage as defaultLanguage',
      'exam.examVersions.supportedLanguages as supportedLanguages',
      'exam.examVersions.passPercent as passPercent',
      'exam.examVersions.questionCount as questionCount',
      'exam.examVersions.randomizeQuestionOrder as randomizeQuestionOrder',
      'exam.examVersions.createdAt as createdAt',
      'exam.examVersions.createdBy as createdBy',
      'exam.examVersions.updatedAt as updatedAt',
      'exam.examVersions.updatedBy as updatedBy',
    ])
    .where('exam.questions.questionId', '=', questionId)
    .executeTakeFirst()

  if (!row) return undefined
  return {
    versionId: row.versionId,
    examId: row.examId,
    versionNumber: row.versionNumber,
    status: row.status,
    defaultLanguage: row.defaultLanguage,
    supportedLanguages: row.supportedLanguages,
    passPercent: Number(row.passPercent),
    questionCount: row.questionCount ?? null,
    randomizeQuestionOrder: row.randomizeQuestionOrder,
    createdAt: toIso(row.createdAt),
    createdBy: row.createdBy,
    updatedAt: toIso(row.updatedAt),
    updatedBy: row.updatedBy,
  }
}

export async function getVersionByChoiceId(choiceId: string): Promise<ExamVersion | undefined> {
  const row = await db
    .selectFrom('exam.choices')
    .innerJoin('exam.questions', 'exam.questions.questionId', 'exam.choices.questionId')
    .innerJoin('exam.examVersions', 'exam.examVersions.versionId', 'exam.questions.versionId')
    .select([
      'exam.examVersions.versionId as versionId',
      'exam.examVersions.examId as examId',
      'exam.examVersions.versionNumber as versionNumber',
      'exam.examVersions.status as status',
      'exam.examVersions.defaultLanguage as defaultLanguage',
      'exam.examVersions.supportedLanguages as supportedLanguages',
      'exam.examVersions.passPercent as passPercent',
      'exam.examVersions.questionCount as questionCount',
      'exam.examVersions.randomizeQuestionOrder as randomizeQuestionOrder',
      'exam.examVersions.createdAt as createdAt',
      'exam.examVersions.createdBy as createdBy',
      'exam.examVersions.updatedAt as updatedAt',
      'exam.examVersions.updatedBy as updatedBy',
    ])
    .where('exam.choices.choiceId', '=', choiceId)
    .executeTakeFirst()

  if (!row) return undefined
  return {
    versionId: row.versionId,
    examId: row.examId,
    versionNumber: row.versionNumber,
    status: row.status,
    defaultLanguage: row.defaultLanguage,
    supportedLanguages: row.supportedLanguages,
    passPercent: Number(row.passPercent),
    questionCount: row.questionCount ?? null,
    randomizeQuestionOrder: row.randomizeQuestionOrder,
    createdAt: toIso(row.createdAt),
    createdBy: row.createdBy,
    updatedAt: toIso(row.updatedAt),
    updatedBy: row.updatedBy,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Version translations
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertVersionTranslation(
  versionId: string,
  language: string,
  title: string,
  description: string | null,
): Promise<void> {
  await db
    .insertInto('exam.examVersionTranslations')
    .values({ versionId: versionId, language, title, description })
    .onConflict((oc) => oc.columns(['versionId', 'language']).doUpdateSet({ title, description }))
    .execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Questions
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertQuestion(versionId: string, data: QuestionUpsert): Promise<Question> {
  const id = data.questionId ?? generateShortId()

  if (data.questionId) {
    await db
      .updateTable('exam.questions')
      .set({ sortOrder: data.sortOrder })
      .where('questionId', '=', id)
      .execute()
  } else {
    await db
      .insertInto('exam.questions')
      .values({ questionId: id, versionId: versionId, sortOrder: data.sortOrder })
      .execute()
  }

  // upsert translations
  for (const [lang, t] of Object.entries(data.translations)) {
    await db
      .insertInto('exam.questionTranslations')
      .values({ questionId: id, language: lang, prompt: t.prompt, reasoning: t.reasoning ?? null })
      .onConflict((oc) =>
        oc
          .columns(['questionId', 'language'])
          .doUpdateSet({ prompt: t.prompt, reasoning: t.reasoning ?? null }),
      )
      .execute()
  }

  const q = await db
    .selectFrom('exam.questions')
    .selectAll()
    .where('questionId', '=', id)
    .executeTakeFirst()
  if (!q) return problem({ status: 500, detail: 'Failed to upsert question' })

  const qtRows = await db
    .selectFrom('exam.questionTranslations')
    .selectAll()
    .where('questionId', '=', id)
    .execute()
  const translations: Question['translations'] = {}
  for (const qt of qtRows) {
    translations[qt.language] = { prompt: qt.prompt, reasoning: qt.reasoning }
  }

  return {
    questionId: q.questionId,
    versionId: q.versionId,
    sortOrder: q.sortOrder,
    translations,
  }
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await db.deleteFrom('exam.questions').where('questionId', '=', questionId).execute()
}

/**
 * Checks that `ids` is a permutation of `existingIds` — same members, no repeats.
 *
 * Counting alone is not enough: `[A, A, B]` against `{A, B, C}` has the right
 * length and no unknown members, but would leave C's `sort_order` untouched and
 * silently produce an order the caller never asked for. The route's Zod schema
 * rejects duplicates too, but these helpers are exported and must hold their own
 * stated contract.
 */
function isCompleteReorder(ids: string[], existingIds: ReadonlySet<string>): boolean {
  const unique = new Set(ids)
  return (
    unique.size === ids.length &&
    unique.size === existingIds.size &&
    ids.every((id) => existingIds.has(id))
  )
}

/**
 * Rewrites `sort_order` for every question of a version so it matches the position
 * of its id in `questionIds`. The caller sends the complete list, which is what
 * makes this idempotent and lets a drag-and-drop reorder be one atomic write
 * instead of a burst of independent upserts that could interleave.
 */
export async function reorderQuestions(versionId: string, questionIds: string[]): Promise<void> {
  const existing = await db
    .selectFrom('exam.questions')
    .select('questionId')
    .where('versionId', '=', versionId)
    .execute()
  const existingIds = new Set(existing.map((q) => q.questionId))

  if (!isCompleteReorder(questionIds, existingIds)) {
    return problem({
      status: 400,
      detail: "Reorder must list every question of this version's pool exactly once",
    })
  }

  await db.transaction().execute(async (trx) => {
    for (const [index, questionId] of questionIds.entries()) {
      await trx
        .updateTable('exam.questions')
        .set({ sortOrder: index })
        .where('questionId', '=', questionId)
        .execute()
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Choices
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertChoice(questionId: string, data: ChoiceUpsert): Promise<Choice> {
  const id = data.choiceId ?? generateShortId()

  await db.transaction().execute(async (trx) => {
    // If marking this choice as correct, clear any existing correct choice for the question
    // to avoid violating the partial unique index on (question_id) WHERE is_correct = true
    if (data.isCorrect) {
      await trx
        .updateTable('exam.choices')
        .set({ isCorrect: false })
        .where('questionId', '=', questionId)
        .where('choiceId', '!=', id)
        .where('isCorrect', '=', true)
        .execute()
    }

    if (data.choiceId) {
      await trx
        .updateTable('exam.choices')
        .set({ isCorrect: data.isCorrect, sortOrder: data.sortOrder })
        .where('choiceId', '=', id)
        .execute()
    } else {
      await trx
        .insertInto('exam.choices')
        .values({
          choiceId: id,
          questionId: questionId,
          isCorrect: data.isCorrect,
          sortOrder: data.sortOrder,
        })
        .execute()
    }
  })

  // upsert translations
  for (const [lang, t] of Object.entries(data.translations)) {
    await db
      .insertInto('exam.choiceTranslations')
      .values({ choiceId: id, language: lang, text: t.text })
      .onConflict((oc) => oc.columns(['choiceId', 'language']).doUpdateSet({ text: t.text }))
      .execute()
  }

  const c = await db
    .selectFrom('exam.choices')
    .selectAll()
    .where('choiceId', '=', id)
    .executeTakeFirst()
  if (!c) return problem({ status: 500, detail: 'Failed to upsert choice' })

  const ctRows = await db
    .selectFrom('exam.choiceTranslations')
    .selectAll()
    .where('choiceId', '=', id)
    .execute()
  const translations: Choice['translations'] = {}
  for (const ct of ctRows) {
    translations[ct.language] = { text: ct.text }
  }

  return {
    choiceId: c.choiceId,
    questionId: c.questionId,
    isCorrect: c.isCorrect,
    sortOrder: c.sortOrder,
    translations,
  }
}

export async function deleteChoice(choiceId: string): Promise<void> {
  await db.deleteFrom('exam.choices').where('choiceId', '=', choiceId).execute()
}

/** The choice-level counterpart of {@link reorderQuestions}. */
export async function reorderChoices(questionId: string, choiceIds: string[]): Promise<void> {
  const existing = await db
    .selectFrom('exam.choices')
    .select('choiceId')
    .where('questionId', '=', questionId)
    .execute()
  const existingIds = new Set(existing.map((c) => c.choiceId))

  if (!isCompleteReorder(choiceIds, existingIds)) {
    return problem({
      status: 400,
      detail: 'Reorder must list every choice of this question exactly once',
    })
  }

  await db.transaction().execute(async (trx) => {
    for (const [index, choiceId] of choiceIds.entries()) {
      await trx
        .updateTable('exam.choices')
        .set({ sortOrder: index })
        .where('choiceId', '=', choiceId)
        .execute()
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Attempts
// ─────────────────────────────────────────────────────────────────────────────

function rowToAttempt(
  r: DbRow<'exam.attempts'> & {
    examId?: string | null
    name?: string | null
    examType?: Attempt['examType']
    versionNumber?: number | null
    latestPublishedVersionNumber?: number | string | null
  },
): Attempt {
  return {
    attemptId: r.attemptId,
    versionId: r.versionId,
    examId: r.examId ?? null,
    examName: r.name ?? null,
    examType: r.examType ?? null,
    versionNumber: r.versionNumber ?? null,
    latestPublishedVersionNumber:
      r.latestPublishedVersionNumber != null ? Number(r.latestPublishedVersionNumber) : null,
    memberId: r.memberId,
    language: r.language,
    status: r.status as Attempt['status'],
    scorePercent: r.scorePercent != null ? Number(r.scorePercent) : null,
    correctCount: r.correctCount,
    totalCount: r.totalCount,
    passed: r.passed,
    submittedAt: r.submittedAt ? toIso(r.submittedAt) : null,
    gradedAt: r.gradedAt ? toIso(r.gradedAt) : null,
    abandonedAt: r.abandonedAt ? toIso(r.abandonedAt) : null,
    abandonReason: r.abandonReason,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }
}

export async function getAttempts(filters: AttemptFilters): Promise<AttemptListResponse> {
  const { page, pageSize } = filters

  let q = db
    .selectFrom('exam.attempts as attempts')
    .innerJoin('exam.examVersions as versions', 'versions.versionId', 'attempts.versionId')
    .innerJoin('exam.exams as exams', 'exams.examId', 'versions.examId')
  if (filters.memberId) q = q.where('attempts.memberId', '=', filters.memberId)
  if (filters.status) q = q.where('attempts.status', '=', filters.status)

  if (filters.examId) {
    q = q.where('versions.examId', '=', filters.examId)
  }

  const countRow = await q.select((eb) => [eb.fn.countAll<number>().as('total')]).executeTakeFirst()
  const total = Number(countRow?.total ?? 0)

  const rows = await q
    .select((eb) => [
      'attempts.attemptId',
      'attempts.versionId',
      'versions.examId',
      'exams.name',
      'exams.examType',
      'versions.versionNumber',
      'attempts.memberId',
      'attempts.language',
      'attempts.status',
      'attempts.scorePercent',
      'attempts.correctCount',
      'attempts.totalCount',
      'attempts.passed',
      'attempts.submittedAt',
      'attempts.gradedAt',
      'attempts.abandonedAt',
      'attempts.abandonReason',
      'attempts.createdAt',
      'attempts.updatedAt',
      eb
        .selectFrom('exam.examVersions as publishedVersions')
        .select((eb2) => [eb2.fn.max<number>('publishedVersions.versionNumber').as('latest')])
        .whereRef('publishedVersions.examId', '=', 'versions.examId')
        .where('publishedVersions.status', '=', 'PUBLISHED')
        .as('latestPublishedVersionNumber'),
    ])
    .orderBy('attempts.createdAt', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute()

  return {
    items: rows.map(rowToAttempt),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  }
}

export async function getAttemptById(attemptId: string): Promise<Attempt | undefined> {
  const r = await db
    .selectFrom('exam.attempts')
    .selectAll()
    .where('attemptId', '=', attemptId)
    .executeTakeFirst()
  if (!r) return undefined
  return rowToAttempt(r)
}

export async function createAttempt(
  versionId: string,
  memberId: string,
  language: string,
): Promise<Attempt> {
  const id = generateShortId()
  const now = new Date()

  const version = await getVersionById(versionId)
  if (!version) return problem({ status: 404, detail: 'Exam version not found' })

  const allQuestions = await db
    .selectFrom('exam.questions')
    .select('questionId')
    .where('versionId', '=', versionId)
    // questionId breaks ties so a fixed-order attempt is reproducible even if two
    // questions somehow share a sort_order.
    .orderBy('sortOrder')
    .orderBy('questionId')
    .execute()

  const questionIds = allQuestions.map((q) => q.questionId)

  // The two presentation modes are mutually exclusive (#855): either the whole pool
  // in the order the author arranged it, or a shuffle that questionCount may narrow
  // to a random subset. questionCount is deliberately ignored in fixed order — a
  // fixed exam is that fixed set of questions, not a random slice of one.
  let selected: string[]
  if (version.randomizeQuestionOrder) {
    const shuffled = fisherYatesShuffle(questionIds)
    selected =
      version.questionCount != null && version.questionCount < shuffled.length
        ? shuffled.slice(0, version.questionCount)
        : shuffled
  } else {
    selected = questionIds
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('exam.attempts')
      .values({
        attemptId: id,
        versionId: versionId,
        memberId: memberId,
        language,
        status: 'IN_PROGRESS',
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    for (let i = 0; i < selected.length; i++) {
      await trx
        .insertInto('exam.attemptQuestions')
        .values({ attemptId: id, questionId: selected[i], sortOrder: i })
        .execute()
    }
  })

  const created = await getAttemptById(id)
  if (!created) return problem({ status: 500, detail: 'Failed to create attempt' })
  return created
}

export async function getAttemptVersionDetail(
  attemptId: string,
): Promise<ExamVersionDetail | undefined> {
  const attempt = await getAttemptById(attemptId)
  if (!attempt) return undefined

  const version = await getVersionById(attempt.versionId)
  if (!version) return undefined

  // translations
  const tranRows = await db
    .selectFrom('exam.examVersionTranslations')
    .selectAll()
    .where('versionId', '=', attempt.versionId)
    .execute()
  const translations: ExamVersionDetail['translations'] = {}
  for (const t of tranRows) {
    translations[t.language] = { title: t.title, description: t.description }
  }

  // Only the questions assigned to this attempt, in attempt order
  const aqRows = await db
    .selectFrom('exam.attemptQuestions as aq')
    .innerJoin('exam.questions as q', 'q.questionId', 'aq.questionId')
    .select(['q.questionId', 'q.versionId', 'q.sortOrder', 'aq.sortOrder as attemptSortOrder'])
    .where('aq.attemptId', '=', attemptId)
    .orderBy('aq.sortOrder')
    .execute()

  if (aqRows.length === 0) {
    return { ...version, translations, questions: [] }
  }

  const questionIds = aqRows.map((r) => r.questionId)

  const qtRows = await db
    .selectFrom('exam.questionTranslations')
    .selectAll()
    .where('questionId', 'in', questionIds)
    .execute()

  const cRows = await db
    .selectFrom('exam.choices')
    .selectAll()
    .where('questionId', 'in', questionIds)
    .orderBy('sortOrder')
    .orderBy('choiceId')
    .execute()

  const choiceIds = cRows.map((c) => c.choiceId)
  const ctRows =
    choiceIds.length > 0
      ? await db
          .selectFrom('exam.choiceTranslations')
          .selectAll()
          .where('choiceId', 'in', choiceIds)
          .execute()
      : []

  const qtByQuestion = new Map<string, Question['translations']>()
  for (const qt of qtRows) {
    if (!qtByQuestion.has(qt.questionId)) qtByQuestion.set(qt.questionId, {})
    qtByQuestion.get(qt.questionId)![qt.language] = { prompt: qt.prompt, reasoning: qt.reasoning }
  }

  const ctByChoice = new Map<string, Choice['translations']>()
  for (const ct of ctRows) {
    if (!ctByChoice.has(ct.choiceId)) ctByChoice.set(ct.choiceId, {})
    ctByChoice.get(ct.choiceId)![ct.language] = { text: ct.text }
  }

  const choicesByQuestion = new Map<string, Choice[]>()
  for (const c of cRows) {
    if (!choicesByQuestion.has(c.questionId)) choicesByQuestion.set(c.questionId, [])
    choicesByQuestion.get(c.questionId)!.push({
      choiceId: c.choiceId,
      questionId: c.questionId,
      isCorrect: c.isCorrect,
      sortOrder: c.sortOrder,
      translations: ctByChoice.get(c.choiceId) ?? {},
    })
  }

  const questions: ExamVersionDetail['questions'] = aqRows.map((r) => ({
    questionId: r.questionId,
    versionId: r.versionId,
    sortOrder: r.attemptSortOrder,
    translations: qtByQuestion.get(r.questionId) ?? {},
    choices: choicesByQuestion.get(r.questionId) ?? [],
  }))

  return { ...version, translations, questions }
}

export async function validateAnswerInputs(
  attemptId: string,
  questionId: string,
  choiceId?: string | null,
): Promise<{ valid: boolean; detail?: string }> {
  // Verify the question was assigned to this attempt
  const aqRow = await db
    .selectFrom('exam.attemptQuestions')
    .select('questionId')
    .where('attemptId', '=', attemptId)
    .where('questionId', '=', questionId)
    .executeTakeFirst()

  if (!aqRow) return { valid: false, detail: 'Question not part of this attempt' }

  if (choiceId) {
    const choiceRow = await db
      .selectFrom('exam.choices')
      .select('choiceId')
      .where('choiceId', '=', choiceId)
      .where('questionId', '=', questionId)
      .executeTakeFirst()
    if (!choiceRow) return { valid: false, detail: 'Choice does not belong to this question' }
  }

  return { valid: true }
}

export async function upsertAttemptAnswer(
  attemptId: string,
  data: AttemptAnswerUpsert,
): Promise<AttemptAnswer> {
  const now = new Date()
  await db
    .insertInto('exam.attemptAnswers')
    .values({
      attemptId: attemptId,
      questionId: data.questionId,
      choiceId: data.choiceId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc
        .columns(['attemptId', 'questionId'])
        .doUpdateSet({ choiceId: data.choiceId ?? null, updatedAt: now }),
    )
    .execute()

  const r = await db
    .selectFrom('exam.attemptAnswers')
    .selectAll()
    .where('attemptId', '=', attemptId)
    .where('questionId', '=', data.questionId)
    .executeTakeFirst()
  if (!r) return problem({ status: 500, detail: 'Failed to upsert answer' })
  return {
    attemptId: r.attemptId,
    questionId: r.questionId,
    choiceId: r.choiceId,
    updatedAt: toIso(r.updatedAt),
  }
}

export async function getAttemptAnswers(attemptId: string): Promise<AttemptAnswer[]> {
  const rows = await db
    .selectFrom('exam.attemptAnswers')
    .selectAll()
    .where('attemptId', '=', attemptId)
    .execute()
  return rows.map((r) => ({
    attemptId: r.attemptId,
    questionId: r.questionId,
    choiceId: r.choiceId,
    updatedAt: toIso(r.updatedAt),
  }))
}

export async function submitAttempt(attemptId: string): Promise<Attempt> {
  const attempt = await getAttemptById(attemptId)
  if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })
  if (attempt.status !== 'IN_PROGRESS')
    return problem({ status: 409, detail: 'Attempt is not in progress' })

  const detail = await getAttemptVersionDetail(attemptId)
  if (!detail) return problem({ status: 404, detail: 'Exam version not found' })

  const answers = await getAttemptAnswers(attemptId)
  const answerMap = new Map(answers.map((a) => [a.questionId, a.choiceId]))

  let correctCount = 0
  const totalCount = detail.questions.length

  for (const q of detail.questions) {
    const correctChoice = q.choices.find((c) => c.isCorrect)
    const selectedChoiceId = answerMap.get(q.questionId)
    if (correctChoice && selectedChoiceId === correctChoice.choiceId) {
      correctCount++
    }
  }

  const scorePercent = totalCount > 0 ? (correctCount / totalCount) * 100 : 0
  const passed = scorePercent >= Number(detail.passPercent)
  const now = new Date()

  await db
    .updateTable('exam.attempts')
    .set({
      status: 'GRADED',
      scorePercent: scorePercent,
      correctCount: correctCount,
      totalCount: totalCount,
      passed,
      submittedAt: now,
      gradedAt: now,
      updatedAt: now,
    })
    .where('attemptId', '=', attemptId)
    .execute()

  const updated = await getAttemptById(attemptId)
  if (!updated) return problem({ status: 500, detail: 'Failed to submit attempt' })
  return updated
}

export async function abandonAttempt(attemptId: string, reason?: string): Promise<Attempt> {
  const attempt = await getAttemptById(attemptId)
  if (!attempt) return problem({ status: 404, detail: 'Attempt not found' })
  if (attempt.status !== 'IN_PROGRESS')
    return problem({ status: 409, detail: 'Attempt is not in progress' })

  const now = new Date()
  await db
    .updateTable('exam.attempts')
    .set({
      status: 'ABANDONED',
      abandonedAt: now,
      abandonReason: reason ?? null,
      updatedAt: now,
    })
    .where('attemptId', '=', attemptId)
    .execute()

  const updated = await getAttemptById(attemptId)
  if (!updated) return problem({ status: 500, detail: 'Failed to abandon attempt' })
  return updated
}
