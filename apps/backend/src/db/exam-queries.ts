import { db } from './connection.ts'
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
} from '../routes/exams/models.ts'

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
    examId: r.exam_id,
    examType: r.exam_type,
    name: r.name,
    createdAt: toIso(r.created_at),
    createdBy: r.created_by,
    updatedAt: toIso(r.updated_at),
    updatedBy: r.updated_by,
  }))
}

export async function getExamById(examId: string): Promise<Exam | undefined> {
  const r = await db
    .selectFrom('exam.exams')
    .selectAll()
    .where('exam_id', '=', examId)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    examId: r.exam_id,
    examType: r.exam_type,
    name: r.name,
    createdAt: toIso(r.created_at),
    createdBy: r.created_by,
    updatedAt: toIso(r.updated_at),
    updatedBy: r.updated_by,
  }
}

export async function getExamWithPublishedVersion(
  examId: string,
): Promise<ExamWithVersion | undefined> {
  const exam = await getExamById(examId)
  if (!exam) return undefined

  const publishedVersion = await db
    .selectFrom('exam.exam_versions')
    .selectAll()
    .where('exam_id', '=', examId)
    .where('status', '=', 'PUBLISHED')
    .executeTakeFirst()

  if (!publishedVersion) return undefined

  const detail = await getVersionDetail(publishedVersion.version_id)
  if (!detail) return undefined
  return { ...exam, currentVersion: detail }
}

export async function getExamsWithPublishedVersions(): Promise<ExamWithVersion[]> {
  const exams = await getExams()
  if (exams.length === 0) return []

  const examIds = exams.map((e) => e.examId)

  // Single query to find all published versions for these exams
  const publishedRows = await db
    .selectFrom('exam.exam_versions')
    .select(['exam_id', 'version_id'])
    .where('exam_id', 'in', examIds)
    .where('status', '=', 'PUBLISHED')
    .execute()

  const publishedVersionByExam = new Map(publishedRows.map((r) => [r.exam_id, r.version_id]))
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
      exam_id: id,
      exam_type: data.examType ?? 'OTHER',
      name: data.name,
      created_at: now,
      created_by: user.memberId,
      updated_at: now,
      updated_by: user.memberId,
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
      ...(data.examType !== undefined && { exam_type: data.examType }),
      updated_at: new Date(),
      updated_by: user.memberId,
    })
    .where('exam_id', '=', examId)
    .execute()
  const updated = await getExamById(examId)
  if (!updated) return problem({ status: 404, detail: 'Exam not found' })
  return updated
}

export async function deleteExam(examId: string): Promise<void> {
  await db.deleteFrom('exam.exams').where('exam_id', '=', examId).execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam versions
// ─────────────────────────────────────────────────────────────────────────────

export async function getVersionsByExamId(examId: string): Promise<ExamVersion[]> {
  const rows = await db
    .selectFrom('exam.exam_versions')
    .selectAll()
    .where('exam_id', '=', examId)
    .orderBy('version_number', 'desc')
    .execute()
  return rows.map((r) => ({
    versionId: r.version_id,
    examId: r.exam_id,
    versionNumber: r.version_number,
    status: r.status,
    defaultLanguage: r.default_language,
    supportedLanguages: r.supported_languages,
    passPercent: Number(r.pass_percent),
    questionCount: r.question_count ?? null,
    createdAt: toIso(r.created_at),
    createdBy: r.created_by,
    updatedAt: toIso(r.updated_at),
    updatedBy: r.updated_by,
  }))
}

export async function getVersionById(versionId: string): Promise<ExamVersion | undefined> {
  const r = await db
    .selectFrom('exam.exam_versions')
    .selectAll()
    .where('version_id', '=', versionId)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    versionId: r.version_id,
    examId: r.exam_id,
    versionNumber: r.version_number,
    status: r.status,
    defaultLanguage: r.default_language,
    supportedLanguages: r.supported_languages,
    passPercent: Number(r.pass_percent),
    questionCount: r.question_count ?? null,
    createdAt: toIso(r.created_at),
    createdBy: r.created_by,
    updatedAt: toIso(r.updated_at),
    updatedBy: r.updated_by,
  }
}

export async function getVersionDetail(versionId: string): Promise<ExamVersionDetail | undefined> {
  const version = await getVersionById(versionId)
  if (!version) return undefined

  // translations
  const tranRows = await db
    .selectFrom('exam.exam_version_translations')
    .selectAll()
    .where('version_id', '=', versionId)
    .execute()
  const translations: ExamVersionDetail['translations'] = {}
  for (const t of tranRows) {
    translations[t.language] = { title: t.title, description: t.description }
  }

  // Batch: questions
  const qRows = await db
    .selectFrom('exam.questions')
    .selectAll()
    .where('version_id', '=', versionId)
    .orderBy('sort_order')
    .execute()

  if (qRows.length === 0) {
    return { ...version, translations, questions: [] }
  }

  const questionIds = qRows.map((q) => q.question_id)

  // Batch: all question_translations for this version's questions
  const qtRows = await db
    .selectFrom('exam.question_translations')
    .selectAll()
    .where('question_id', 'in', questionIds)
    .execute()

  // Batch: all choices for this version's questions
  const cRows = await db
    .selectFrom('exam.choices')
    .selectAll()
    .where('question_id', 'in', questionIds)
    .orderBy('sort_order')
    .execute()

  // Batch: all choice_translations for fetched choices (skip if no choices)
  const choiceIds = cRows.map((c) => c.choice_id)
  const ctRows =
    choiceIds.length > 0
      ? await db
          .selectFrom('exam.choice_translations')
          .selectAll()
          .where('choice_id', 'in', choiceIds)
          .execute()
      : []

  // Assemble in memory
  const qtByQuestion = new Map<string, Question['translations']>()
  for (const qt of qtRows) {
    if (!qtByQuestion.has(qt.question_id)) qtByQuestion.set(qt.question_id, {})
    qtByQuestion.get(qt.question_id)![qt.language] = { prompt: qt.prompt, reasoning: qt.reasoning }
  }

  const ctByChoice = new Map<string, Choice['translations']>()
  for (const ct of ctRows) {
    if (!ctByChoice.has(ct.choice_id)) ctByChoice.set(ct.choice_id, {})
    ctByChoice.get(ct.choice_id)![ct.language] = { text: ct.text }
  }

  const choicesByQuestion = new Map<string, Choice[]>()
  for (const c of cRows) {
    if (!choicesByQuestion.has(c.question_id)) choicesByQuestion.set(c.question_id, [])
    choicesByQuestion.get(c.question_id)!.push({
      choiceId: c.choice_id,
      questionId: c.question_id,
      isCorrect: c.is_correct,
      sortOrder: c.sort_order,
      translations: ctByChoice.get(c.choice_id) ?? {},
    })
  }

  const questions: ExamVersionDetail['questions'] = qRows.map((q) => ({
    questionId: q.question_id,
    versionId: q.version_id,
    sortOrder: q.sort_order,
    translations: qtByQuestion.get(q.question_id) ?? {},
    choices: choicesByQuestion.get(q.question_id) ?? [],
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
      .insertInto('exam.exam_versions')
      .values({
        version_id: id,
        exam_id: examId,
        version_number: nextNumber,
        status: 'DRAFT',
        default_language: data.defaultLanguage ?? 'en',
        supported_languages: data.supportedLanguages ?? [],
        pass_percent: data.passPercent ?? 75,
        question_count: data.questionCount ?? null,
        created_at: now,
        created_by: user.memberId,
        updated_at: now,
        updated_by: user.memberId,
      })
      .execute()

    if (publishedVersionDetail) {
      // clone translations
      for (const [lang, t] of Object.entries(publishedVersionDetail.translations)) {
        await trx
          .insertInto('exam.exam_version_translations')
          .values({
            version_id: id,
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
          .values({ question_id: newQId, version_id: id, sort_order: q.sortOrder })
          .execute()
        for (const [lang, qt] of Object.entries(q.translations)) {
          await trx
            .insertInto('exam.question_translations')
            .values({
              question_id: newQId,
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
              choice_id: newCId,
              question_id: newQId,
              is_correct: c.isCorrect,
              sort_order: c.sortOrder,
            })
            .execute()
          for (const [lang, ct] of Object.entries(c.translations)) {
            await trx
              .insertInto('exam.choice_translations')
              .values({ choice_id: newCId, language: lang, text: ct.text })
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
    .updateTable('exam.exam_versions')
    .set({
      ...(data.defaultLanguage !== undefined && { default_language: data.defaultLanguage }),
      ...(data.supportedLanguages !== undefined && {
        supported_languages: data.supportedLanguages,
      }),
      ...(data.passPercent !== undefined && { pass_percent: data.passPercent }),
      ...('questionCount' in data && { question_count: data.questionCount ?? null }),
      updated_at: new Date(),
      updated_by: user.memberId,
    })
    .where('version_id', '=', versionId)
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
      .updateTable('exam.exam_versions')
      .set({ status: 'RETIRED', updated_at: now, updated_by: user.memberId })
      .where('exam_id', '=', version.examId)
      .where('status', '=', 'PUBLISHED')
      .execute()

    // Publish this version
    await trx
      .updateTable('exam.exam_versions')
      .set({ status: 'PUBLISHED', updated_at: now, updated_by: user.memberId })
      .where('version_id', '=', versionId)
      .execute()
  })

  const updated = await getVersionById(versionId)
  if (!updated) return problem({ status: 500, detail: 'Failed to publish version' })
  return updated
}

export async function deleteVersion(versionId: string): Promise<void> {
  await db.deleteFrom('exam.exam_versions').where('version_id', '=', versionId).execute()
}

export async function importExam(data: ExamImport, user: JWTUser): Promise<ExamImportResult> {
  const examId = generateShortId()
  const versionId = generateShortId()
  const now = new Date()

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('exam.exams')
      .values({
        exam_id: examId,
        exam_type: data.examType ?? 'OTHER',
        name: data.name,
        created_at: now,
        created_by: user.memberId,
        updated_at: now,
        updated_by: user.memberId,
      })
      .execute()

    await trx
      .insertInto('exam.exam_versions')
      .values({
        version_id: versionId,
        exam_id: examId,
        version_number: 1,
        status: 'DRAFT',
        default_language: data.version.defaultLanguage ?? 'fi',
        supported_languages: data.version.supportedLanguages ?? [],
        pass_percent: data.version.passPercent ?? 75,
        question_count: null,
        created_at: now,
        created_by: user.memberId,
        updated_at: now,
        updated_by: user.memberId,
      })
      .execute()

    for (const [lang, t] of Object.entries(data.version.translations)) {
      await trx
        .insertInto('exam.exam_version_translations')
        .values({
          version_id: versionId,
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
        .values({ question_id: questionId, version_id: versionId, sort_order: q.sortOrder })
        .execute()

      for (const [lang, qt] of Object.entries(q.translations)) {
        await trx
          .insertInto('exam.question_translations')
          .values({
            question_id: questionId,
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
            choice_id: choiceId,
            question_id: questionId,
            is_correct: c.isCorrect,
            sort_order: c.sortOrder,
          })
          .execute()

        for (const [lang, ct] of Object.entries(c.translations)) {
          await trx
            .insertInto('exam.choice_translations')
            .values({ choice_id: choiceId, language: lang, text: ct.text })
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
    .innerJoin('exam.exam_versions', 'exam.exam_versions.version_id', 'exam.questions.version_id')
    .select([
      'exam.exam_versions.version_id as version_id',
      'exam.exam_versions.exam_id as exam_id',
      'exam.exam_versions.version_number as version_number',
      'exam.exam_versions.status as status',
      'exam.exam_versions.default_language as default_language',
      'exam.exam_versions.supported_languages as supported_languages',
      'exam.exam_versions.pass_percent as pass_percent',
      'exam.exam_versions.created_at as created_at',
      'exam.exam_versions.created_by as created_by',
      'exam.exam_versions.updated_at as updated_at',
      'exam.exam_versions.updated_by as updated_by',
    ])
    .where('exam.questions.question_id', '=', questionId)
    .executeTakeFirst()

  if (!row) return undefined
  return {
    versionId: row.version_id,
    examId: row.exam_id,
    versionNumber: row.version_number,
    status: row.status,
    defaultLanguage: row.default_language,
    supportedLanguages: row.supported_languages,
    passPercent: Number(row.pass_percent),
    createdAt: toIso(row.created_at),
    createdBy: row.created_by,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  }
}

export async function getVersionByChoiceId(choiceId: string): Promise<ExamVersion | undefined> {
  const row = await db
    .selectFrom('exam.choices')
    .innerJoin('exam.questions', 'exam.questions.question_id', 'exam.choices.question_id')
    .innerJoin('exam.exam_versions', 'exam.exam_versions.version_id', 'exam.questions.version_id')
    .select([
      'exam.exam_versions.version_id as version_id',
      'exam.exam_versions.exam_id as exam_id',
      'exam.exam_versions.version_number as version_number',
      'exam.exam_versions.status as status',
      'exam.exam_versions.default_language as default_language',
      'exam.exam_versions.supported_languages as supported_languages',
      'exam.exam_versions.pass_percent as pass_percent',
      'exam.exam_versions.created_at as created_at',
      'exam.exam_versions.created_by as created_by',
      'exam.exam_versions.updated_at as updated_at',
      'exam.exam_versions.updated_by as updated_by',
    ])
    .where('exam.choices.choice_id', '=', choiceId)
    .executeTakeFirst()

  if (!row) return undefined
  return {
    versionId: row.version_id,
    examId: row.exam_id,
    versionNumber: row.version_number,
    status: row.status,
    defaultLanguage: row.default_language,
    supportedLanguages: row.supported_languages,
    passPercent: Number(row.pass_percent),
    createdAt: toIso(row.created_at),
    createdBy: row.created_by,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
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
    .insertInto('exam.exam_version_translations')
    .values({ version_id: versionId, language, title, description })
    .onConflict((oc) => oc.columns(['version_id', 'language']).doUpdateSet({ title, description }))
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
      .set({ sort_order: data.sortOrder })
      .where('question_id', '=', id)
      .execute()
  } else {
    await db
      .insertInto('exam.questions')
      .values({ question_id: id, version_id: versionId, sort_order: data.sortOrder })
      .execute()
  }

  // upsert translations
  for (const [lang, t] of Object.entries(data.translations)) {
    await db
      .insertInto('exam.question_translations')
      .values({ question_id: id, language: lang, prompt: t.prompt, reasoning: t.reasoning ?? null })
      .onConflict((oc) =>
        oc
          .columns(['question_id', 'language'])
          .doUpdateSet({ prompt: t.prompt, reasoning: t.reasoning ?? null }),
      )
      .execute()
  }

  const q = await db
    .selectFrom('exam.questions')
    .selectAll()
    .where('question_id', '=', id)
    .executeTakeFirst()
  if (!q) return problem({ status: 500, detail: 'Failed to upsert question' })

  const qtRows = await db
    .selectFrom('exam.question_translations')
    .selectAll()
    .where('question_id', '=', id)
    .execute()
  const translations: Question['translations'] = {}
  for (const qt of qtRows) {
    translations[qt.language] = { prompt: qt.prompt, reasoning: qt.reasoning }
  }

  return {
    questionId: q.question_id,
    versionId: q.version_id,
    sortOrder: q.sort_order,
    translations,
  }
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await db.deleteFrom('exam.questions').where('question_id', '=', questionId).execute()
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
        .set({ is_correct: false })
        .where('question_id', '=', questionId)
        .where('choice_id', '!=', id)
        .where('is_correct', '=', true)
        .execute()
    }

    if (data.choiceId) {
      await trx
        .updateTable('exam.choices')
        .set({ is_correct: data.isCorrect, sort_order: data.sortOrder })
        .where('choice_id', '=', id)
        .execute()
    } else {
      await trx
        .insertInto('exam.choices')
        .values({
          choice_id: id,
          question_id: questionId,
          is_correct: data.isCorrect,
          sort_order: data.sortOrder,
        })
        .execute()
    }
  })

  // upsert translations
  for (const [lang, t] of Object.entries(data.translations)) {
    await db
      .insertInto('exam.choice_translations')
      .values({ choice_id: id, language: lang, text: t.text })
      .onConflict((oc) => oc.columns(['choice_id', 'language']).doUpdateSet({ text: t.text }))
      .execute()
  }

  const c = await db
    .selectFrom('exam.choices')
    .selectAll()
    .where('choice_id', '=', id)
    .executeTakeFirst()
  if (!c) return problem({ status: 500, detail: 'Failed to upsert choice' })

  const ctRows = await db
    .selectFrom('exam.choice_translations')
    .selectAll()
    .where('choice_id', '=', id)
    .execute()
  const translations: Choice['translations'] = {}
  for (const ct of ctRows) {
    translations[ct.language] = { text: ct.text }
  }

  return {
    choiceId: c.choice_id,
    questionId: c.question_id,
    isCorrect: c.is_correct,
    sortOrder: c.sort_order,
    translations,
  }
}

export async function deleteChoice(choiceId: string): Promise<void> {
  await db.deleteFrom('exam.choices').where('choice_id', '=', choiceId).execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Attempts
// ─────────────────────────────────────────────────────────────────────────────

function rowToAttempt(r: {
  attempt_id: string
  version_id: string
  exam_id?: string | null
  name?: string | null
  exam_type?: Attempt['examType']
  version_number?: number | null
  latest_published_version_number?: number | string | null
  member_id: string
  language: string
  status: string
  score_percent: number | string | null
  correct_count: number | null
  total_count: number | null
  passed: boolean | null
  submitted_at: Date | string | null
  graded_at: Date | string | null
  abandoned_at: Date | string | null
  abandon_reason: string | null
  created_at: Date | string
  updated_at: Date | string
}): Attempt {
  return {
    attemptId: r.attempt_id,
    versionId: r.version_id,
    examId: r.exam_id ?? null,
    examName: r.name ?? null,
    examType: r.exam_type ?? null,
    versionNumber: r.version_number ?? null,
    latestPublishedVersionNumber:
      r.latest_published_version_number != null ? Number(r.latest_published_version_number) : null,
    memberId: r.member_id,
    language: r.language,
    status: r.status as Attempt['status'],
    scorePercent: r.score_percent != null ? Number(r.score_percent) : null,
    correctCount: r.correct_count,
    totalCount: r.total_count,
    passed: r.passed,
    submittedAt: r.submitted_at ? toIso(r.submitted_at) : null,
    gradedAt: r.graded_at ? toIso(r.graded_at) : null,
    abandonedAt: r.abandoned_at ? toIso(r.abandoned_at) : null,
    abandonReason: r.abandon_reason,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  }
}

export async function getAttempts(filters: AttemptFilters): Promise<AttemptListResponse> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 20

  let q = db
    .selectFrom('exam.attempts as attempts')
    .innerJoin('exam.exam_versions as versions', 'versions.version_id', 'attempts.version_id')
    .innerJoin('exam.exams as exams', 'exams.exam_id', 'versions.exam_id')
  if (filters.memberId) q = q.where('attempts.member_id', '=', filters.memberId)
  if (filters.status) q = q.where('attempts.status', '=', filters.status)

  if (filters.examId) {
    q = q.where('versions.exam_id', '=', filters.examId)
  }

  const countRow = await q.select((eb) => [eb.fn.countAll<number>().as('total')]).executeTakeFirst()
  const total = Number(countRow?.total ?? 0)

  const rows = await q
    .select((eb) => [
      'attempts.attempt_id',
      'attempts.version_id',
      'versions.exam_id',
      'exams.name',
      'exams.exam_type',
      'versions.version_number',
      'attempts.member_id',
      'attempts.language',
      'attempts.status',
      'attempts.score_percent',
      'attempts.correct_count',
      'attempts.total_count',
      'attempts.passed',
      'attempts.submitted_at',
      'attempts.graded_at',
      'attempts.abandoned_at',
      'attempts.abandon_reason',
      'attempts.created_at',
      'attempts.updated_at',
      eb
        .selectFrom('exam.exam_versions as published_versions')
        .select((eb2) => [eb2.fn.max<number>('published_versions.version_number').as('latest')])
        .whereRef('published_versions.exam_id', '=', 'versions.exam_id')
        .where('published_versions.status', '=', 'PUBLISHED')
        .as('latest_published_version_number'),
    ])
    .orderBy('attempts.created_at', 'desc')
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
    .where('attempt_id', '=', attemptId)
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
    .select('question_id')
    .where('version_id', '=', versionId)
    .execute()

  const shuffled = fisherYatesShuffle(allQuestions.map((q) => q.question_id))
  const selected =
    version.questionCount != null && version.questionCount < shuffled.length
      ? shuffled.slice(0, version.questionCount)
      : shuffled

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('exam.attempts')
      .values({
        attempt_id: id,
        version_id: versionId,
        member_id: memberId,
        language,
        status: 'IN_PROGRESS',
        created_at: now,
        updated_at: now,
      })
      .execute()

    for (let i = 0; i < selected.length; i++) {
      await trx
        .insertInto('exam.attempt_questions')
        .values({ attempt_id: id, question_id: selected[i], sort_order: i })
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
    .selectFrom('exam.exam_version_translations')
    .selectAll()
    .where('version_id', '=', attempt.versionId)
    .execute()
  const translations: ExamVersionDetail['translations'] = {}
  for (const t of tranRows) {
    translations[t.language] = { title: t.title, description: t.description }
  }

  // Only the questions assigned to this attempt, in attempt order
  const aqRows = await db
    .selectFrom('exam.attempt_questions as aq')
    .innerJoin('exam.questions as q', 'q.question_id', 'aq.question_id')
    .select([
      'q.question_id',
      'q.version_id',
      'q.sort_order',
      'aq.sort_order as attempt_sort_order',
    ])
    .where('aq.attempt_id', '=', attemptId)
    .orderBy('aq.sort_order')
    .execute()

  if (aqRows.length === 0) {
    return { ...version, translations, questions: [] }
  }

  const questionIds = aqRows.map((r) => r.question_id)

  const qtRows = await db
    .selectFrom('exam.question_translations')
    .selectAll()
    .where('question_id', 'in', questionIds)
    .execute()

  const cRows = await db
    .selectFrom('exam.choices')
    .selectAll()
    .where('question_id', 'in', questionIds)
    .orderBy('sort_order')
    .execute()

  const choiceIds = cRows.map((c) => c.choice_id)
  const ctRows =
    choiceIds.length > 0
      ? await db
          .selectFrom('exam.choice_translations')
          .selectAll()
          .where('choice_id', 'in', choiceIds)
          .execute()
      : []

  const qtByQuestion = new Map<string, Question['translations']>()
  for (const qt of qtRows) {
    if (!qtByQuestion.has(qt.question_id)) qtByQuestion.set(qt.question_id, {})
    qtByQuestion.get(qt.question_id)![qt.language] = { prompt: qt.prompt, reasoning: qt.reasoning }
  }

  const ctByChoice = new Map<string, Choice['translations']>()
  for (const ct of ctRows) {
    if (!ctByChoice.has(ct.choice_id)) ctByChoice.set(ct.choice_id, {})
    ctByChoice.get(ct.choice_id)![ct.language] = { text: ct.text }
  }

  const choicesByQuestion = new Map<string, Choice[]>()
  for (const c of cRows) {
    if (!choicesByQuestion.has(c.question_id)) choicesByQuestion.set(c.question_id, [])
    choicesByQuestion.get(c.question_id)!.push({
      choiceId: c.choice_id,
      questionId: c.question_id,
      isCorrect: c.is_correct,
      sortOrder: c.sort_order,
      translations: ctByChoice.get(c.choice_id) ?? {},
    })
  }

  const questions: ExamVersionDetail['questions'] = aqRows.map((r) => ({
    questionId: r.question_id,
    versionId: r.version_id,
    sortOrder: r.attempt_sort_order,
    translations: qtByQuestion.get(r.question_id) ?? {},
    choices: choicesByQuestion.get(r.question_id) ?? [],
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
    .selectFrom('exam.attempt_questions')
    .select('question_id')
    .where('attempt_id', '=', attemptId)
    .where('question_id', '=', questionId)
    .executeTakeFirst()

  if (!aqRow) return { valid: false, detail: 'Question not part of this attempt' }

  if (choiceId) {
    const choiceRow = await db
      .selectFrom('exam.choices')
      .select('choice_id')
      .where('choice_id', '=', choiceId)
      .where('question_id', '=', questionId)
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
    .insertInto('exam.attempt_answers')
    .values({
      attempt_id: attemptId,
      question_id: data.questionId,
      choice_id: data.choiceId ?? null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns(['attempt_id', 'question_id'])
        .doUpdateSet({ choice_id: data.choiceId ?? null, updated_at: now }),
    )
    .execute()

  const r = await db
    .selectFrom('exam.attempt_answers')
    .selectAll()
    .where('attempt_id', '=', attemptId)
    .where('question_id', '=', data.questionId)
    .executeTakeFirst()
  if (!r) return problem({ status: 500, detail: 'Failed to upsert answer' })
  return {
    attemptId: r.attempt_id,
    questionId: r.question_id,
    choiceId: r.choice_id,
    updatedAt: toIso(r.updated_at),
  }
}

export async function getAttemptAnswers(attemptId: string): Promise<AttemptAnswer[]> {
  const rows = await db
    .selectFrom('exam.attempt_answers')
    .selectAll()
    .where('attempt_id', '=', attemptId)
    .execute()
  return rows.map((r) => ({
    attemptId: r.attempt_id,
    questionId: r.question_id,
    choiceId: r.choice_id,
    updatedAt: toIso(r.updated_at),
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
      score_percent: scorePercent,
      correct_count: correctCount,
      total_count: totalCount,
      passed,
      submitted_at: now,
      graded_at: now,
      updated_at: now,
    })
    .where('attempt_id', '=', attemptId)
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
      abandoned_at: now,
      abandon_reason: reason ?? null,
      updated_at: now,
    })
    .where('attempt_id', '=', attemptId)
    .execute()

  const updated = await getAttemptById(attemptId)
  if (!updated) return problem({ status: 500, detail: 'Failed to abandon attempt' })
  return updated
}
