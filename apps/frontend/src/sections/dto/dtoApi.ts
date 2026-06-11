import { sharedApi } from '../../hooks/useApi'
import type {
  TrainingProgram,
  Syllabus,
  SyllabusWithFlights,
  SyllabusFlight,
  MemberSyllabus,
  SyllabusFlightAttempt,
  FlightItemOutcome,
  HilEntry,
  StudentProgress,
  VerifyAttempt,
} from '@backend/routes/dto/models'

const BASE = 'v1/dto'

const get = <T>(path: string, params?: Record<string, unknown>): Promise<T> =>
  sharedApi.get<T>(`${BASE}/${path}`, { params }).then((r) => r.data)

const getRaw = (path: string) => sharedApi.get(`${BASE}/${path}`, { responseType: 'blob' })

const post = <T>(path: string, data?: unknown): Promise<T> =>
  sharedApi.post<T>(`${BASE}/${path}`, data).then((r) => r.data)

const patch = <T>(path: string, data?: unknown): Promise<T> =>
  sharedApi.patch<T>(`${BASE}/${path}`, data).then((r) => r.data)

const put = <T>(path: string, data?: unknown): Promise<T> =>
  sharedApi.put<T>(`${BASE}/${path}`, data).then((r) => r.data)

// ── Training Programs ─────────────────────────────────────────────────────────
export const getPrograms = (): Promise<TrainingProgram[]> => get<TrainingProgram[]>('programs')

export const getProgram = (programId: string): Promise<TrainingProgram> =>
  get<TrainingProgram>(`programs/${programId}`)

export const createProgram = (data: {
  name: string
  description?: string
}): Promise<TrainingProgram> => post<TrainingProgram>('programs', data)

export const updateProgram = (
  programId: string,
  data: { name: string; description?: string },
): Promise<TrainingProgram> => put<TrainingProgram>(`programs/${programId}`, data)

// ── Syllabi ───────────────────────────────────────────────────────────────────
export const getSyllabi = (programId: string): Promise<Syllabus[]> =>
  get<Syllabus[]>(`programs/${programId}/syllabi`)

export const getLatestPublished = (programId: string): Promise<Syllabus> =>
  get<Syllabus>(`programs/${programId}/syllabi/latest-published`)

export const getSyllabus = (syllabusId: string): Promise<SyllabusWithFlights> =>
  get<SyllabusWithFlights>(`syllabi/${syllabusId}`)

export const createSyllabus = (
  programId: string,
  data: { description?: string },
): Promise<Syllabus> => post<Syllabus>(`programs/${programId}/syllabi`, data)

export const updateSyllabus = (
  syllabusId: string,
  data: { description?: string; minBlockTimeMins?: number | null },
): Promise<Syllabus> => put<Syllabus>(`syllabi/${syllabusId}`, data)

export const publishSyllabus = (syllabusId: string): Promise<Syllabus> =>
  post<Syllabus>(`syllabi/${syllabusId}/publish`)

export const exportSyllabus = async (syllabusId: string, version: string): Promise<void> => {
  const response = await getRaw(`syllabi/${syllabusId}/export`)
  const blob = new Blob([response.data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `syllabus-${version}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export const copySyllabusAsDraft = (syllabusId: string): Promise<SyllabusWithFlights> =>
  post<SyllabusWithFlights>(`syllabi/${syllabusId}/copy`)

export const updateSyllabusFlights = (
  syllabusId: string,
  flights: SyllabusFlight[],
): Promise<SyllabusWithFlights> =>
  put<SyllabusWithFlights>(`syllabi/${syllabusId}/flights`, { flights })

export const getSyllabusFlights = (syllabusId: string): Promise<SyllabusFlight[]> =>
  get<SyllabusFlight[]>(`syllabi/${syllabusId}/flights`)

// ── Import ────────────────────────────────────────────────────────────────────
export const importSyllabus = (programId: string, file: File): Promise<SyllabusWithFlights> => {
  const form = new FormData()
  form.append('file', file)
  return sharedApi
    .post<SyllabusWithFlights>(`/api/${BASE}/programs/${programId}/syllabi/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

// ── Member Syllabus Assignment ────────────────────────────────────────────────
export type MemberSyllabusDetail = MemberSyllabus & {
  syllabusDetail?: SyllabusWithFlights
}

export const getMyActiveSyllabus = (): Promise<MemberSyllabusDetail | null> =>
  get<MemberSyllabusDetail | null>('me/syllabus')

export const getMemberSyllabus = (memberId: string): Promise<MemberSyllabusDetail | null> =>
  get<MemberSyllabusDetail | null>(`members/${memberId}/syllabus`)

export const assignSyllabus = (memberId: string, programId: string): Promise<MemberSyllabus> =>
  post<MemberSyllabus>(`members/${memberId}/syllabus`, { programId })

// ── Flight Attempts ───────────────────────────────────────────────────────────
export const getFlightAttempt = (flightLogId: string): Promise<SyllabusFlightAttempt | null> =>
  get<SyllabusFlightAttempt | null>(`flight-logs/${flightLogId}/attempt`)

export const createFlightAttempt = (
  flightLogId: string,
  data: { syllabusFlightId: string; memberSyllabusId: string },
): Promise<SyllabusFlightAttempt> =>
  post<SyllabusFlightAttempt>(`flight-logs/${flightLogId}/attempt`, data)

export const updateFlightAttempt = (
  flightLogId: string,
  syllabusFlightId: string,
): Promise<SyllabusFlightAttempt> =>
  patch<SyllabusFlightAttempt>(`flight-logs/${flightLogId}/attempt`, {
    syllabusFlightId,
  })

export const getAttempt = (
  attemptId: string,
): Promise<SyllabusFlightAttempt & { itemOutcomes: FlightItemOutcome[] }> =>
  get(`attempts/${attemptId}`)

export const verifyAttempt = (
  attemptId: string,
  data: VerifyAttempt,
): Promise<SyllabusFlightAttempt> =>
  post<SyllabusFlightAttempt>(`attempts/${attemptId}/verify`, data)

export const getMemberSyllabusAttempts = (
  memberSyllabusId: string,
): Promise<SyllabusFlightAttempt[]> =>
  get<SyllabusFlightAttempt[]>(`member-syllabus/${memberSyllabusId}/attempts`)

// ── Instructor ────────────────────────────────────────────────────────────────
export type PendingVerificationItem = SyllabusFlightAttempt & {
  memberName: string
  syllabusFlightCode: string
  syllabusFlightName: string
}

export const getPendingVerifications = (): Promise<PendingVerificationItem[]> =>
  get<PendingVerificationItem[]>('instructor/pending')

export const getPendingCount = (): Promise<{ count: number }> =>
  get<{ count: number }>('instructor/pending/count')

// ── HIL ───────────────────────────────────────────────────────────────────────
export const getMemberHil = (memberId: string): Promise<HilEntry[]> =>
  get<HilEntry[]>(`members/${memberId}/hil`)

// ── Progress ──────────────────────────────────────────────────────────────────
export const getProgress = (): Promise<StudentProgress[]> => get<StudentProgress[]>('progress')

// ── Student Progress Detail ────────────────────────────────────────────────────
export type AttemptWithFlightLogData = SyllabusFlightAttempt & {
  flightDate: string
  offBlockTimeUtc: string
  onBlockTimeUtc: string
  takeoffTimeUtc: string
  landingTimeUtc: string
  blockTime: string
  flightTime: string
  departureAirport: string
  arrivalAirport: string
  numberOfLandings: number
}

export type AttemptWithOutcomes = AttemptWithFlightLogData & {
  itemOutcomes: FlightItemOutcome[]
}

export type MemberSyllabusDetailWithName = MemberSyllabusDetail & {
  memberName: string
}

export type StudentProgressDetail = {
  memberSyllabus: MemberSyllabusDetailWithName
  attemptsWithOutcomes: AttemptWithOutcomes[]
  hilItems: HilEntry[]
}

export const getStudentProgressDetail = (
  memberSyllabusId: string,
): Promise<StudentProgressDetail> =>
  get<StudentProgressDetail>(`member-syllabus/${memberSyllabusId}/detail`)
