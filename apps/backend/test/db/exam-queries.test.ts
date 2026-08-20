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
  reorderQuestions,
  reorderChoices,
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
      randomizeQuestionOrder: true,
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

// ─────────────────────────────────────────────────────────────────────────────
// Question order: the authored order vs. the shuffle (#855)
// ─────────────────────────────────────────────────────────────────────────────

describe('Question ordering', () => {
  const ordExamId = 'ORDEXAM1'
  const ordVersionId = 'ORDVER01'
  const ordMemberId = 'Matti1' // exists in test data
  const createdBy = 'k1mnimda'
  // Deliberately inserted with sort_order 0..4 so the authored order is known.
  const questionIds = ['ORDQ0001', 'ORDQ0002', 'ORDQ0003', 'ORDQ0004', 'ORDQ0005']
  const choiceIds = ['ORDC0001', 'ORDC0002', 'ORDC0003']

  const cleanup = async () => {
    await db.deleteFrom('exam.attempts').where('versionId', '=', ordVersionId).execute()
    await db.deleteFrom('exam.questions').where('versionId', '=', ordVersionId).execute()
    await db.deleteFrom('exam.examVersions').where('versionId', '=', ordVersionId).execute()
    await db.deleteFrom('exam.exams').where('examId', '=', ordExamId).execute()
  }

  const setRandomizeQuestionOrder = async (randomize: boolean) => {
    await db
      .updateTable('exam.examVersions')
      .set({ randomizeQuestionOrder: randomize })
      .where('versionId', '=', ordVersionId)
      .execute()
  }

  const currentQuestionOrder = async () => {
    const rows = await db
      .selectFrom('exam.questions')
      .select(['questionId', 'sortOrder'])
      .where('versionId', '=', ordVersionId)
      .orderBy('sortOrder')
      .execute()
    return rows.map((r) => r.questionId)
  }

  beforeEach(async () => {
    await cleanup()

    await db
      .insertInto('exam.exams')
      .values({
        examId: ordExamId,
        examType: 'AFM',
        name: 'Ordered Exam',
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.examVersions')
      .values({
        versionId: ordVersionId,
        examId: ordExamId,
        versionNumber: 1,
        status: 'DRAFT',
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        passPercent: 75,
        questionCount: 3,
        randomizeQuestionOrder: false,
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    for (let i = 0; i < questionIds.length; i++) {
      await db
        .insertInto('exam.questions')
        .values({ questionId: questionIds[i], versionId: ordVersionId, sortOrder: i })
        .execute()
    }

    for (let i = 0; i < choiceIds.length; i++) {
      await db
        .insertInto('exam.choices')
        .values({
          choiceId: choiceIds[i],
          questionId: questionIds[0],
          isCorrect: i === 0,
          sortOrder: i,
        })
        .execute()
    }
  })

  afterEach(cleanup)

  it('defaults a version to random order when the column is not given', async () => {
    const version = await getVersionDetail(ordVersionId)
    expect(version!.randomizeQuestionOrder).toBe(false) // explicitly set by the fixture

    await db
      .insertInto('exam.examVersions')
      .values({
        versionId: 'ORDVER99',
        examId: ordExamId,
        versionNumber: 2,
        status: 'DRAFT',
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        passPercent: 75,
        createdBy: createdBy,
        updatedBy: createdBy,
      })
      .execute()

    const defaulted = await getVersionDetail('ORDVER99')
    expect(defaulted!.randomizeQuestionOrder).toBe(true)

    await db.deleteFrom('exam.examVersions').where('versionId', '=', 'ORDVER99').execute()
  })

  it('presents every question in the authored order when randomization is off', async () => {
    const attempt = await createAttempt(ordVersionId, ordMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    expect(detail!.questions.map((q) => q.questionId)).toEqual(questionIds)
  })

  it('ignores question_count in fixed order — a fixed exam is the whole set', async () => {
    // The fixture sets questionCount to 3 against a pool of 5.
    const attempt = await createAttempt(ordVersionId, ordMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    expect(detail!.questions).toHaveLength(questionIds.length)
  })

  it('grades every question of a fixed-order attempt', async () => {
    const attempt = await createAttempt(ordVersionId, ordMemberId, 'en')
    const graded = await submitAttempt(attempt.attemptId)

    expect(graded.totalCount).toBe(questionIds.length)
  })

  it('honours question_count again once randomization is turned back on', async () => {
    await setRandomizeQuestionOrder(true)

    const attempt = await createAttempt(ordVersionId, ordMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    expect(detail!.questions).toHaveLength(3)
  })

  it('reorderQuestions rewrites sort_order to match the list it is given', async () => {
    const reversed = [...questionIds].reverse()
    await reorderQuestions(ordVersionId, reversed)

    expect(await currentQuestionOrder()).toEqual(reversed)
  })

  it('a fixed-order attempt follows a reorder made after it was authored', async () => {
    const moved = [questionIds[4], questionIds[0], questionIds[1], questionIds[2], questionIds[3]]
    await reorderQuestions(ordVersionId, moved)

    const attempt = await createAttempt(ordVersionId, ordMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    expect(detail!.questions.map((q) => q.questionId)).toEqual(moved)
  })

  it('reorderQuestions leaves the existing order alone when the list is incomplete', async () => {
    await expect(reorderQuestions(ordVersionId, questionIds.slice(0, 3))).rejects.toThrow()

    expect(await currentQuestionOrder()).toEqual(questionIds)
  })

  it('reorderQuestions rejects an id from outside the version', async () => {
    const foreign = [...questionIds.slice(0, 4), 'NOTMINE1']
    await expect(reorderQuestions(ordVersionId, foreign)).rejects.toThrow()

    expect(await currentQuestionOrder()).toEqual(questionIds)
  })

  it('reorderChoices rewrites sort_order within one question', async () => {
    const reversed = [...choiceIds].reverse()
    await reorderChoices(questionIds[0], reversed)

    const detail = await getVersionDetail(ordVersionId)
    const question = detail!.questions.find((q) => q.questionId === questionIds[0])
    expect(question!.choices.map((c) => c.choiceId)).toEqual(reversed)
  })

  it('reorderChoices rejects a choice belonging to another question', async () => {
    await expect(
      reorderChoices(questionIds[1], [choiceIds[0], choiceIds[1], choiceIds[2]]),
    ).rejects.toThrow()

    const detail = await getVersionDetail(ordVersionId)
    const question = detail!.questions.find((q) => q.questionId === questionIds[0])
    expect(question!.choices.map((c) => c.choiceId)).toEqual(choiceIds)
  })
})
