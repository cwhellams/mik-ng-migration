import 'dotenv/config'

import { db } from '../../src/db/connection.ts'
import {
  getAttempts,
  getExamWithPublishedVersion,
  getExamsWithPublishedVersions,
  createAttempt,
  getAttemptVersionDetail,
  validateAnswerInputs,
  submitAttempt,
  importExam,
  getVersionDetail,
} from '../../src/db/exam-queries.ts'

describe('Db exam attempt tests', () => {
  const examId = 'TSTEXAM1'
  const versionId = 'TSTVER01'
  const newerPublishedVersionId = 'TSTVER03'
  const attemptIds = ['TSTATT01', 'TSTATT02']
  const createdBy = 'k1mnimda'
  const gradedMemberId = 'Matti1'
  const inProgressMemberId = 'Liisa1'
  const unpublishedExamId = 'TSTEXAM2'
  const unpublishedVersionId = 'TSTVER02'

  const cleanupExamFixtures = async () => {
    await db.deleteFrom('exam.attempts').where('versionId', '=', versionId).execute()
    await db.deleteFrom('exam.attempts').where('versionId', '=', unpublishedVersionId).execute()
    await db
      .deleteFrom('exam.examVersions')
      .where('versionId', '=', newerPublishedVersionId)
      .execute()
    await db.deleteFrom('exam.examVersions').where('versionId', '=', unpublishedVersionId).execute()
    await db.deleteFrom('exam.examVersions').where('versionId', '=', versionId).execute()
    await db.deleteFrom('exam.exams').where('examId', '=', unpublishedExamId).execute()
    await db.deleteFrom('exam.exams').where('examId', '=', examId).execute()
  }

  beforeEach(async () => {
    await cleanupExamFixtures()

    await db
      .insertInto('exam.exams')
      .values({
        examId: examId,
        examType: 'OTHER',
        name: 'Test exam',
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.exams')
      .values({
        examId: unpublishedExamId,
        examType: 'OTHER',
        name: 'Unpublished exam',
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.examVersions')
      .values({
        versionId: versionId,
        examId: examId,
        versionNumber: 1,
        status: 'RETIRED',
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        passPercent: 75,
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.examVersions')
      .values({
        versionId: newerPublishedVersionId,
        examId: examId,
        versionNumber: 2,
        status: 'PUBLISHED',
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        passPercent: 75,
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.examVersions')
      .values({
        versionId: unpublishedVersionId,
        examId: unpublishedExamId,
        versionNumber: 1,
        status: 'DRAFT',
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        passPercent: 75,
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.attempts')
      .values([
        {
          attemptId: attemptIds[0],
          versionId: versionId,
          memberId: gradedMemberId,
          language: 'en',
          status: 'GRADED',
          scorePercent: 80,
          correctCount: 4,
          totalCount: 5,
          passed: true,
          createdAt: new Date('2026-01-02T10:00:00.000Z'),
          updatedAt: new Date('2026-01-02T10:00:00.000Z'),
        },
        {
          attemptId: attemptIds[1],
          versionId: versionId,
          memberId: inProgressMemberId,
          language: 'en',
          status: 'IN_PROGRESS',
          createdAt: new Date('2026-01-03T10:00:00.000Z'),
          updatedAt: new Date('2026-01-03T10:00:00.000Z'),
        },
      ])
      .execute()
  })

  afterEach(async () => {
    await cleanupExamFixtures()
  })

  it('getAttempts returns paginated attempts without aggregate SQL errors', async () => {
    const result = await getAttempts({
      memberId: gradedMemberId,
      page: 1,
      pageSize: 10,
    })

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      hasMore: false,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      attemptId: attemptIds[0],
      examId,
      examType: 'OTHER',
      versionNumber: 1,
      latestPublishedVersionNumber: 2,
      memberId: gradedMemberId,
      status: 'GRADED',
      scorePercent: 80,
      correctCount: 4,
      totalCount: 5,
      passed: true,
    })
  })

  it('getExamsWithPublishedVersions excludes exams without a published version', async () => {
    const result = await getExamsWithPublishedVersions()

    expect(result.map((exam) => exam.examId)).toContain(examId)
    expect(result.map((exam) => exam.examId)).not.toContain(unpublishedExamId)
    expect(result.find((exam) => exam.examId === examId)?.currentVersion?.versionId).toBe(
      newerPublishedVersionId,
    )
  })

  it('getExamWithPublishedVersion returns undefined when exam has no published version', async () => {
    const result = await getExamWithPublishedVersion(unpublishedExamId)

    expect(result).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Randomised question selection tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Randomised question selection', () => {
  const rndExamId = 'RNDEXAM1'
  const rndVersionId = 'RNDVER01'
  const rndMemberId = 'Matti1' // exists in test data
  const createdBy = 'k1mnimda'
  const questionIds = ['RNDQ0001', 'RNDQ0002', 'RNDQ0003', 'RNDQ0004', 'RNDQ0005']

  const cleanup = async () => {
    await db.deleteFrom('exam.attempts').where('versionId', '=', rndVersionId).execute()
    await db.deleteFrom('exam.questions').where('versionId', '=', rndVersionId).execute()
    await db.deleteFrom('exam.examVersions').where('versionId', '=', rndVersionId).execute()
    await db.deleteFrom('exam.exams').where('examId', '=', rndExamId).execute()
  }

  beforeEach(async () => {
    await cleanup()

    await db
      .insertInto('exam.exams')
      .values({
        examId: rndExamId,
        examType: 'OTHER',
        name: 'Rnd Exam',
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.examVersions')
      .values({
        versionId: rndVersionId,
        examId: rndExamId,
        versionNumber: 1,
        status: 'PUBLISHED',
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        passPercent: 75,
        questionCount: 3,
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    for (let i = 0; i < questionIds.length; i++) {
      await db
        .insertInto('exam.questions')
        .values({ questionId: questionIds[i], versionId: rndVersionId, sortOrder: i })
        .execute()
    }
  })

  afterEach(cleanup)

  it('creates an attempt with exactly question_count questions when pool is larger', async () => {
    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    expect(detail).toBeDefined()
    expect(detail!.questions).toHaveLength(3)
  })

  it('every question in an attempt belongs to the version pool', async () => {
    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    const assignedIds = detail!.questions.map((q) => q.questionId)
    expect(assignedIds.every((id) => questionIds.includes(id))).toBe(true)
  })

  it('re-fetching the same attempt always returns the same questions in the same order', async () => {
    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const first = await getAttemptVersionDetail(attempt.attemptId)
    const second = await getAttemptVersionDetail(attempt.attemptId)

    expect(first!.questions.map((q) => q.questionId)).toEqual(
      second!.questions.map((q) => q.questionId),
    )
  })

  it('uses all questions when question_count is null', async () => {
    await db
      .updateTable('exam.examVersions')
      .set({ questionCount: null })
      .where('versionId', '=', rndVersionId)
      .execute()

    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    expect(detail!.questions).toHaveLength(questionIds.length)
  })

  it('validateAnswerInputs rejects a question not in the attempt', async () => {
    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)
    const assignedIds = new Set(detail!.questions.map((q) => q.questionId))
    const notAssigned = questionIds.find((id) => !assignedIds.has(id))

    if (!notAssigned) {
      // All questions assigned (shouldn't happen with 5 questions and count=3), skip
      return
    }

    const result = await validateAnswerInputs(attempt.attemptId, notAssigned, null)
    expect(result.valid).toBe(false)
    expect(result.detail).toMatch(/not part of this attempt/i)
  })

  it('submitAttempt grades only the attempt questions (totalCount === question_count)', async () => {
    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const graded = await submitAttempt(attempt.attemptId)

    expect(graded.totalCount).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// importExam
// ─────────────────────────────────────────────────────────────────────────────

describe('importExam', () => {
  const importedExamIds: string[] = []

  afterEach(async () => {
    for (const examId of importedExamIds) {
      await db.deleteFrom('exam.exams').where('examId', '=', examId).execute()
    }
    importedExamIds.length = 0
  })

  const testUser = {
    memberId: 'k1mnimda',
    email: 'test@mik.fi',
    lastName: 'Test',
    roles: [],
    permissions: [],
    canMakeReservations: false,
  }

  const sampleImport = {
    name: '010 Air Law Test',
    examType: 'OTHER' as const,
    version: {
      defaultLanguage: 'fi',
      supportedLanguages: ['fi', 'en'],
      passPercent: 75,
      translations: {
        fi: { title: '010 Ilmailulainsäädäntö', description: null },
        en: { title: '010 Air Law Test', description: null },
      },
      questions: [
        {
          sortOrder: 1,
          translations: {
            fi: { prompt: 'Kysymys 1?', reasoning: null },
            en: { prompt: 'Question 1?', reasoning: null },
          },
          choices: [
            {
              sortOrder: 0,
              isCorrect: true,
              translations: { fi: { text: 'A fi' }, en: { text: 'A en' } },
            },
            {
              sortOrder: 1,
              isCorrect: false,
              translations: { fi: { text: 'B fi' }, en: { text: 'B en' } },
            },
            {
              sortOrder: 2,
              isCorrect: false,
              translations: { fi: { text: 'C fi' }, en: { text: 'C en' } },
            },
            {
              sortOrder: 3,
              isCorrect: false,
              translations: { fi: { text: 'D fi' }, en: { text: 'D en' } },
            },
          ],
        },
        {
          sortOrder: 2,
          translations: {
            fi: { prompt: 'Kysymys 2?', reasoning: null },
            en: { prompt: 'Question 2?', reasoning: null },
          },
          choices: [
            {
              sortOrder: 0,
              isCorrect: false,
              translations: { fi: { text: 'A fi' }, en: { text: 'A en' } },
            },
            {
              sortOrder: 1,
              isCorrect: true,
              translations: { fi: { text: 'B fi' }, en: { text: 'B en' } },
            },
            {
              sortOrder: 2,
              isCorrect: false,
              translations: { fi: { text: 'C fi' }, en: { text: 'C en' } },
            },
            {
              sortOrder: 3,
              isCorrect: false,
              translations: { fi: { text: 'D fi' }, en: { text: 'D en' } },
            },
          ],
        },
      ],
    },
  }

  it('creates exam, version, questions, and choices in a single transaction', async () => {
    const result = await importExam(sampleImport, testUser)
    importedExamIds.push(result.examId)

    expect(result.examId).toBeTruthy()
    expect(result.versionId).toBeTruthy()

    const detail = await getVersionDetail(result.versionId)
    expect(detail).toBeDefined()
    expect(detail!.status).toBe('DRAFT')
    expect(detail!.defaultLanguage).toBe('fi')
    expect(detail!.supportedLanguages).toEqual(['fi', 'en'])
    expect(detail!.passPercent).toBe(75)
    expect(detail!.translations['fi'].title).toBe('010 Ilmailulainsäädäntö')
    expect(detail!.translations['en'].title).toBe('010 Air Law Test')
    expect(detail!.questions).toHaveLength(2)
  })

  it('sets question prompts and choice translations correctly', async () => {
    const result = await importExam(sampleImport, testUser)
    importedExamIds.push(result.examId)

    const detail = await getVersionDetail(result.versionId)
    const q1 = detail!.questions[0]

    expect(q1.translations['fi'].prompt).toBe('Kysymys 1?')
    expect(q1.translations['en'].prompt).toBe('Question 1?')
    expect(q1.choices).toHaveLength(4)

    const correctChoice = q1.choices.find((c) => c.isCorrect)
    expect(correctChoice).toBeDefined()
    expect(correctChoice!.translations['fi'].text).toBe('A fi')
    expect(correctChoice!.translations['en'].text).toBe('A en')
  })

  it('preserves isCorrect flag per choice', async () => {
    const result = await importExam(sampleImport, testUser)
    importedExamIds.push(result.examId)

    const detail = await getVersionDetail(result.versionId)
    const q2 = detail!.questions[1]
    const correctChoice = q2.choices.find((c) => c.isCorrect)

    expect(correctChoice!.sortOrder).toBe(1) // B is correct in question 2
  })
})
