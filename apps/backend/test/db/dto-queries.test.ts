import 'dotenv/config'

import { db } from '../../src/db/connection.ts'
import {
  getMemberSyllabusOwnerId,
  updateSyllabus,
  updateAttemptSyllabusFlight,
  getItemOutcomesByAttempts,
  copySyllabusAsDraft,
  insertSyllabus,
  submitSyllabusForApproval,
  publishSyllabus,
} from '../../src/db/dto-queries.ts'

// ── Seed data IDs ─────────────────────────────────────────────────────────────

const PROGRAM_ID = 'a0000000-0000-0000-0000-000000000001'
const SYLLABUS_ID = 'b0000000-0000-0000-0000-000000000001' // PUBLISHED v1.0.0
const FLIGHT_01_ID = 'c0000000-0000-0000-0000-000000000001' // Basic Handling
const FLIGHT_02_ID = 'c0000000-0000-0000-0000-000000000002' // Circuit Training
const MS_JUHA1 = 'e0000000-0000-0000-0000-000000000001'
const MS_MATTI1 = 'e0000000-0000-0000-0000-000000000002'
// Attempt f...001: Juha1 flight 01, APPROVED
const ATTEMPT_J1_01 = 'f0000000-0000-0000-0000-000000000001'
// Attempt f...004: Matti1 flight 01, APPROVED (first approved attempt in seed data)
const ATTEMPT_M1_01 = 'f0000000-0000-0000-0000-000000000004'
const USER_ID = 'Liisa1'

// ── getMemberSyllabusOwnerId ──────────────────────────────────────────────────

describe('getMemberSyllabusOwnerId', () => {
  it('returns the owner memberId for Juha1 syllabus assignment', async () => {
    const ownerId = await getMemberSyllabusOwnerId(MS_JUHA1)
    expect(ownerId).toBe('Juha1')
  })

  it('returns the owner memberId for Matti1 syllabus assignment', async () => {
    const ownerId = await getMemberSyllabusOwnerId(MS_MATTI1)
    expect(ownerId).toBe('Matti1')
  })

  it('returns undefined for a non-existent memberSyllabusId', async () => {
    const ownerId = await getMemberSyllabusOwnerId('00000000-0000-0000-0000-000000000000')
    expect(ownerId).toBeUndefined()
  })
})

// ── updateSyllabus — conditional minBlockTimeMins ─────────────────────────────

describe('updateSyllabus — minBlockTimeMins field handling', () => {
  let draftSyllabusId: string

  beforeEach(async () => {
    // Create a fresh DRAFT syllabus with a known minBlockTimeMins
    const syllabus = await insertSyllabus(
      PROGRAM_ID,
      { description: 'test', minBlockTimeMins: 500 },
      USER_ID,
    )
    draftSyllabusId = syllabus.syllabusId
  })

  afterEach(async () => {
    await db.deleteFrom('dto.syllabus').where('syllabusId', '=', draftSyllabusId).execute()
  })

  it('preserves minBlockTimeMins when the field is omitted from the update', async () => {
    const updated = await updateSyllabus(
      draftSyllabusId,
      { description: 'changed description' },
      USER_ID,
    )
    expect(updated).toBeDefined()
    expect(updated!.minBlockTimeMins).toBe(500)
    expect(updated!.description).toBe('changed description')
  })

  it('clears minBlockTimeMins when explicitly set to null', async () => {
    const updated = await updateSyllabus(draftSyllabusId, { minBlockTimeMins: null }, USER_ID)
    expect(updated).toBeDefined()
    expect(updated!.minBlockTimeMins).toBeNull()
  })

  it('updates minBlockTimeMins to a new positive value', async () => {
    const updated = await updateSyllabus(draftSyllabusId, { minBlockTimeMins: 2700 }, USER_ID)
    expect(updated!.minBlockTimeMins).toBe(2700)
  })

  it('returns undefined for a PUBLISHED syllabus (not editable)', async () => {
    const updated = await updateSyllabus(
      SYLLABUS_ID, // PUBLISHED — should not be editable
      { description: 'should not change' },
      USER_ID,
    )
    expect(updated).toBeUndefined()
  })

  it('returns undefined for a WAITING_FOR_APPROVAL syllabus', async () => {
    await submitSyllabusForApproval(draftSyllabusId, USER_ID)
    const updated = await updateSyllabus(
      draftSyllabusId,
      { description: 'should not change' },
      USER_ID,
    )
    expect(updated).toBeUndefined()
  })
})

// ── publishSyllabus — approval-gated publish + auto-archive ───────────────────

describe('publishSyllabus', () => {
  // Uses a throwaway training program so this never touches the shared
  // seeded SYLLABUS_ID fixture other tests rely on being PUBLISHED v1.0.0.
  const TEST_PROGRAM_NAME = 'Test Program DTO Query Publish Suite'
  let testProgramId: string | undefined
  let firstSyllabusId: string | undefined
  let secondSyllabusId: string | undefined

  afterEach(async () => {
    if (firstSyllabusId) {
      await db.deleteFrom('dto.syllabus').where('syllabusId', '=', firstSyllabusId).execute()
      firstSyllabusId = undefined
    }
    if (secondSyllabusId) {
      await db.deleteFrom('dto.syllabus').where('syllabusId', '=', secondSyllabusId).execute()
      secondSyllabusId = undefined
    }
    if (testProgramId) {
      await db.deleteFrom('dto.trainingProgram').where('programId', '=', testProgramId).execute()
      testProgramId = undefined
    }
  })

  it('returns undefined when called on a DRAFT syllabus (must go through WAITING_FOR_APPROVAL)', async () => {
    const program = await db
      .insertInto('dto.trainingProgram')
      .values({ name: TEST_PROGRAM_NAME, createdBy: USER_ID, updatedBy: USER_ID })
      .returningAll()
      .executeTakeFirstOrThrow()
    testProgramId = program.programId

    const draft = await insertSyllabus(testProgramId, {}, USER_ID)
    firstSyllabusId = draft.syllabusId
    const result = await publishSyllabus(firstSyllabusId, USER_ID)
    expect(result).toBeUndefined()
  })

  it('archives the previously PUBLISHED syllabus for the same program', async () => {
    const program = await db
      .insertInto('dto.trainingProgram')
      .values({ name: TEST_PROGRAM_NAME, createdBy: USER_ID, updatedBy: USER_ID })
      .returningAll()
      .executeTakeFirstOrThrow()
    testProgramId = program.programId

    const first = await insertSyllabus(testProgramId, {}, USER_ID)
    firstSyllabusId = first.syllabusId
    await submitSyllabusForApproval(firstSyllabusId, USER_ID)
    const publishedFirst = await publishSyllabus(firstSyllabusId, USER_ID, 'AUTH-REF-1')
    expect(publishedFirst?.status).toBe('PUBLISHED')
    expect(publishedFirst?.approvalReference).toBe('AUTH-REF-1')

    const second = await insertSyllabus(testProgramId, {}, USER_ID)
    secondSyllabusId = second.syllabusId
    await submitSyllabusForApproval(secondSyllabusId, USER_ID)
    const publishedSecond = await publishSyllabus(secondSyllabusId, USER_ID)
    expect(publishedSecond?.status).toBe('PUBLISHED')

    const firstAfter = await db
      .selectFrom('dto.syllabus')
      .selectAll()
      .where('syllabusId', '=', firstSyllabusId)
      .executeTakeFirst()
    expect(firstAfter?.status).toBe('ARCHIVED')
    expect(firstAfter?.publishedAt).not.toBeNull()
  })
})

// ── updateAttemptSyllabusFlight — verified attempt guard ──────────────────────

describe('updateAttemptSyllabusFlight — verified attempt guard', () => {
  const TEST_FLIGHT_ID = 'tstdbfl1'
  const TEST_ATTEMPT_ID = '99999999-0000-0000-0000-000000000001'

  beforeEach(async () => {
    // Insert a fresh flight log and unverified attempt for isolation
    await db
      .insertInto('flight.logs')
      .values({
        flightId: TEST_FLIGHT_ID,
        billableMemberId: 'Juha1',
        picMemberId: 'Juha1',
        picLastName: 'Tester',
        picRole: 'STU' as const,
        aircraftRegistration: 'OH-P28',
        offBlockTimeEpoch: 1768200000,
        takeoffTimeEpoch: 1768200060,
        landingTimeEpoch: 1768203600,
        onBlockTimeEpoch: 1768203660,
        fuelRemainingLitres: 20,
        personsOnBoard: 2,
        numberOfLandings: 1,
        nightFlyingMins: 0,
        instrumentFlyingMins: 0,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
        flightType: 'SCHOOL',
        createdBy: 'Juha1',
        updatedBy: 'Juha1',
        isBillableFlight: false,
        privOrComFlight: 'C',
        ajlbSeqNo: 4,
        ajlbBlankRowsBefore: 0,
        status: 'NEW',
        isDtoTrainingFlight: true,
      })
      .execute()
    await db
      .insertInto('dto.syllabusFlightAttempts')
      .values({
        attemptId: TEST_ATTEMPT_ID,
        flightLogId: TEST_FLIGHT_ID,
        syllabusFlightId: FLIGHT_01_ID,
        memberSyllabusId: MS_JUHA1,
        instructorMemberId: 'Juha1',
        verificationResult: null,
      })
      .execute()
  })

  afterEach(async () => {
    await db
      .deleteFrom('dto.syllabusFlightAttempts')
      .where('attemptId', '=', TEST_ATTEMPT_ID)
      .execute()
    await db.deleteFrom('flight.logs').where('flightId', '=', TEST_FLIGHT_ID).execute()
  })

  it('updates syllabus flight on an unverified attempt', async () => {
    const updated = await updateAttemptSyllabusFlight(TEST_FLIGHT_ID, FLIGHT_02_ID)
    expect(updated).toBeDefined()
    expect(updated!.syllabusFlightId).toBe(FLIGHT_02_ID)
  })

  it('returns undefined (no update) for a verified (APPROVED) attempt', async () => {
    // ATTEMPT_J1_01 (dtoj1f01a) is APPROVED from seed data — must not be mutable
    const updated = await updateAttemptSyllabusFlight('dtoj1f01a', FLIGHT_02_ID)
    expect(updated).toBeUndefined()

    // Verify original syllabusFlightId is unchanged in the DB
    const row = await db
      .selectFrom('dto.syllabusFlightAttempts')
      .select('syllabusFlightId')
      .where('attemptId', '=', ATTEMPT_J1_01)
      .executeTakeFirst()
    expect(row?.syllabusFlightId).toBe(FLIGHT_01_ID)
  })
})

// ── getItemOutcomesByAttempts — batch query ────────────────────────────────────

describe('getItemOutcomesByAttempts', () => {
  it('returns an empty Map for an empty input array', async () => {
    const result = await getItemOutcomesByAttempts([])
    expect(result.size).toBe(0)
  })

  it('fetches outcomes for a single attempt', async () => {
    const result = await getItemOutcomesByAttempts([ATTEMPT_J1_01])
    expect(result.has(ATTEMPT_J1_01)).toBe(true)
    const outcomes = result.get(ATTEMPT_J1_01)!
    expect(outcomes.length).toBeGreaterThan(0)
    expect(outcomes[0]).toMatchObject({
      attemptId: ATTEMPT_J1_01,
      itemId: expect.any(String),
      outcome: expect.any(String),
    })
  })

  it('fetches outcomes for multiple attempts in one call', async () => {
    const result = await getItemOutcomesByAttempts([ATTEMPT_J1_01, ATTEMPT_M1_01])
    expect(result.has(ATTEMPT_J1_01)).toBe(true)
    expect(result.has(ATTEMPT_M1_01)).toBe(true)
    // Both approved attempts have 2 item outcomes each
    expect(result.get(ATTEMPT_J1_01)!.length).toBe(2)
    expect(result.get(ATTEMPT_M1_01)!.length).toBe(2)
  })

  it('attempt with no recorded outcomes is absent from the map (defaults to empty)', async () => {
    // Use a non-existent attempt UUID — guaranteed to have no outcomes
    const fakeId = '00000000-dead-beef-0000-000000000000'
    const result = await getItemOutcomesByAttempts([fakeId])
    const outcomes = result.get(fakeId) ?? []
    expect(outcomes.length).toBe(0)
  })

  it('does not mix outcomes between attempts', async () => {
    const result = await getItemOutcomesByAttempts([ATTEMPT_J1_01, ATTEMPT_M1_01])
    for (const [attemptId, outcomes] of result) {
      for (const o of outcomes) {
        expect(o.attemptId).toBe(attemptId)
      }
    }
  })
})

// ── copySyllabusAsDraft — time fields preserved ───────────────────────────────

describe('copySyllabusAsDraft', () => {
  let copiedSyllabusId: string | undefined

  afterEach(async () => {
    if (copiedSyllabusId) {
      await db.deleteFrom('dto.syllabus').where('syllabusId', '=', copiedSyllabusId).execute()
      copiedSyllabusId = undefined
    }
  })

  it('copies minBlockTimeMins from the source syllabus', async () => {
    const copy = await copySyllabusAsDraft(SYLLABUS_ID, USER_ID)
    expect(copy).toBeDefined()
    copiedSyllabusId = copy!.syllabusId
    expect(copy!.minBlockTimeMins).toBe(2700)
  })

  it('copy is created in DRAFT status', async () => {
    const copy = await copySyllabusAsDraft(SYLLABUS_ID, USER_ID)
    copiedSyllabusId = copy!.syllabusId
    expect(copy!.status).toBe('DRAFT')
  })

  it('copy has a different syllabusId than the source', async () => {
    const copy = await copySyllabusAsDraft(SYLLABUS_ID, USER_ID)
    copiedSyllabusId = copy!.syllabusId
    expect(copy!.syllabusId).not.toBe(SYLLABUS_ID)
  })

  it('copy preserves recommendedBlockTimeMins on flights', async () => {
    const copy = await copySyllabusAsDraft(SYLLABUS_ID, USER_ID)
    copiedSyllabusId = copy!.syllabusId
    const flight01 = (copy!.flights ?? []).find((f) => f.code === '01')
    expect(flight01).toBeDefined()
    expect(flight01!.recommendedBlockTimeMins).toBe(60)
  })

  it('returns undefined for a non-existent syllabusId', async () => {
    const copy = await copySyllabusAsDraft('00000000-0000-0000-0000-000000000000', USER_ID)
    expect(copy).toBeUndefined()
  })
})
