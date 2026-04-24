import 'dotenv/config'

import { db } from '../../src/db/connection.ts'
import {
  getAttempts,
  getExamWithPublishedVersion,
  getExamsWithPublishedVersions,
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
