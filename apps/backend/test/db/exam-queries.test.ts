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
    await db.deleteFrom('exam.attempts').where('version_id', '=', versionId).execute()
    await db.deleteFrom('exam.attempts').where('version_id', '=', unpublishedVersionId).execute()
    await db
      .deleteFrom('exam.exam_versions')
      .where('version_id', '=', newerPublishedVersionId)
      .execute()
    await db
      .deleteFrom('exam.exam_versions')
      .where('version_id', '=', unpublishedVersionId)
      .execute()
    await db.deleteFrom('exam.exam_versions').where('version_id', '=', versionId).execute()
    await db.deleteFrom('exam.exams').where('exam_id', '=', unpublishedExamId).execute()
    await db.deleteFrom('exam.exams').where('exam_id', '=', examId).execute()
  }

  beforeEach(async () => {
    await cleanupExamFixtures()

    await db
      .insertInto('exam.exams')
      .values({
        exam_id: examId,
        exam_type: 'OTHER',
        name: 'Test exam',
        created_by: createdBy,
        updated_by: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.exams')
      .values({
        exam_id: unpublishedExamId,
        exam_type: 'OTHER',
        name: 'Unpublished exam',
        created_by: createdBy,
        updated_by: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.exam_versions')
      .values({
        version_id: versionId,
        exam_id: examId,
        version_number: 1,
        status: 'RETIRED',
        default_language: 'en',
        supported_languages: ['en'],
        pass_percent: 75,
        created_by: createdBy,
        updated_by: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.exam_versions')
      .values({
        version_id: newerPublishedVersionId,
        exam_id: examId,
        version_number: 2,
        status: 'PUBLISHED',
        default_language: 'en',
        supported_languages: ['en'],
        pass_percent: 75,
        created_by: createdBy,
        updated_by: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.exam_versions')
      .values({
        version_id: unpublishedVersionId,
        exam_id: unpublishedExamId,
        version_number: 1,
        status: 'DRAFT',
        default_language: 'en',
        supported_languages: ['en'],
        pass_percent: 75,
        created_by: createdBy,
        updated_by: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.attempts')
      .values([
        {
          attempt_id: attemptIds[0],
          version_id: versionId,
          member_id: gradedMemberId,
          language: 'en',
          status: 'GRADED',
          score_percent: 80,
          correct_count: 4,
          total_count: 5,
          passed: true,
          created_at: new Date('2026-01-02T10:00:00.000Z'),
          updated_at: new Date('2026-01-02T10:00:00.000Z'),
        },
        {
          attempt_id: attemptIds[1],
          version_id: versionId,
          member_id: inProgressMemberId,
          language: 'en',
          status: 'IN_PROGRESS',
          created_at: new Date('2026-01-03T10:00:00.000Z'),
          updated_at: new Date('2026-01-03T10:00:00.000Z'),
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

    expect(result.map(exam => exam.examId)).toContain(examId)
    expect(result.map(exam => exam.examId)).not.toContain(unpublishedExamId)
    expect(result.find(exam => exam.examId === examId)?.currentVersion?.versionId).toBe(
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
    await db.deleteFrom('exam.attempts').where('version_id', '=', rndVersionId).execute()
    await db.deleteFrom('exam.questions').where('version_id', '=', rndVersionId).execute()
    await db.deleteFrom('exam.exam_versions').where('version_id', '=', rndVersionId).execute()
    await db.deleteFrom('exam.exams').where('exam_id', '=', rndExamId).execute()
  }

  beforeEach(async () => {
    await cleanup()

    await db
      .insertInto('exam.exams')
      .values({
        exam_id: rndExamId,
        exam_type: 'OTHER',
        name: 'Rnd Exam',
        created_by: createdBy,
        updated_by: createdBy,
      })
      .execute()

    await db
      .insertInto('exam.exam_versions')
      .values({
        version_id: rndVersionId,
        exam_id: rndExamId,
        version_number: 1,
        status: 'PUBLISHED',
        default_language: 'en',
        supported_languages: ['en'],
        pass_percent: 75,
        question_count: 3,
        created_by: createdBy,
        updated_by: createdBy,
      })
      .execute()

    for (let i = 0; i < questionIds.length; i++) {
      await db
        .insertInto('exam.questions')
        .values({ question_id: questionIds[i], version_id: rndVersionId, sort_order: i })
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

    const assignedIds = detail!.questions.map(q => q.questionId)
    expect(assignedIds.every(id => questionIds.includes(id))).toBe(true)
  })

  it('re-fetching the same attempt always returns the same questions in the same order', async () => {
    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const first = await getAttemptVersionDetail(attempt.attemptId)
    const second = await getAttemptVersionDetail(attempt.attemptId)

    expect(first!.questions.map(q => q.questionId)).toEqual(
      second!.questions.map(q => q.questionId),
    )
  })

  it('uses all questions when question_count is null', async () => {
    await db
      .updateTable('exam.exam_versions')
      .set({ question_count: null })
      .where('version_id', '=', rndVersionId)
      .execute()

    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)

    expect(detail!.questions).toHaveLength(questionIds.length)
  })

  it('validateAnswerInputs rejects a question not in the attempt', async () => {
    const attempt = await createAttempt(rndVersionId, rndMemberId, 'en')
    const detail = await getAttemptVersionDetail(attempt.attemptId)
    const assignedIds = new Set(detail!.questions.map(q => q.questionId))
    const notAssigned = questionIds.find(id => !assignedIds.has(id))

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
