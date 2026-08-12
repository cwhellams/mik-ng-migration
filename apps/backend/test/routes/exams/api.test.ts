import { jest, describe, it, expect, beforeEach } from '@jest/globals'

import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'

process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret'
process.env.ACCESS_TOKEN_EXPIRATION ??= '15m'

// ─────────────────────────────────────────────────────────────────────────────
// Mock function declarations (must be before unstable_mockModule)
// ─────────────────────────────────────────────────────────────────────────────

const mockGetExams = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockGetExamById = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetExamWithPublishedVersion = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetExamsWithPublishedVersions = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockInsertExam = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockUpdateExam = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDeleteExam = jest.fn<(...args: any[]) => Promise<void>>()
const mockGetVersionsByExamId = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockGetVersionById = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetVersionByQuestionId = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetVersionByChoiceId = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetVersionDetail = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetAttemptVersionDetail = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockCreateVersion = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockUpdateVersion = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockPublishVersion = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDeleteVersion = jest.fn<(...args: any[]) => Promise<void>>()
const mockUpsertVersionTranslation = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockUpsertQuestion = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDeleteQuestion = jest.fn<(...args: any[]) => Promise<void>>()
const mockUpsertChoice = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDeleteChoice = jest.fn<(...args: any[]) => Promise<void>>()
const mockImportExam = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockCreateAttempt = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetAttemptById = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetAttempts = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockValidateAnswerInputs =
  jest.fn<(...args: any[]) => Promise<{ valid: boolean; detail?: string }>>()
const mockUpsertAttemptAnswer = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockGetAttemptAnswers = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockSubmitAttempt = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockAbandonAttempt = jest.fn<(...args: any[]) => Promise<unknown>>()

jest.unstable_mockModule('../../../src/db/exam-queries.ts', () => ({
  getExams: mockGetExams,
  getExamById: mockGetExamById,
  getExamWithPublishedVersion: mockGetExamWithPublishedVersion,
  getExamsWithPublishedVersions: mockGetExamsWithPublishedVersions,
  insertExam: mockInsertExam,
  updateExam: mockUpdateExam,
  deleteExam: mockDeleteExam,
  getVersionsByExamId: mockGetVersionsByExamId,
  getVersionById: mockGetVersionById,
  getVersionByQuestionId: mockGetVersionByQuestionId,
  getVersionByChoiceId: mockGetVersionByChoiceId,
  getVersionDetail: mockGetVersionDetail,
  getAttemptVersionDetail: mockGetAttemptVersionDetail,
  createVersion: mockCreateVersion,
  updateVersion: mockUpdateVersion,
  publishVersion: mockPublishVersion,
  deleteVersion: mockDeleteVersion,
  upsertVersionTranslation: mockUpsertVersionTranslation,
  upsertQuestion: mockUpsertQuestion,
  deleteQuestion: mockDeleteQuestion,
  upsertChoice: mockUpsertChoice,
  deleteChoice: mockDeleteChoice,
  importExam: mockImportExam,
  createAttempt: mockCreateAttempt,
  getAttemptById: mockGetAttemptById,
  getAttempts: mockGetAttempts,
  validateAnswerInputs: mockValidateAnswerInputs,
  upsertAttemptAnswer: mockUpsertAttemptAnswer,
  getAttemptAnswers: mockGetAttemptAnswers,
  submitAttempt: mockSubmitAttempt,
  abandonAttempt: mockAbandonAttempt,
}))

const { router } = await import('../../../src/routes/exams/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { generateAccessToken } = await import('../../../src/routes/auth/token.ts')
const { MIKPermissions } = await import('@mik/contracts/members')

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/exams', router)
app.use(problemErrorHandler)

const examAdminToken = generateAccessToken({
  memberId: 'ADMIN001',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: ['ADMIN'],
  permissions: [MIKPermissions.EXAM_ADMIN],
  canMakeReservations: false,
})

const examUserToken = generateAccessToken({
  memberId: 'MEMBER001',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: [],
  permissions: [MIKPermissions.EXAM_USER],
  canMakeReservations: false,
})

const plainMemberToken = generateAccessToken({
  memberId: 'MEMBER002',
  lastName: 'Korhonen',
  email: 'member2@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /exams — list published exams
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /exams', () => {
  beforeEach(() => {
    mockGetExamsWithPublishedVersions.mockResolvedValue([])
  })

  it('returns 200 for exam admin', async () => {
    const res = await request(app).get('/exams').set('Cookie', `accessToken=${examAdminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 200 for exam user', async () => {
    const res = await request(app).get('/exams').set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(200)
  })

  it('returns 403 for plain member without exam permission', async () => {
    const res = await request(app).get('/exams').set('Cookie', `accessToken=${plainMemberToken}`)
    expect(res.status).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/exams')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /exams/my/attempts
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /exams/my/attempts', () => {
  beforeEach(() => {
    mockGetAttempts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    })
  })

  it('returns 200 for exam user', async () => {
    const res = await request(app)
      .get('/exams/my/attempts')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(200)
  })

  it('returns 403 for plain member', async () => {
    const res = await request(app)
      .get('/exams/my/attempts')
      .set('Cookie', `accessToken=${plainMemberToken}`)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /exams/:examId/attempts — start an attempt
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /exams/:examId/attempts', () => {
  beforeEach(() => {
    mockGetExamWithPublishedVersion.mockResolvedValue({
      examId: 'EXAM00001',
      name: 'Test',
      examType: 'OTHER',
      currentVersion: { versionId: 'VER00001', status: 'PUBLISHED' },
    })
    mockCreateAttempt.mockResolvedValue({
      attemptId: 'ATT00001',
      versionId: 'VER00001',
      memberId: 'MEMBER001',
      language: 'en',
      status: 'IN_PROGRESS',
    })
  })

  it('returns 201 for exam user starting an attempt', async () => {
    const res = await request(app)
      .post('/exams/EXAM00001/attempts')
      .set('Cookie', `accessToken=${examUserToken}`)
      .send({ language: 'en' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ versionId: 'VER00001', memberId: 'MEMBER001' })
  })

  it('returns 403 for plain member', async () => {
    const res = await request(app)
      .post('/exams/EXAM00001/attempts')
      .set('Cookie', `accessToken=${plainMemberToken}`)
      .send({ language: 'en' })
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /exams/attempts/:attemptId
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /exams/attempts/:attemptId', () => {
  beforeEach(() => {
    mockGetAttemptById.mockResolvedValue({
      attemptId: 'ATT00001',
      versionId: 'VER00001',
      memberId: 'MEMBER001',
      language: 'en',
      status: 'IN_PROGRESS',
    })
  })

  it('returns 200 for the owning member', async () => {
    const res = await request(app)
      .get('/exams/attempts/ATT00001')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ attemptId: 'ATT00001' })
  })

  it('returns 200 for exam admin', async () => {
    const res = await request(app)
      .get('/exams/attempts/ATT00001')
      .set('Cookie', `accessToken=${examAdminToken}`)
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /exams/attempts/:attemptId/submit
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /exams/attempts/:attemptId/submit', () => {
  beforeEach(() => {
    mockGetAttemptById.mockResolvedValue({
      attemptId: 'ATT00001',
      versionId: 'VER00001',
      memberId: 'MEMBER001',
      language: 'en',
      status: 'IN_PROGRESS',
    })
    mockSubmitAttempt.mockResolvedValue({
      attemptId: 'ATT00001',
      status: 'GRADED',
      scorePercent: 80,
      correctCount: 8,
      totalCount: 10,
      passed: true,
    })
  })

  it('returns 200 and graded attempt for exam user', async () => {
    const res = await request(app)
      .post('/exams/attempts/ATT00001/submit')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'GRADED', passed: true })
  })

  it('returns 403 for plain member', async () => {
    const res = await request(app)
      .post('/exams/attempts/ATT00001/submit')
      .set('Cookie', `accessToken=${plainMemberToken}`)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admin: GET /exams/admin/exams
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /exams/admin/exams', () => {
  beforeEach(() => {
    mockGetExams.mockResolvedValue([])
  })

  it('returns 200 for exam admin', async () => {
    const res = await request(app)
      .get('/exams/admin/exams')
      .set('Cookie', `accessToken=${examAdminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 403 for exam user', async () => {
    const res = await request(app)
      .get('/exams/admin/exams')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admin: POST /exams/admin/exams — create exam
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /exams/admin/exams', () => {
  beforeEach(() => {
    mockInsertExam.mockResolvedValue({ examId: 'EXAM00001', name: 'PPL Theory', examType: 'AFM' })
  })

  const validExamBody = { name: 'PPL Theory', examType: 'AFM' }

  it('returns 201 for exam admin', async () => {
    const res = await request(app)
      .post('/exams/admin/exams')
      .set('Cookie', `accessToken=${examAdminToken}`)
      .send(validExamBody)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'PPL Theory' })
  })

  it('returns 403 for exam user', async () => {
    const res = await request(app)
      .post('/exams/admin/exams')
      .set('Cookie', `accessToken=${examUserToken}`)
      .send(validExamBody)
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid exam type', async () => {
    const res = await request(app)
      .post('/exams/admin/exams')
      .set('Cookie', `accessToken=${examAdminToken}`)
      .send({ examType: 'INVALID_TYPE' })
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admin: POST /exams/admin/exams/:examId/versions — create version
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /exams/admin/exams/:examId/versions', () => {
  beforeEach(() => {
    mockCreateVersion.mockResolvedValue({
      versionId: 'VER00001',
      examId: 'EXAM00001',
      versionNumber: 1,
      status: 'DRAFT',
      defaultLanguage: 'en',
      supportedLanguages: ['en', 'fi'],
      passPercent: 75,
    })
  })

  const validVersionBody = {
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'fi'],
    passPercent: 75,
  }

  it('returns 201 for exam admin', async () => {
    const res = await request(app)
      .post('/exams/admin/exams/EXAM00001/versions')
      .set('Cookie', `accessToken=${examAdminToken}`)
      .send(validVersionBody)
    expect(res.status).toBe(201)
  })

  it('returns 403 for exam user', async () => {
    const res = await request(app)
      .post('/exams/admin/exams/EXAM00001/versions')
      .set('Cookie', `accessToken=${examUserToken}`)
      .send(validVersionBody)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admin: POST /exams/admin/versions/:versionId/publish
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /exams/admin/versions/:versionId/publish', () => {
  beforeEach(() => {
    mockPublishVersion.mockResolvedValue({ versionId: 'VER00001', status: 'PUBLISHED' })
  })

  it('returns 200 for exam admin', async () => {
    const res = await request(app)
      .post('/exams/admin/versions/VER00001/publish')
      .set('Cookie', `accessToken=${examAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'PUBLISHED' })
  })

  it('returns 403 for exam user', async () => {
    const res = await request(app)
      .post('/exams/admin/versions/VER00001/publish')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admin: GET /exams/admin/attempts
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /exams/admin/attempts', () => {
  beforeEach(() => {
    mockGetAttempts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    })
  })

  it('returns 200 for exam admin', async () => {
    const res = await request(app)
      .get('/exams/admin/attempts')
      .set('Cookie', `accessToken=${examAdminToken}`)
    expect(res.status).toBe(200)
  })

  it('returns 403 for exam user', async () => {
    const res = await request(app)
      .get('/exams/admin/attempts')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /exams/attempts/:attemptId/version — uses getAttemptVersionDetail
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /exams/attempts/:attemptId/version', () => {
  beforeEach(() => {
    mockGetAttemptById.mockResolvedValue({
      attemptId: 'ATT00001',
      versionId: 'VER00001',
      memberId: 'MEMBER001',
      language: 'en',
      status: 'IN_PROGRESS',
    })
    mockGetAttemptVersionDetail.mockResolvedValue({
      versionId: 'VER00001',
      examId: 'EXAM00001',
      versionNumber: 1,
      status: 'PUBLISHED',
      defaultLanguage: 'en',
      supportedLanguages: ['en'],
      passPercent: 75,
      questionCount: 3,
      translations: {},
      questions: [
        { questionId: 'Q001', versionId: 'VER00001', sortOrder: 0, translations: {}, choices: [] },
        { questionId: 'Q002', versionId: 'VER00001', sortOrder: 1, translations: {}, choices: [] },
        { questionId: 'Q003', versionId: 'VER00001', sortOrder: 2, translations: {}, choices: [] },
      ],
    })
  })

  it('returns only the attempt question subset for the owning member', async () => {
    const res = await request(app)
      .get('/exams/attempts/ATT00001/version')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(200)
    expect(res.body.questions).toHaveLength(3)
    expect(mockGetAttemptVersionDetail).toHaveBeenCalledWith('ATT00001')
  })

  it('returns 403 when member does not own the attempt', async () => {
    mockGetAttemptById.mockResolvedValue({
      attemptId: 'ATT00001',
      versionId: 'VER00001',
      memberId: 'OTHER001',
      language: 'en',
      status: 'IN_PROGRESS',
    })
    const res = await request(app)
      .get('/exams/attempts/ATT00001/version')
      .set('Cookie', `accessToken=${examUserToken}`)
    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /exams/attempts/:attemptId/answers — answer validation scoped to attempt
// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /exams/attempts/:attemptId/answers — question not in attempt', () => {
  beforeEach(() => {
    mockGetAttemptById.mockResolvedValue({
      attemptId: 'ATT00001',
      versionId: 'VER00001',
      memberId: 'MEMBER001',
      language: 'en',
      status: 'IN_PROGRESS',
    })
  })

  it('returns 400 when question is not part of the attempt', async () => {
    mockValidateAnswerInputs.mockResolvedValue({
      valid: false,
      detail: 'Question not part of this attempt',
    })
    const res = await request(app)
      .put('/exams/attempts/ATT00001/answers')
      .set('Cookie', `accessToken=${examUserToken}`)
      .send({ questionId: 'QOTHER01', choiceId: null })
    expect(res.status).toBe(400)
    expect(mockValidateAnswerInputs).toHaveBeenCalledWith('ATT00001', 'QOTHER01', null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admin: POST /exams/admin/exams/import
// ─────────────────────────────────────────────────────────────────────────────

const validImportBody = {
  name: '010 Air Law',
  examType: 'OTHER',
  version: {
    defaultLanguage: 'fi',
    supportedLanguages: ['fi', 'en'],
    passPercent: 75,
    translations: {
      fi: { title: '010 Ilmailulainsäädäntö', description: null },
      en: { title: '010 Air Law', description: null },
    },
    questions: [
      {
        sortOrder: 1,
        translations: {
          fi: { prompt: 'Kysymys?', reasoning: null },
          en: { prompt: 'Question?', reasoning: null },
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
    ],
  },
}

describe('POST /exams/admin/exams/import', () => {
  beforeEach(() => {
    mockImportExam.mockResolvedValue({ examId: 'EXAM00001', versionId: 'VER00001' })
  })

  it('returns 201 with examId and versionId for exam admin', async () => {
    const res = await request(app)
      .post('/exams/admin/exams/import')
      .set('Cookie', `accessToken=${examAdminToken}`)
      .send(validImportBody)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ examId: 'EXAM00001', versionId: 'VER00001' })
    expect(mockImportExam).toHaveBeenCalledTimes(1)
  })

  it('returns 403 for exam user without admin permission', async () => {
    const res = await request(app)
      .post('/exams/admin/exams/import')
      .set('Cookie', `accessToken=${examUserToken}`)
      .send(validImportBody)
    expect(res.status).toBe(403)
  })

  it('returns 403 for plain member', async () => {
    const res = await request(app)
      .post('/exams/admin/exams/import')
      .set('Cookie', `accessToken=${plainMemberToken}`)
      .send(validImportBody)
    expect(res.status).toBe(403)
  })

  it('returns 400 when a question has zero correct choices', async () => {
    const invalidBody = {
      ...validImportBody,
      version: {
        ...validImportBody.version,
        questions: [
          {
            ...validImportBody.version.questions[0],
            choices: validImportBody.version.questions[0].choices.map((c) => ({
              ...c,
              isCorrect: false,
            })),
          },
        ],
      },
    }
    const res = await request(app)
      .post('/exams/admin/exams/import')
      .set('Cookie', `accessToken=${examAdminToken}`)
      .send(invalidBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 when a question has multiple correct choices', async () => {
    const invalidBody = {
      ...validImportBody,
      version: {
        ...validImportBody.version,
        questions: [
          {
            ...validImportBody.version.questions[0],
            choices: validImportBody.version.questions[0].choices.map((c) => ({
              ...c,
              isCorrect: true,
            })),
          },
        ],
      },
    }
    const res = await request(app)
      .post('/exams/admin/exams/import')
      .set('Cookie', `accessToken=${examAdminToken}`)
      .send(invalidBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/exams/admin/exams/import')
      .set('Cookie', `accessToken=${examAdminToken}`)
      .send({ name: 'Missing version' })
    expect(res.status).toBe(400)
  })
})
