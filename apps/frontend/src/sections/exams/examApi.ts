import type {
  Exam,
  ExamVersion,
  ExamWithVersion,
  ExamVersionDetail,
  Attempt,
  AttemptAnswer,
  AttemptListResponse,
} from '@backend/routes/exams/models'
import { sharedApi } from '../../hooks/useApi'

const EXAMS_BASE = 'v1/exams/'

const get = <T>(path: string, params?: Record<string, unknown>): Promise<T> =>
  sharedApi.get<T>(`${EXAMS_BASE}${path}`, { params }).then((r) => r.data)

const post = <T>(path: string, data?: unknown): Promise<T> =>
  sharedApi.post<T>(`${EXAMS_BASE}${path}`, data).then((r) => r.data)

const put = <T>(path: string, data?: unknown): Promise<T> =>
  sharedApi.put<T>(`${EXAMS_BASE}${path}`, data).then((r) => r.data)

const del = (path: string): Promise<void> =>
  sharedApi.delete(`${EXAMS_BASE}${path}`).then(() => undefined)

// ── User-facing ───────────────────────────────────────────────────────────────
export const getExams = (): Promise<ExamWithVersion[]> =>
  get<ExamWithVersion[]>('')

export const getExam = (examId: string): Promise<ExamWithVersion> =>
  get<ExamWithVersion>(examId)

export const startAttempt = (
  examId: string,
  language: string
): Promise<Attempt> => post<Attempt>(`${examId}/attempts`, { language })

export const getMyAttempts = (
  params?: Record<string, string>
): Promise<AttemptListResponse> =>
  get<AttemptListResponse>('my/attempts', params)

export const getAttempt = (attemptId: string): Promise<Attempt> =>
  get<Attempt>(`attempts/${attemptId}`)

export const getAttemptVersion = (
  attemptId: string
): Promise<ExamVersionDetail> =>
  get<ExamVersionDetail>(`attempts/${attemptId}/version`)

export const getAttemptAnswers = (
  attemptId: string
): Promise<AttemptAnswer[]> =>
  get<AttemptAnswer[]>(`attempts/${attemptId}/answers`)

export const saveAnswer = (
  attemptId: string,
  questionId: string,
  choiceId: string | null
): Promise<AttemptAnswer> =>
  put<AttemptAnswer>(`attempts/${attemptId}/answers`, { questionId, choiceId })

export const submitAttempt = (attemptId: string): Promise<Attempt> =>
  post<Attempt>(`attempts/${attemptId}/submit`)

export const abandonAttempt = (
  attemptId: string,
  reason?: string
): Promise<Attempt> =>
  post<Attempt>(`attempts/${attemptId}/abandon`, { reason })

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminGetExams = (): Promise<Exam[]> => get<Exam[]>('admin/exams')

export const adminCreateExam = (data: Partial<Exam>): Promise<Exam> =>
  post<Exam>('admin/exams', data)

export const adminUpdateExam = (
  examId: string,
  data: Partial<Exam>
): Promise<Exam> => put<Exam>(`admin/exams/${examId}`, data)

export const adminDeleteExam = (examId: string): Promise<void> =>
  del(`admin/exams/${examId}`)

export const adminGetVersions = (examId: string): Promise<ExamVersion[]> =>
  get<ExamVersion[]>(`admin/exams/${examId}/versions`)

export const adminCreateVersion = (
  examId: string,
  data: {
    defaultLanguage?: string
    supportedLanguages?: string[]
    passPercent?: number
    cloneFromPublished?: boolean
  }
): Promise<ExamVersion> =>
  post<ExamVersion>(`admin/exams/${examId}/versions`, data)

export const adminGetVersionDetail = (
  versionId: string
): Promise<ExamVersionDetail> =>
  get<ExamVersionDetail>(`admin/versions/${versionId}`)

export const adminUpdateVersion = (
  versionId: string,
  data: {
    defaultLanguage?: string
    supportedLanguages?: string[]
    passPercent?: number
    questionCount?: number | null
  }
): Promise<ExamVersion> => put<ExamVersion>(`admin/versions/${versionId}`, data)

export const adminPublishVersion = (versionId: string): Promise<ExamVersion> =>
  post<ExamVersion>(`admin/versions/${versionId}/publish`)

export const adminDeleteVersion = (versionId: string): Promise<void> =>
  del(`admin/versions/${versionId}`)

export const adminUpsertTranslation = (
  versionId: string,
  language: string,
  title: string,
  description?: string | null
): Promise<void> =>
  put<void>(`admin/versions/${versionId}/translations/${language}`, {
    title,
    description,
  })

export const adminUpsertQuestion = (
  versionId: string,
  data: {
    questionId?: string
    sortOrder?: number
    translations: Record<string, { prompt: string; reasoning?: string | null }>
  }
): Promise<unknown> =>
  put<unknown>(`admin/versions/${versionId}/questions`, data)

export const adminDeleteQuestion = (questionId: string): Promise<void> =>
  del(`admin/questions/${questionId}`)

export const adminUpsertChoice = (
  questionId: string,
  data: {
    choiceId?: string
    isCorrect?: boolean
    sortOrder?: number
    translations: Record<string, { text: string }>
  }
): Promise<unknown> =>
  put<unknown>(`admin/questions/${questionId}/choices`, data)

export const adminDeleteChoice = (choiceId: string): Promise<void> =>
  del(`admin/choices/${choiceId}`)

export const adminGetAttempts = (
  params?: Record<string, string>
): Promise<AttemptListResponse> =>
  get<AttemptListResponse>('admin/attempts', params)
