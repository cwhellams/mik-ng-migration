import { db } from './connection.ts'
import type {
  TrainingProgram,
  TrainingProgramUpsert,
  Syllabus,
  SyllabusWithFlights,
  SyllabusFlight,
  SyllabusFlightItem,
  MemberSyllabus,
  SyllabusFlightAttempt,
  FlightItemOutcome,
  HilEntry,
  StudentProgress,
  SyllabusImport,
  VerifyAttempt,
} from '../routes/dto/models.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function toIso(d: Date | string | null | undefined): string {
  if (d == null) throw new Error('toIso: unexpected null/undefined timestamp')
  return d instanceof Date ? d.toISOString() : d
}

function toIsoNullable(d: Date | string | null | undefined): string | null {
  if (d == null) return null
  return d instanceof Date ? d.toISOString() : d
}

function mapProgram(r: {
  program_id: string
  name: string
  description: string | null
  created_at: Date | string
  created_by: string
  updated_at: Date | string
  updated_by: string
}): TrainingProgram {
  return {
    programId: r.program_id,
    name: r.name,
    description: r.description,
    createdAt: toIso(r.created_at),
    createdBy: r.created_by,
    updatedAt: toIso(r.updated_at),
    updatedBy: r.updated_by,
  }
}

function mapSyllabus(r: {
  syllabus_id: string
  program_id: string
  major_version: number
  minor_version: number
  patch_version: number
  version: string | null
  description: string | null
  min_block_time_mins: number | null
  status: string
  published_at: Date | string | null
  created_at: Date | string
  created_by: string
  updated_at: Date | string
  updated_by: string
}): Syllabus {
  return {
    syllabusId: r.syllabus_id,
    programId: r.program_id,
    majorVersion: r.major_version,
    minorVersion: r.minor_version,
    patchVersion: r.patch_version,
    version: r.version ?? `${r.major_version}.${r.minor_version}.${r.patch_version}`,
    description: r.description,
    minBlockTimeMins: r.min_block_time_mins,
    status: r.status as Syllabus['status'],
    publishedAt: toIsoNullable(r.published_at),
    createdAt: toIso(r.created_at),
    createdBy: r.created_by,
    updatedAt: toIso(r.updated_at),
    updatedBy: r.updated_by,
  }
}

function mapFlight(r: {
  flight_id: string
  syllabus_id: string
  sort_order: number
  code: string
  name: string
  description: string | null
  tags: string[]
  is_interim_checkpoint: boolean
  recommended_block_time_mins: number | null
  created_at: Date | string
  updated_at: Date | string
}): SyllabusFlight {
  return {
    flightId: r.flight_id,
    syllabusId: r.syllabus_id,
    sortOrder: r.sort_order,
    code: r.code,
    name: r.name,
    description: r.description,
    tags: r.tags,
    isInterimCheckpoint: r.is_interim_checkpoint,
    recommendedBlockTimeMins: r.recommended_block_time_mins,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  }
}

function mapItem(r: {
  item_id: string
  syllabus_flight_id: string
  sort_order: number
  name: string
  description: string | null
  mandatory: boolean
}): SyllabusFlightItem {
  return {
    itemId: r.item_id,
    syllabusFlightId: r.syllabus_flight_id,
    sortOrder: r.sort_order,
    name: r.name,
    description: r.description,
    mandatory: r.mandatory,
  }
}

function mapAttempt(r: {
  attempt_id: string
  flight_log_id: string
  syllabus_flight_id: string
  member_syllabus_id: string
  instructor_member_id: string
  instructor_comments: string | null
  verification_result: string | null
  verified_at: Date | string | null
  verified_by: string | null
  requires_reverification: boolean
  verifier_first_name?: string | null
  verifier_last_name?: string | null
  created_at: Date | string
  updated_at: Date | string
}): SyllabusFlightAttempt {
  const verifierName =
    r.verifier_first_name != null
      ? `${r.verifier_first_name} ${r.verifier_last_name ?? ''}`.trim()
      : null
  return {
    attemptId: r.attempt_id,
    flightLogId: r.flight_log_id,
    syllabusFlightId: r.syllabus_flight_id,
    memberSyllabusId: r.member_syllabus_id,
    instructorMemberId: r.instructor_member_id,
    instructorComments: r.instructor_comments,
    verificationResult: r.verification_result as SyllabusFlightAttempt['verificationResult'],
    verifiedAt: toIsoNullable(r.verified_at),
    verifiedBy: r.verified_by,
    verifierName,
    requiresReverification: r.requires_reverification,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Training Programs
// ─────────────────────────────────────────────────────────────────────────────
export async function getTrainingPrograms(): Promise<TrainingProgram[]> {
  const rows = await db.selectFrom('dto.training_program').selectAll().orderBy('name').execute()
  return rows.map(mapProgram)
}

export async function getTrainingProgramById(
  programId: string,
): Promise<TrainingProgram | undefined> {
  const r = await db
    .selectFrom('dto.training_program')
    .selectAll()
    .where('program_id', '=', programId)
    .executeTakeFirst()
  return r ? mapProgram(r) : undefined
}

export async function insertTrainingProgram(
  data: TrainingProgramUpsert,
  userId: string,
): Promise<TrainingProgram> {
  const r = await db
    .insertInto('dto.training_program')
    .values({
      name: data.name,
      description: data.description ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapProgram(r)
}

export async function updateTrainingProgram(
  programId: string,
  data: TrainingProgramUpsert,
  userId: string,
): Promise<TrainingProgram | undefined> {
  const r = await db
    .updateTable('dto.training_program')
    .set({
      name: data.name,
      description: data.description ?? null,
      updated_by: userId,
      updated_at: new Date(),
    })
    .where('program_id', '=', programId)
    .returningAll()
    .executeTakeFirst()
  return r ? mapProgram(r) : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Syllabi
// ─────────────────────────────────────────────────────────────────────────────
export async function getSyllabiByProgram(programId: string): Promise<Syllabus[]> {
  const rows = await db
    .selectFrom('dto.syllabus')
    .selectAll()
    .where('program_id', '=', programId)
    .orderBy('major_version', 'desc')
    .orderBy('minor_version', 'desc')
    .orderBy('patch_version', 'desc')
    .execute()
  return rows.map(mapSyllabus)
}

export async function getSyllabusById(syllabusId: string): Promise<Syllabus | undefined> {
  const r = await db
    .selectFrom('dto.syllabus')
    .selectAll()
    .where('syllabus_id', '=', syllabusId)
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

export async function getSyllabusWithFlights(
  syllabusId: string,
): Promise<SyllabusWithFlights | undefined> {
  const syllabus = await getSyllabusById(syllabusId)
  if (!syllabus) return undefined

  const flightRows = await db
    .selectFrom('dto.syllabus_flights')
    .selectAll()
    .where('syllabus_id', '=', syllabusId)
    .orderBy('sort_order')
    .execute()

  if (flightRows.length === 0) {
    return { ...syllabus, flights: [] }
  }

  const flightIds = flightRows.map(f => f.flight_id)
  const itemRows = await db
    .selectFrom('dto.syllabus_flight_items')
    .selectAll()
    .where('syllabus_flight_id', 'in', flightIds)
    .orderBy('syllabus_flight_id')
    .orderBy('sort_order')
    .execute()

  const itemsByFlight = new Map<string, SyllabusFlightItem[]>()
  for (const item of itemRows) {
    const list = itemsByFlight.get(item.syllabus_flight_id) ?? []
    list.push(mapItem(item))
    itemsByFlight.set(item.syllabus_flight_id, list)
  }

  const flights: SyllabusFlight[] = flightRows.map(f => ({
    ...mapFlight(f),
    items: itemsByFlight.get(f.flight_id) ?? [],
  }))

  return { ...syllabus, flights }
}

export async function getLatestPublishedSyllabus(programId: string): Promise<Syllabus | undefined> {
  const r = await db
    .selectFrom('dto.syllabus')
    .selectAll()
    .where('program_id', '=', programId)
    .where('status', '=', 'PUBLISHED')
    .orderBy('major_version', 'desc')
    .orderBy('minor_version', 'desc')
    .orderBy('patch_version', 'desc')
    .limit(1)
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

/** Compute next minor version for a program. */
async function nextMinorVersion(
  programId: string,
): Promise<{ majorVersion: number; minorVersion: number; patchVersion: number }> {
  const rows = await db
    .selectFrom('dto.syllabus')
    .select(['major_version', 'minor_version', 'patch_version'])
    .where('program_id', '=', programId)
    .orderBy('major_version', 'desc')
    .orderBy('minor_version', 'desc')
    .orderBy('patch_version', 'desc')
    .limit(1)
    .execute()

  if (rows.length === 0) {
    return { majorVersion: 1, minorVersion: 0, patchVersion: 0 }
  }
  const latest = rows[0]
  return {
    majorVersion: latest.major_version,
    minorVersion: latest.minor_version + 1,
    patchVersion: 0,
  }
}

export async function insertSyllabus(
  programId: string,
  data: { description?: string | null; minBlockTimeMins?: number | null },
  userId: string,
): Promise<Syllabus> {
  const version = await nextMinorVersion(programId)
  const r = await db
    .insertInto('dto.syllabus')
    .values({
      program_id: programId,
      major_version: version.majorVersion,
      minor_version: version.minorVersion,
      patch_version: version.patchVersion,
      description: data.description ?? null,
      min_block_time_mins: data.minBlockTimeMins ?? null,
      status: 'DRAFT',
      created_by: userId,
      updated_by: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapSyllabus(r)
}

export async function updateSyllabus(
  syllabusId: string,
  data: { description?: string | null; minBlockTimeMins?: number | null },
  userId: string,
): Promise<Syllabus | undefined> {
  let q = db.updateTable('dto.syllabus').set({
    description: data.description ?? null,
    updated_by: userId,
    updated_at: new Date(),
  })
  if ('minBlockTimeMins' in data) {
    q = q.set({ min_block_time_mins: data.minBlockTimeMins ?? null })
  }
  const r = await q
    .where('syllabus_id', '=', syllabusId)
    .where('status', 'in', ['DRAFT', 'WAITING_FOR_APPROVAL'])
    .returningAll()
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

export async function publishSyllabus(
  syllabusId: string,
  userId: string,
): Promise<Syllabus | undefined> {
  const r = await db
    .updateTable('dto.syllabus')
    .set({
      status: 'PUBLISHED',
      published_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    })
    .where('syllabus_id', '=', syllabusId)
    .where('status', 'in', ['DRAFT', 'WAITING_FOR_APPROVAL'])
    .returningAll()
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Syllabus Flights
// ─────────────────────────────────────────────────────────────────────────────
export async function getFlightsBySyllabus(syllabusId: string): Promise<SyllabusFlight[]> {
  const rows = await db
    .selectFrom('dto.syllabus_flights')
    .selectAll()
    .where('syllabus_id', '=', syllabusId)
    .orderBy('sort_order')
    .execute()
  return rows.map(mapFlight)
}

export async function getSyllabusFlightById(flightId: string): Promise<SyllabusFlight | undefined> {
  const r = await db
    .selectFrom('dto.syllabus_flights')
    .selectAll()
    .where('flight_id', '=', flightId)
    .executeTakeFirst()
  return r ? mapFlight(r) : undefined
}

export async function getSyllabusFlightWithItems(
  flightId: string,
): Promise<SyllabusFlight | undefined> {
  const r = await db
    .selectFrom('dto.syllabus_flights')
    .selectAll()
    .where('flight_id', '=', flightId)
    .executeTakeFirst()
  if (!r) return undefined

  const itemRows = await db
    .selectFrom('dto.syllabus_flight_items')
    .selectAll()
    .where('syllabus_flight_id', '=', flightId)
    .orderBy('sort_order')
    .execute()

  return { ...mapFlight(r), items: itemRows.map(mapItem) }
}

export async function upsertSyllabusFlights(
  syllabusId: string,
  flights: Array<{
    code: string
    name: string
    description?: string | null
    tags?: string[]
    isInterimCheckpoint?: boolean
    recommendedBlockTimeMins?: number | null
    items?: Array<{ name: string; description?: string | null; mandatory: boolean }>
  }>,
): Promise<void> {
  // Delete all existing flights for this syllabus (cascades to items)
  await db.deleteFrom('dto.syllabus_flights').where('syllabus_id', '=', syllabusId).execute()

  for (let i = 0; i < flights.length; i++) {
    const f = flights[i]
    const flightRow = await db
      .insertInto('dto.syllabus_flights')
      .values({
        syllabus_id: syllabusId,
        sort_order: i + 1,
        code: f.code,
        name: f.name,
        description: f.description ?? null,
        tags: f.tags ?? [],
        is_interim_checkpoint: f.isInterimCheckpoint ?? false,
        recommended_block_time_mins: f.recommendedBlockTimeMins ?? null,
      })
      .returning('flight_id')
      .executeTakeFirstOrThrow()

    if (f.items && f.items.length > 0) {
      await db
        .insertInto('dto.syllabus_flight_items')
        .values(
          f.items.map((item, j) => ({
            syllabus_flight_id: flightRow.flight_id,
            sort_order: j + 1,
            name: item.name,
            description: item.description ?? null,
            mandatory: item.mandatory,
          })),
        )
        .execute()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Import
// ─────────────────────────────────────────────────────────────────────────────
export async function importSyllabusFromJson(
  programId: string,
  importData: SyllabusImport,
  userId: string,
): Promise<SyllabusWithFlights> {
  const version = await nextMinorVersion(programId)

  const syllabusRow = await db
    .insertInto('dto.syllabus')
    .values({
      program_id: programId,
      major_version: version.majorVersion,
      minor_version: version.minorVersion,
      patch_version: version.patchVersion,
      description: importData.description ?? null,
      min_block_time_mins: importData.minBlockTimeMins ?? null,
      status: 'DRAFT',
      created_by: userId,
      updated_by: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const syllabus = mapSyllabus(syllabusRow)

  await upsertSyllabusFlights(
    syllabus.syllabusId,
    importData.flights.map(f => ({
      code: f.code,
      name: f.name,
      description: f.description,
      tags: f.tags,
      isInterimCheckpoint: f.isInterimCheckpoint,
      recommendedBlockTimeMins: f.recommendedBlockTimeMins,
      items: f.items,
    })),
  )

  const result = await getSyllabusWithFlights(syllabus.syllabusId)
  return result!
}

// ─────────────────────────────────────────────────────────────────────────────
// Member Syllabus Assignment
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveSyllabusForMember(
  memberId: string,
): Promise<MemberSyllabus | undefined> {
  const r = await db
    .selectFrom('dto.member_syllabus')
    .selectAll()
    .where('member_id', '=', memberId)
    .where('is_active', '=', true)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    memberSyllabusId: r.member_syllabus_id,
    memberId: r.member_id,
    syllabusId: r.syllabus_id,
    isActive: r.is_active,
    assignedAt: toIso(r.assigned_at),
    assignedBy: r.assigned_by,
    deactivatedAt: toIsoNullable(r.deactivated_at),
  }
}

export async function assignSyllabusToMember(
  memberId: string,
  syllabusId: string,
  assignedBy: string,
): Promise<MemberSyllabus> {
  const r = await db
    .insertInto('dto.member_syllabus')
    .values({
      member_id: memberId,
      syllabus_id: syllabusId,
      assigned_by: assignedBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return {
    memberSyllabusId: r.member_syllabus_id,
    memberId: r.member_id,
    syllabusId: r.syllabus_id,
    isActive: r.is_active,
    assignedAt: toIso(r.assigned_at),
    assignedBy: r.assigned_by,
    deactivatedAt: toIsoNullable(r.deactivated_at),
  }
}

export async function getMemberSyllabusByIdWithFlights(
  memberSyllabusId: string,
): Promise<
  | (MemberSyllabus & { memberName: string; syllabusDetail: SyllabusWithFlights | undefined })
  | undefined
> {
  const r = await db
    .selectFrom('dto.member_syllabus')
    .innerJoin('member.register', 'member.register.member_id', 'dto.member_syllabus.member_id')
    .select([
      'dto.member_syllabus.member_syllabus_id',
      'dto.member_syllabus.member_id',
      'dto.member_syllabus.syllabus_id',
      'dto.member_syllabus.is_active',
      'dto.member_syllabus.assigned_at',
      'dto.member_syllabus.assigned_by',
      'dto.member_syllabus.deactivated_at',
      'member.register.first_name',
      'member.register.last_name',
    ])
    .where('dto.member_syllabus.member_syllabus_id', '=', memberSyllabusId)
    .executeTakeFirst()
  if (!r) return undefined
  const syllabusDetail = await getSyllabusWithFlights(r.syllabus_id)
  return {
    memberSyllabusId: r.member_syllabus_id,
    memberId: r.member_id,
    syllabusId: r.syllabus_id,
    isActive: r.is_active,
    assignedAt: toIso(r.assigned_at),
    assignedBy: r.assigned_by,
    deactivatedAt: toIsoNullable(r.deactivated_at),
    memberName: `${r.first_name} ${r.last_name}`,
    syllabusDetail,
  }
}

export async function getMemberSyllabusOwnerId(
  memberSyllabusId: string,
): Promise<string | undefined> {
  const r = await db
    .selectFrom('dto.member_syllabus')
    .select('member_id')
    .where('member_syllabus_id', '=', memberSyllabusId)
    .executeTakeFirst()
  return r?.member_id
}

// ─────────────────────────────────────────────────────────────────────────────
// Flight Attempts
// ─────────────────────────────────────────────────────────────────────────────
export async function getAttemptByFlightLogId(
  flightLogId: string,
): Promise<SyllabusFlightAttempt | undefined> {
  const r = await db
    .selectFrom('dto.syllabus_flight_attempts')
    .selectAll()
    .where('flight_log_id', '=', flightLogId)
    .executeTakeFirst()
  return r ? mapAttempt(r) : undefined
}

export async function getAttemptById(
  attemptId: string,
): Promise<SyllabusFlightAttempt | undefined> {
  const r = await db
    .selectFrom('dto.syllabus_flight_attempts')
    .selectAll()
    .where('attempt_id', '=', attemptId)
    .executeTakeFirst()
  return r ? mapAttempt(r) : undefined
}

export type AttemptWithFlightData = SyllabusFlightAttempt & {
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

export async function getAttemptByIdWithFlightData(
  attemptId: string,
): Promise<AttemptWithFlightData | undefined> {
  const r = await db
    .selectFrom('dto.syllabus_flight_attempts')
    .innerJoin('flight.logs', 'flight.logs.flight_id', 'dto.syllabus_flight_attempts.flight_log_id')
    .leftJoin('member.register as v', 'v.member_id', 'dto.syllabus_flight_attempts.verified_by')
    .select([
      'dto.syllabus_flight_attempts.attempt_id',
      'dto.syllabus_flight_attempts.flight_log_id',
      'dto.syllabus_flight_attempts.syllabus_flight_id',
      'dto.syllabus_flight_attempts.member_syllabus_id',
      'dto.syllabus_flight_attempts.instructor_member_id',
      'dto.syllabus_flight_attempts.instructor_comments',
      'dto.syllabus_flight_attempts.verification_result',
      'dto.syllabus_flight_attempts.verified_at',
      'dto.syllabus_flight_attempts.verified_by',
      'dto.syllabus_flight_attempts.requires_reverification',
      'dto.syllabus_flight_attempts.created_at',
      'dto.syllabus_flight_attempts.updated_at',
      'flight.logs.off_block_time_utc',
      'flight.logs.on_block_time_utc',
      'flight.logs.takeoff_time_utc',
      'flight.logs.landing_time_utc',
      'flight.logs.block_time',
      'flight.logs.flight_time',
      'flight.logs.departure_airport',
      'flight.logs.arrival_airport',
      'flight.logs.number_of_landings',
      'v.first_name as verifier_first_name',
      'v.last_name as verifier_last_name',
    ])
    .where('dto.syllabus_flight_attempts.attempt_id', '=', attemptId)
    .executeTakeFirst()

  if (!r) return undefined

  return {
    ...mapAttempt(r),
    flightDate: toIso(r.off_block_time_utc).substring(0, 10),
    offBlockTimeUtc: toIso(r.off_block_time_utc),
    onBlockTimeUtc: toIso(r.on_block_time_utc),
    takeoffTimeUtc: toIso(r.takeoff_time_utc),
    landingTimeUtc: toIso(r.landing_time_utc),
    blockTime: r.block_time,
    flightTime: r.flight_time,
    departureAirport: r.departure_airport,
    arrivalAirport: r.arrival_airport,
    numberOfLandings: r.number_of_landings,
  }
}

export async function copySyllabusAsDraft(
  syllabusId: string,
  userId: string,
): Promise<SyllabusWithFlights | undefined> {
  const source = await getSyllabusWithFlights(syllabusId)
  if (!source) return undefined

  const version = await nextMinorVersion(source.programId)

  const newRow = await db
    .insertInto('dto.syllabus')
    .values({
      program_id: source.programId,
      major_version: version.majorVersion,
      minor_version: version.minorVersion,
      patch_version: version.patchVersion,
      description: source.description ?? null,
      min_block_time_mins: source.minBlockTimeMins ?? null,
      status: 'DRAFT',
      created_by: userId,
      updated_by: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const newSyllabus = mapSyllabus(newRow)

  await upsertSyllabusFlights(
    newSyllabus.syllabusId,
    (source.flights ?? []).map(f => ({
      code: f.code,
      name: f.name,
      description: f.description,
      tags: f.tags,
      isInterimCheckpoint: f.isInterimCheckpoint,
      recommendedBlockTimeMins: f.recommendedBlockTimeMins,
      items: (f.items ?? []).map(i => ({
        name: i.name,
        description: i.description,
        mandatory: i.mandatory,
      })),
    })),
  )

  return getSyllabusWithFlights(newSyllabus.syllabusId)
}

export async function getAttemptsByMemberSyllabus(
  memberSyllabusId: string,
): Promise<SyllabusFlightAttempt[]> {
  const rows = await db
    .selectFrom('dto.syllabus_flight_attempts')
    .selectAll()
    .where('member_syllabus_id', '=', memberSyllabusId)
    .orderBy('created_at', 'desc')
    .execute()
  return rows.map(mapAttempt)
}

export type AttemptWithFlightLogData = SyllabusFlightAttempt & {
  flightDate: string
  offBlockTimeUtc: string
  onBlockTimeUtc: string
  blockTime: string
  flightTime: string
}

export async function getAttemptsByMemberSyllabusWithFlightLog(
  memberSyllabusId: string,
): Promise<AttemptWithFlightLogData[]> {
  const rows = await db
    .selectFrom('dto.syllabus_flight_attempts')
    .innerJoin('flight.logs', 'flight.logs.flight_id', 'dto.syllabus_flight_attempts.flight_log_id')
    .select([
      'dto.syllabus_flight_attempts.attempt_id',
      'dto.syllabus_flight_attempts.flight_log_id',
      'dto.syllabus_flight_attempts.syllabus_flight_id',
      'dto.syllabus_flight_attempts.member_syllabus_id',
      'dto.syllabus_flight_attempts.instructor_member_id',
      'dto.syllabus_flight_attempts.instructor_comments',
      'dto.syllabus_flight_attempts.verification_result',
      'dto.syllabus_flight_attempts.verified_at',
      'dto.syllabus_flight_attempts.verified_by',
      'dto.syllabus_flight_attempts.requires_reverification',
      'dto.syllabus_flight_attempts.created_at',
      'dto.syllabus_flight_attempts.updated_at',
      'flight.logs.off_block_time_utc',
      'flight.logs.on_block_time_utc',
      'flight.logs.block_time',
      'flight.logs.flight_time',
    ])
    .where('dto.syllabus_flight_attempts.member_syllabus_id', '=', memberSyllabusId)
    .orderBy('dto.syllabus_flight_attempts.created_at', 'desc')
    .execute()

  return rows.map(r => ({
    ...mapAttempt(r),
    flightDate: toIso(r.off_block_time_utc).substring(0, 10),
    offBlockTimeUtc: toIso(r.off_block_time_utc),
    onBlockTimeUtc: toIso(r.on_block_time_utc),
    blockTime: r.block_time,
    flightTime: r.flight_time,
  }))
}

export type PendingVerificationItem = SyllabusFlightAttempt & {
  memberName: string
  syllabusFlightCode: string
  syllabusFlightName: string
}

export async function getPendingVerifications(): Promise<PendingVerificationItem[]> {
  const rows = await db
    .selectFrom('dto.syllabus_flight_attempts')
    .innerJoin(
      'dto.member_syllabus',
      'dto.member_syllabus.member_syllabus_id',
      'dto.syllabus_flight_attempts.member_syllabus_id',
    )
    .innerJoin('member.register', 'member.register.member_id', 'dto.member_syllabus.member_id')
    .innerJoin(
      'dto.syllabus_flights',
      'dto.syllabus_flights.flight_id',
      'dto.syllabus_flight_attempts.syllabus_flight_id',
    )
    .select([
      'dto.syllabus_flight_attempts.attempt_id',
      'dto.syllabus_flight_attempts.flight_log_id',
      'dto.syllabus_flight_attempts.syllabus_flight_id',
      'dto.syllabus_flight_attempts.member_syllabus_id',
      'dto.syllabus_flight_attempts.instructor_member_id',
      'dto.syllabus_flight_attempts.instructor_comments',
      'dto.syllabus_flight_attempts.verification_result',
      'dto.syllabus_flight_attempts.verified_at',
      'dto.syllabus_flight_attempts.verified_by',
      'dto.syllabus_flight_attempts.requires_reverification',
      'dto.syllabus_flight_attempts.created_at',
      'dto.syllabus_flight_attempts.updated_at',
      'member.register.first_name',
      'member.register.last_name',
      'dto.syllabus_flights.code as flight_code',
      'dto.syllabus_flights.name as flight_name',
    ])
    .where(eb =>
      eb.or([
        eb('dto.syllabus_flight_attempts.verification_result', 'is', null),
        eb('dto.syllabus_flight_attempts.requires_reverification', '=', true),
      ]),
    )
    .orderBy('dto.syllabus_flight_attempts.created_at')
    .execute()

  return rows.map(r => ({
    ...mapAttempt(r),
    memberName: `${r.first_name} ${r.last_name}`,
    syllabusFlightCode: r.flight_code,
    syllabusFlightName: r.flight_name,
  }))
}

export async function getPendingVerificationsCount(): Promise<number> {
  const r = await db
    .selectFrom('dto.syllabus_flight_attempts')
    .select(eb => eb.fn.count('attempt_id').as('count'))
    .where(eb =>
      eb.or([eb('verification_result', 'is', null), eb('requires_reverification', '=', true)]),
    )
    .executeTakeFirstOrThrow()
  return Number(r.count)
}

export async function insertAttempt(
  flightLogId: string,
  syllabusFlightId: string,
  memberSyllabusId: string,
  instructorMemberId: string,
): Promise<SyllabusFlightAttempt> {
  const r = await db
    .insertInto('dto.syllabus_flight_attempts')
    .values({
      flight_log_id: flightLogId,
      syllabus_flight_id: syllabusFlightId,
      member_syllabus_id: memberSyllabusId,
      instructor_member_id: instructorMemberId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  // Mark the flight log entry as a DTO training flight (used for invoicing)
  await db
    .updateTable('flight.logs')
    .set({ is_dto_training_flight: true })
    .where('flight_id', '=', flightLogId)
    .execute()

  return mapAttempt(r)
}

export async function updateAttemptSyllabusFlight(
  flightLogId: string,
  syllabusFlightId: string,
): Promise<SyllabusFlightAttempt | undefined> {
  const r = await db
    .updateTable('dto.syllabus_flight_attempts')
    .set({ syllabus_flight_id: syllabusFlightId, updated_at: new Date() })
    .where('flight_log_id', '=', flightLogId)
    .where('verification_result', 'is', null)
    .returningAll()
    .executeTakeFirst()
  return r ? mapAttempt(r) : undefined
}

export async function verifyAttempt(
  attemptId: string,
  data: VerifyAttempt,
  verifiedBy: string,
): Promise<SyllabusFlightAttempt | undefined> {
  const now = new Date()

  const r = await db
    .updateTable('dto.syllabus_flight_attempts')
    .set({
      verification_result: data.result,
      verified_at: now,
      verified_by: verifiedBy,
      instructor_comments: data.instructorComments ?? null,
      requires_reverification: false,
      updated_at: now,
    })
    .where('attempt_id', '=', attemptId)
    .where(eb =>
      eb.or([eb('verification_result', 'is', null), eb('requires_reverification', '=', true)]),
    )
    .returningAll()
    .executeTakeFirst()

  if (!r) return undefined

  // Upsert item outcomes
  if (data.itemOutcomes && data.itemOutcomes.length > 0) {
    for (const o of data.itemOutcomes) {
      await db
        .insertInto('dto.flight_item_outcomes')
        .values({
          attempt_id: attemptId,
          item_id: o.itemId,
          outcome: o.outcome,
          remarks: o.remarks ?? null,
        })
        .onConflict(oc =>
          oc.columns(['attempt_id', 'item_id']).doUpdateSet({
            outcome: o.outcome,
            remarks: o.remarks ?? null,
            updated_at: now,
          }),
        )
        .execute()

      // If outcome is MOVED_TO_HIL, add to HIL queue (if not already open)
      if (o.outcome === 'MOVED_TO_HIL') {
        const memberSyllabus = await db
          .selectFrom('dto.syllabus_flight_attempts')
          .innerJoin(
            'dto.member_syllabus',
            'dto.member_syllabus.member_syllabus_id',
            'dto.syllabus_flight_attempts.member_syllabus_id',
          )
          .select(['dto.member_syllabus.member_id', 'dto.member_syllabus.syllabus_id'])
          .where('dto.syllabus_flight_attempts.attempt_id', '=', attemptId)
          .executeTakeFirst()

        if (memberSyllabus) {
          // Check if there's already an open HIL entry for this member+item
          const existingHil = await db
            .selectFrom('dto.hil_queue')
            .select('hil_id')
            .where('member_id', '=', memberSyllabus.member_id)
            .where('item_id', '=', o.itemId)
            .where('resolved_at', 'is', null)
            .executeTakeFirst()

          if (!existingHil) {
            await db
              .insertInto('dto.hil_queue')
              .values({
                member_id: memberSyllabus.member_id,
                syllabus_id: memberSyllabus.syllabus_id,
                item_id: o.itemId,
                opened_on_attempt_id: attemptId,
              })
              .execute()
          }
        }
      }

      // If outcome resolves a HIL entry, close it
      if (o.outcome === 'COMPLETED' || o.outcome === 'FAILED') {
        const memberSyllabus = await db
          .selectFrom('dto.syllabus_flight_attempts')
          .innerJoin(
            'dto.member_syllabus',
            'dto.member_syllabus.member_syllabus_id',
            'dto.syllabus_flight_attempts.member_syllabus_id',
          )
          .select('dto.member_syllabus.member_id')
          .where('dto.syllabus_flight_attempts.attempt_id', '=', attemptId)
          .executeTakeFirst()

        if (memberSyllabus) {
          await db
            .updateTable('dto.hil_queue')
            .set({
              resolved_at: now,
              resolved_on_attempt_id: attemptId,
              resolution_outcome: o.outcome,
            })
            .where('member_id', '=', memberSyllabus.member_id)
            .where('item_id', '=', o.itemId)
            .where('resolved_at', 'is', null)
            .execute()
        }
      }
    }
  }

  return mapAttempt(r)
}

// Sets requires_reverification=true on any verified attempt for this flight.
// Called after a flight log is edited so instructors know to re-verify.
export async function invalidateApprovedAttempt(flightLogId: string): Promise<void> {
  await db
    .updateTable('dto.syllabus_flight_attempts')
    .set({ requires_reverification: true, updated_at: new Date() })
    .where('flight_log_id', '=', flightLogId)
    .where('verification_result', 'is not', null)
    .execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Item Outcomes
// ─────────────────────────────────────────────────────────────────────────────
export async function getItemOutcomesByAttempt(attemptId: string): Promise<FlightItemOutcome[]> {
  const rows = await db
    .selectFrom('dto.flight_item_outcomes')
    .selectAll()
    .where('attempt_id', '=', attemptId)
    .execute()
  return rows.map(r => ({
    attemptId: r.attempt_id,
    itemId: r.item_id,
    outcome: r.outcome as FlightItemOutcome['outcome'],
    remarks: r.remarks,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  }))
}

export async function getItemOutcomesByAttempts(
  attemptIds: string[],
): Promise<Map<string, FlightItemOutcome[]>> {
  if (attemptIds.length === 0) return new Map()
  const rows = await db
    .selectFrom('dto.flight_item_outcomes')
    .selectAll()
    .where('attempt_id', 'in', attemptIds)
    .execute()
  const grouped = new Map<string, FlightItemOutcome[]>()
  for (const r of rows) {
    const outcome: FlightItemOutcome = {
      attemptId: r.attempt_id,
      itemId: r.item_id,
      outcome: r.outcome as FlightItemOutcome['outcome'],
      remarks: r.remarks,
      createdAt: toIso(r.created_at),
      updatedAt: toIso(r.updated_at),
    }
    const list = grouped.get(r.attempt_id) ?? []
    list.push(outcome)
    grouped.set(r.attempt_id, list)
  }
  return grouped
}

// ─────────────────────────────────────────────────────────────────────────────
// HIL Queue
// ─────────────────────────────────────────────────────────────────────────────
export async function getOpenHilForMember(memberId: string): Promise<HilEntry[]> {
  const rows = await db
    .selectFrom('dto.hil_queue')
    .selectAll()
    .where('member_id', '=', memberId)
    .where('resolved_at', 'is', null)
    .orderBy('opened_at')
    .execute()
  return rows.map(r => ({
    hilId: r.hil_id,
    memberId: r.member_id,
    syllabusId: r.syllabus_id,
    itemId: r.item_id,
    openedOnAttemptId: r.opened_on_attempt_id,
    openedAt: toIso(r.opened_at),
    resolvedOnAttemptId: r.resolved_on_attempt_id,
    resolvedAt: toIsoNullable(r.resolved_at),
    resolutionOutcome: r.resolution_outcome as HilEntry['resolutionOutcome'],
    notes: r.notes,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────
export async function getStudentProgress(): Promise<StudentProgress[]> {
  // Get all active member syllabus assignments with member names and syllabus info
  const rows = await db
    .selectFrom('dto.member_syllabus')
    .innerJoin('member.register', 'member.register.member_id', 'dto.member_syllabus.member_id')
    .innerJoin('dto.syllabus', 'dto.syllabus.syllabus_id', 'dto.member_syllabus.syllabus_id')
    .innerJoin('dto.training_program', 'dto.training_program.program_id', 'dto.syllabus.program_id')
    .select([
      'dto.member_syllabus.member_id',
      'dto.member_syllabus.member_syllabus_id',
      'dto.member_syllabus.syllabus_id',
      'dto.training_program.name as program_name',
      'dto.syllabus.version',
      'dto.syllabus.min_block_time_mins',
      'member.register.first_name',
      'member.register.last_name',
    ])
    .where('dto.member_syllabus.is_active', '=', true)
    .execute()

  const results: StudentProgress[] = []

  for (const row of rows) {
    // Get syllabus flights count
    const flightCountRow = await db
      .selectFrom('dto.syllabus_flights')
      .select(eb => eb.fn.count('flight_id').as('count'))
      .where('syllabus_id', '=', row.syllabus_id)
      .executeTakeFirstOrThrow()
    const totalFlights = Number(flightCountRow.count)

    // Get completed flight attempts for this member's syllabus
    const completedRows = await db
      .selectFrom('dto.syllabus_flight_attempts')
      .select(['syllabus_flight_id', 'created_at'])
      .where('member_syllabus_id', '=', row.member_syllabus_id)
      .where('verification_result', '=', 'APPROVED')
      .execute()

    // Count distinct syllabus flights that have been approved
    const completedFlightIds = new Set(completedRows.map(r => r.syllabus_flight_id))
    const completedFlights = completedFlightIds.size

    // Sum block minutes from all approved attempts
    const blockTimeSumRow = await db
      .selectFrom('dto.syllabus_flight_attempts')
      .innerJoin(
        'flight.logs',
        'flight.logs.flight_id',
        'dto.syllabus_flight_attempts.flight_log_id',
      )
      .select(eb => eb.fn.sum<number>('flight.logs.block_mins').as('total_block_mins'))
      .where('dto.syllabus_flight_attempts.member_syllabus_id', '=', row.member_syllabus_id)
      .where('dto.syllabus_flight_attempts.verification_result', '=', 'APPROVED')
      .executeTakeFirst()
    const totalBlockTimeMins = Number(blockTimeSumRow?.total_block_mins ?? 0)

    // Last DTO flight date
    const lastAttemptRow = await db
      .selectFrom('dto.syllabus_flight_attempts')
      .select('created_at')
      .where('member_syllabus_id', '=', row.member_syllabus_id)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    // Check interim checkpoint
    const interimFlightRow = await db
      .selectFrom('dto.syllabus_flights')
      .select('flight_id')
      .where('syllabus_id', '=', row.syllabus_id)
      .where('is_interim_checkpoint', '=', true)
      .executeTakeFirst()

    let interimCheckpointCompleted = false
    if (interimFlightRow) {
      interimCheckpointCompleted = completedFlightIds.has(interimFlightRow.flight_id)
    }

    const minBlockTimeMins = row.min_block_time_mins ?? null
    const meetsTimeRequirement = minBlockTimeMins === null || totalBlockTimeMins >= minBlockTimeMins

    results.push({
      memberId: row.member_id,
      memberName: `${row.first_name} ${row.last_name}`,
      memberSyllabusId: row.member_syllabus_id,
      syllabusId: row.syllabus_id,
      syllabusTitle: row.program_name,
      syllabusVersion: row.version,
      totalFlights,
      completedFlights,
      lastDtoFlightDate: lastAttemptRow ? toIso(lastAttemptRow.created_at) : null,
      interimCheckpointCompleted,
      totalBlockTimeMins,
      minBlockTimeMins,
      meetsTimeRequirement,
    })
  }

  return results
}
