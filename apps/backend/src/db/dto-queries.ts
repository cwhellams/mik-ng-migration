import type { Updateable } from 'kysely'

import type { DtoSyllabus, DtoSyllabusFlights, DtoSyllabusFlightItems } from './schema.camel.d.ts'
import { camelDb, type CamelRow } from './connection.ts'
import { renderMarkdown } from '../util/markdown.ts'
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
  SyllabusTextPatch,
  VerifyAttempt,
  FlightType,
} from '@mik/contracts/dto'

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

function renderMarkdownNullable(markdown: string | null): string | null {
  if (markdown == null) return null
  return renderMarkdown(markdown)
}

function mapProgram(r: CamelRow<'dto.trainingProgram'>): TrainingProgram {
  return {
    programId: r.programId,
    name: r.name,
    description: r.description,
    createdAt: toIso(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toIso(r.updatedAt),
    updatedBy: r.updatedBy,
  }
}

/**
 * @param includeHtml Renders the markdown text fields to HTML. Defaults to
 *   true (single-syllabus detail responses use it); pass false for list
 *   endpoints (e.g. getSyllabiByProgram) where the rendered HTML is never
 *   displayed, to avoid parsing markdown for every row in the list.
 */
function mapSyllabus(r: CamelRow<'dto.syllabus'>, includeHtml = true): Syllabus {
  return {
    syllabusId: r.syllabusId,
    programId: r.programId,
    majorVersion: r.majorVersion,
    minorVersion: r.minorVersion,
    patchVersion: r.patchVersion,
    version: r.version ?? `${r.majorVersion}.${r.minorVersion}.${r.patchVersion}`,
    description: r.description,
    descriptionHtml: includeHtml ? renderMarkdownNullable(r.description) : null,
    requirementsExperienceCredit: r.requirementsExperienceCredit,
    requirementsExperienceCreditHtml: includeHtml
      ? renderMarkdownNullable(r.requirementsExperienceCredit)
      : null,
    generalInformation: r.generalInformation,
    generalInformationHtml: includeHtml ? renderMarkdownNullable(r.generalInformation) : null,
    minBlockTimeMins: r.minBlockTimeMins,
    status: r.status as Syllabus['status'],
    publishedAt: toIsoNullable(r.publishedAt),
    submittedForApprovalAt: toIsoNullable(r.submittedForApprovalAt),
    approvalReference: r.approvalReference,
    createdAt: toIso(r.createdAt),
    createdBy: r.createdBy,
    updatedAt: toIso(r.updatedAt),
    updatedBy: r.updatedBy,
  }
}

function mapFlight(r: CamelRow<'dto.syllabusFlights'>): SyllabusFlight {
  return {
    flightId: r.flightId,
    syllabusId: r.syllabusId,
    sortOrder: r.sortOrder,
    code: r.code,
    name: r.name,
    description: r.description,
    tags: r.tags,
    isInterimCheckpoint: r.isInterimCheckpoint,
    recommendedBlockTimeMins: r.recommendedBlockTimeMins,
    flightType: r.flightType as SyllabusFlight['flightType'],
    easaFclReference: r.easaFclReference,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }
}

function mapItem(r: CamelRow<'dto.syllabusFlightItems'>): SyllabusFlightItem {
  return {
    itemId: r.itemId,
    syllabusFlightId: r.syllabusFlightId,
    sortOrder: r.sortOrder,
    name: r.name,
    description: r.description,
    mandatory: r.mandatory,
  }
}

// The two verifier columns come from a join on the member table, so they are not
// part of the generated row type.
function mapAttempt(
  r: CamelRow<'dto.syllabusFlightAttempts'> & {
    verifierFirstName?: string | null
    verifierLastName?: string | null
  },
): SyllabusFlightAttempt {
  const verifierName =
    r.verifierFirstName != null ? `${r.verifierFirstName} ${r.verifierLastName ?? ''}`.trim() : null
  return {
    attemptId: r.attemptId,
    flightLogId: r.flightLogId,
    syllabusFlightId: r.syllabusFlightId,
    memberSyllabusId: r.memberSyllabusId,
    instructorMemberId: r.instructorMemberId,
    instructorComments: r.instructorComments,
    verificationResult: r.verificationResult as SyllabusFlightAttempt['verificationResult'],
    verifiedAt: toIsoNullable(r.verifiedAt),
    verifiedBy: r.verifiedBy,
    verifierName,
    requiresReverification: r.requiresReverification,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Training Programs
// ─────────────────────────────────────────────────────────────────────────────
export async function getTrainingPrograms(): Promise<TrainingProgram[]> {
  const rows = await camelDb.selectFrom('dto.trainingProgram').selectAll().orderBy('name').execute()
  return rows.map(mapProgram)
}

export async function getTrainingProgramById(
  programId: string,
): Promise<TrainingProgram | undefined> {
  const r = await camelDb
    .selectFrom('dto.trainingProgram')
    .selectAll()
    .where('programId', '=', programId)
    .executeTakeFirst()
  return r ? mapProgram(r) : undefined
}

export async function insertTrainingProgram(
  data: TrainingProgramUpsert,
  userId: string,
): Promise<TrainingProgram> {
  const r = await camelDb
    .insertInto('dto.trainingProgram')
    .values({
      name: data.name,
      description: data.description ?? null,
      createdBy: userId,
      updatedBy: userId,
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
  const r = await camelDb
    .updateTable('dto.trainingProgram')
    .set({
      name: data.name,
      description: data.description ?? null,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where('programId', '=', programId)
    .returningAll()
    .executeTakeFirst()
  return r ? mapProgram(r) : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Syllabi
// ─────────────────────────────────────────────────────────────────────────────
export async function getSyllabiByProgram(programId: string): Promise<Syllabus[]> {
  const rows = await camelDb
    .selectFrom('dto.syllabus')
    .selectAll()
    .where('programId', '=', programId)
    .orderBy('majorVersion', 'desc')
    .orderBy('minorVersion', 'desc')
    .orderBy('patchVersion', 'desc')
    .execute()
  // List view only ever shows version/status/dates — skip markdown rendering
  // per row (mapSyllabus's `includeHtml=false`) rather than parsing markdown
  // for every historical syllabus version on every list load.
  return rows.map((r) => mapSyllabus(r, false))
}

export async function getSyllabusById(syllabusId: string): Promise<Syllabus | undefined> {
  const r = await camelDb
    .selectFrom('dto.syllabus')
    .selectAll()
    .where('syllabusId', '=', syllabusId)
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

export async function getSyllabusWithFlights(
  syllabusId: string,
): Promise<SyllabusWithFlights | undefined> {
  const syllabus = await getSyllabusById(syllabusId)
  if (!syllabus) return undefined

  const flightRows = await camelDb
    .selectFrom('dto.syllabusFlights')
    .selectAll()
    .where('syllabusId', '=', syllabusId)
    .orderBy('sortOrder')
    .execute()

  if (flightRows.length === 0) {
    return { ...syllabus, flights: [] }
  }

  const flightIds = flightRows.map((f) => f.flightId)
  const itemRows = await camelDb
    .selectFrom('dto.syllabusFlightItems')
    .selectAll()
    .where('syllabusFlightId', 'in', flightIds)
    .orderBy('syllabusFlightId')
    .orderBy('sortOrder')
    .execute()

  const itemsByFlight = new Map<string, SyllabusFlightItem[]>()
  for (const item of itemRows) {
    const list = itemsByFlight.get(item.syllabusFlightId) ?? []
    list.push(mapItem(item))
    itemsByFlight.set(item.syllabusFlightId, list)
  }

  const flights: SyllabusFlight[] = flightRows.map((f) => ({
    ...mapFlight(f),
    items: itemsByFlight.get(f.flightId) ?? [],
  }))

  return { ...syllabus, flights }
}

export async function getLatestPublishedSyllabus(programId: string): Promise<Syllabus | undefined> {
  const r = await camelDb
    .selectFrom('dto.syllabus')
    .selectAll()
    .where('programId', '=', programId)
    .where('status', '=', 'PUBLISHED')
    .orderBy('majorVersion', 'desc')
    .orderBy('minorVersion', 'desc')
    .orderBy('patchVersion', 'desc')
    .limit(1)
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

/** Compute next minor version for a program. */
async function nextMinorVersion(
  programId: string,
): Promise<{ majorVersion: number; minorVersion: number; patchVersion: number }> {
  const rows = await camelDb
    .selectFrom('dto.syllabus')
    .select(['majorVersion', 'minorVersion', 'patchVersion'])
    .where('programId', '=', programId)
    .orderBy('majorVersion', 'desc')
    .orderBy('minorVersion', 'desc')
    .orderBy('patchVersion', 'desc')
    .limit(1)
    .execute()

  if (rows.length === 0) {
    return { majorVersion: 1, minorVersion: 0, patchVersion: 0 }
  }
  const latest = rows[0]
  return {
    majorVersion: latest.majorVersion,
    minorVersion: latest.minorVersion + 1,
    patchVersion: 0,
  }
}

export async function insertSyllabus(
  programId: string,
  data: {
    description?: string | null
    requirementsExperienceCredit?: string | null
    generalInformation?: string | null
    minBlockTimeMins?: number | null
  },
  userId: string,
): Promise<Syllabus> {
  const version = await nextMinorVersion(programId)
  const r = await camelDb
    .insertInto('dto.syllabus')
    .values({
      programId: programId,
      majorVersion: version.majorVersion,
      minorVersion: version.minorVersion,
      patchVersion: version.patchVersion,
      description: data.description ?? null,
      requirementsExperienceCredit: data.requirementsExperienceCredit ?? null,
      generalInformation: data.generalInformation ?? null,
      minBlockTimeMins: data.minBlockTimeMins ?? null,
      status: 'DRAFT',
      createdBy: userId,
      updatedBy: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return mapSyllabus(r)
}

export async function updateSyllabus(
  syllabusId: string,
  data: {
    description?: string | null
    requirementsExperienceCredit?: string | null
    generalInformation?: string | null
    minBlockTimeMins?: number | null
  },
  userId: string,
): Promise<Syllabus | undefined> {
  let q = camelDb.updateTable('dto.syllabus').set({
    description: data.description ?? null,
    updatedBy: userId,
    updatedAt: new Date(),
  })
  if ('requirementsExperienceCredit' in data) {
    q = q.set({ requirementsExperienceCredit: data.requirementsExperienceCredit ?? null })
  }
  if ('generalInformation' in data) {
    q = q.set({ generalInformation: data.generalInformation ?? null })
  }
  if ('minBlockTimeMins' in data) {
    q = q.set({ minBlockTimeMins: data.minBlockTimeMins ?? null })
  }
  const r = await q
    .where('syllabusId', '=', syllabusId)
    .where('status', '=', 'DRAFT')
    .returningAll()
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

export async function submitSyllabusForApproval(
  syllabusId: string,
  userId: string,
): Promise<Syllabus | undefined> {
  const now = new Date()
  const r = await camelDb
    .updateTable('dto.syllabus')
    .set({
      status: 'WAITING_FOR_APPROVAL',
      submittedForApprovalAt: now,
      updatedBy: userId,
      updatedAt: now,
    })
    .where('syllabusId', '=', syllabusId)
    .where('status', '=', 'DRAFT')
    .returningAll()
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

export async function withdrawSyllabusFromApproval(
  syllabusId: string,
  userId: string,
): Promise<Syllabus | undefined> {
  const r = await camelDb
    .updateTable('dto.syllabus')
    .set({
      status: 'DRAFT',
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where('syllabusId', '=', syllabusId)
    .where('status', '=', 'WAITING_FOR_APPROVAL')
    .returningAll()
    .executeTakeFirst()
  return r ? mapSyllabus(r) : undefined
}

export async function publishSyllabus(
  syllabusId: string,
  userId: string,
  approvalReference?: string | null,
): Promise<Syllabus | undefined> {
  const now = new Date()

  const published = await camelDb.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('dto.syllabus')
      .set({
        status: 'PUBLISHED',
        publishedAt: now,
        approvalReference: approvalReference ?? null,
        updatedBy: userId,
        updatedAt: now,
      })
      .where('syllabusId', '=', syllabusId)
      .where('status', '=', 'WAITING_FOR_APPROVAL')
      .returningAll()
      .executeTakeFirst()

    if (!row) return undefined

    // Atomically auto-archive any other currently-PUBLISHED syllabus for the
    // same program. published_at is intentionally left untouched on the
    // archived row (see chk_dto_syllabus_published_at in V1370).
    await trx
      .updateTable('dto.syllabus')
      .set({ status: 'ARCHIVED', updatedBy: userId, updatedAt: now })
      .where('programId', '=', row.programId)
      .where('syllabusId', '!=', syllabusId)
      .where('status', '=', 'PUBLISHED')
      .execute()

    return row
  })

  return published ? mapSyllabus(published) : undefined
}

/**
 * Typo-fix flow: edits text fields (syllabus description / general info /
 * requirements, flight name/description, item name/description) in place on
 * an already-PUBLISHED syllabus, bumping patch_version as an audit signal.
 * Uses targeted per-row UPDATEs keyed by existing IDs — never delete/reinsert
 * — because live syllabus_flight_attempts/flight_item_outcomes/hil_queue rows
 * hold FKs to these exact flight_id/item_id values.
 */
export async function patchSyllabusText(
  syllabusId: string,
  data: SyllabusTextPatch,
  userId: string,
): Promise<SyllabusWithFlights | undefined> {
  const now = new Date()

  const patched = await camelDb.transaction().execute(async (trx) => {
    // Updateable<> rather than Record<string, unknown>: an untyped patch object is
    // the same trap as `any` — it hides column names from the compiler, and two of
    // these were still snake_case after the migration.
    const syllabusPatch: Updateable<DtoSyllabus> = { updatedBy: userId, updatedAt: now }
    if ('description' in data) syllabusPatch.description = data.description ?? null
    if ('requirementsExperienceCredit' in data) {
      syllabusPatch.requirementsExperienceCredit = data.requirementsExperienceCredit ?? null
    }
    if ('generalInformation' in data) {
      syllabusPatch.generalInformation = data.generalInformation ?? null
    }

    const row = await trx
      .updateTable('dto.syllabus')
      .set((eb) => ({ ...syllabusPatch, patchVersion: eb('patchVersion', '+', 1) }))
      .where('syllabusId', '=', syllabusId)
      .where('status', '=', 'PUBLISHED')
      .returning('syllabusId')
      .executeTakeFirst()

    if (!row) return false

    // Pre-fetch which flight IDs actually belong to this syllabus so a stray
    // flightId/itemId referencing a different syllabus can never be written
    // to, even if the flight-level patch below is skipped (e.g. only item
    // text was submitted for that flight).
    const ownFlightRows = await trx
      .selectFrom('dto.syllabusFlights')
      .select('flightId')
      .where('syllabusId', '=', syllabusId)
      .execute()
    const ownFlightIds = new Set(ownFlightRows.map((r) => r.flightId))

    for (const f of data.flights ?? []) {
      if (!ownFlightIds.has(f.flightId)) continue

      const flightPatch: Updateable<DtoSyllabusFlights> = {}
      if (f.name !== undefined) flightPatch.name = f.name
      if ('description' in f) flightPatch.description = f.description ?? null
      if (Object.keys(flightPatch).length > 0) {
        await trx
          .updateTable('dto.syllabusFlights')
          .set({ ...flightPatch, updatedAt: now })
          .where('flightId', '=', f.flightId)
          .where('syllabusId', '=', syllabusId)
          .execute()
      }
      for (const it of f.items ?? []) {
        const itemPatch: Updateable<DtoSyllabusFlightItems> = {}
        if (it.name !== undefined) itemPatch.name = it.name
        if ('description' in it) itemPatch.description = it.description ?? null
        if (Object.keys(itemPatch).length > 0) {
          await trx
            .updateTable('dto.syllabusFlightItems')
            .set(itemPatch)
            .where('itemId', '=', it.itemId)
            .where('syllabusFlightId', '=', f.flightId)
            .execute()
        }
      }
    }
    return true
  })

  if (!patched) return undefined
  return getSyllabusWithFlights(syllabusId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Syllabus Flights
// ─────────────────────────────────────────────────────────────────────────────
export async function getFlightsBySyllabus(syllabusId: string): Promise<SyllabusFlight[]> {
  const rows = await camelDb
    .selectFrom('dto.syllabusFlights')
    .selectAll()
    .where('syllabusId', '=', syllabusId)
    .orderBy('sortOrder')
    .execute()
  return rows.map(mapFlight)
}

export async function getSyllabusFlightById(flightId: string): Promise<SyllabusFlight | undefined> {
  const r = await camelDb
    .selectFrom('dto.syllabusFlights')
    .selectAll()
    .where('flightId', '=', flightId)
    .executeTakeFirst()
  return r ? mapFlight(r) : undefined
}

export async function getSyllabusFlightWithItems(
  flightId: string,
): Promise<SyllabusFlight | undefined> {
  const r = await camelDb
    .selectFrom('dto.syllabusFlights')
    .selectAll()
    .where('flightId', '=', flightId)
    .executeTakeFirst()
  if (!r) return undefined

  const itemRows = await camelDb
    .selectFrom('dto.syllabusFlightItems')
    .selectAll()
    .where('syllabusFlightId', '=', flightId)
    .orderBy('sortOrder')
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
    flightType?: FlightType | null
    easaFclReference?: string | null
    items?: Array<{ name: string; description?: string | null; mandatory: boolean }>
  }>,
): Promise<void> {
  // Delete all existing flights for this syllabus (cascades to items)
  await camelDb.deleteFrom('dto.syllabusFlights').where('syllabusId', '=', syllabusId).execute()

  for (let i = 0; i < flights.length; i++) {
    const f = flights[i]
    const flightRow = await camelDb
      .insertInto('dto.syllabusFlights')
      .values({
        syllabusId: syllabusId,
        sortOrder: i + 1,
        code: f.code,
        name: f.name,
        description: f.description ?? null,
        tags: f.tags ?? [],
        isInterimCheckpoint: f.isInterimCheckpoint ?? false,
        recommendedBlockTimeMins: f.recommendedBlockTimeMins ?? null,
        flightType: f.flightType ?? null,
        easaFclReference: f.easaFclReference ?? null,
      })
      .returning('flightId')
      .executeTakeFirstOrThrow()

    if (f.items && f.items.length > 0) {
      await camelDb
        .insertInto('dto.syllabusFlightItems')
        .values(
          f.items.map((item, j) => ({
            syllabusFlightId: flightRow.flightId,
            sortOrder: j + 1,
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

  const syllabusRow = await camelDb
    .insertInto('dto.syllabus')
    .values({
      programId: programId,
      majorVersion: version.majorVersion,
      minorVersion: version.minorVersion,
      patchVersion: version.patchVersion,
      description: importData.description ?? null,
      requirementsExperienceCredit: importData.requirementsExperienceCredit ?? null,
      generalInformation: importData.generalInformation ?? null,
      minBlockTimeMins: importData.minBlockTimeMins ?? null,
      status: 'DRAFT',
      createdBy: userId,
      updatedBy: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const syllabus = mapSyllabus(syllabusRow)

  await upsertSyllabusFlights(
    syllabus.syllabusId,
    importData.flights.map((f) => ({
      code: f.code,
      name: f.name,
      description: f.description,
      tags: f.tags,
      isInterimCheckpoint: f.isInterimCheckpoint,
      recommendedBlockTimeMins: f.recommendedBlockTimeMins,
      flightType: f.flightType,
      easaFclReference: f.easaFclReference,
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
  const r = await camelDb
    .selectFrom('dto.memberSyllabus')
    .selectAll()
    .where('memberId', '=', memberId)
    .where('isActive', '=', true)
    .executeTakeFirst()
  if (!r) return undefined
  return {
    memberSyllabusId: r.memberSyllabusId,
    memberId: r.memberId,
    syllabusId: r.syllabusId,
    isActive: r.isActive,
    assignedAt: toIso(r.assignedAt),
    assignedBy: r.assignedBy,
    deactivatedAt: toIsoNullable(r.deactivatedAt),
  }
}

export async function assignSyllabusToMember(
  memberId: string,
  syllabusId: string,
  assignedBy: string,
): Promise<MemberSyllabus> {
  const r = await camelDb
    .insertInto('dto.memberSyllabus')
    .values({
      memberId: memberId,
      syllabusId: syllabusId,
      assignedBy: assignedBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return {
    memberSyllabusId: r.memberSyllabusId,
    memberId: r.memberId,
    syllabusId: r.syllabusId,
    isActive: r.isActive,
    assignedAt: toIso(r.assignedAt),
    assignedBy: r.assignedBy,
    deactivatedAt: toIsoNullable(r.deactivatedAt),
  }
}

export async function getMemberSyllabusByIdWithFlights(
  memberSyllabusId: string,
): Promise<
  | (MemberSyllabus & { memberName: string; syllabusDetail: SyllabusWithFlights | undefined })
  | undefined
> {
  const r = await camelDb
    .selectFrom('dto.memberSyllabus')
    .innerJoin('member.register', 'member.register.memberId', 'dto.memberSyllabus.memberId')
    .select([
      'dto.memberSyllabus.memberSyllabusId',
      'dto.memberSyllabus.memberId',
      'dto.memberSyllabus.syllabusId',
      'dto.memberSyllabus.isActive',
      'dto.memberSyllabus.assignedAt',
      'dto.memberSyllabus.assignedBy',
      'dto.memberSyllabus.deactivatedAt',
      'member.register.firstName',
      'member.register.lastName',
    ])
    .where('dto.memberSyllabus.memberSyllabusId', '=', memberSyllabusId)
    .executeTakeFirst()
  if (!r) return undefined
  const syllabusDetail = await getSyllabusWithFlights(r.syllabusId)
  return {
    memberSyllabusId: r.memberSyllabusId,
    memberId: r.memberId,
    syllabusId: r.syllabusId,
    isActive: r.isActive,
    assignedAt: toIso(r.assignedAt),
    assignedBy: r.assignedBy,
    deactivatedAt: toIsoNullable(r.deactivatedAt),
    memberName: `${r.firstName} ${r.lastName}`,
    syllabusDetail,
  }
}

export async function getMemberSyllabusOwnerId(
  memberSyllabusId: string,
): Promise<string | undefined> {
  const r = await camelDb
    .selectFrom('dto.memberSyllabus')
    .select('memberId')
    .where('memberSyllabusId', '=', memberSyllabusId)
    .executeTakeFirst()
  return r?.memberId
}

// ─────────────────────────────────────────────────────────────────────────────
// Flight Attempts
// ─────────────────────────────────────────────────────────────────────────────
export async function getAttemptByFlightLogId(
  flightLogId: string,
): Promise<SyllabusFlightAttempt | undefined> {
  const r = await camelDb
    .selectFrom('dto.syllabusFlightAttempts')
    .selectAll()
    .where('flightLogId', '=', flightLogId)
    .executeTakeFirst()
  return r ? mapAttempt(r) : undefined
}

export async function getAttemptById(
  attemptId: string,
): Promise<SyllabusFlightAttempt | undefined> {
  const r = await camelDb
    .selectFrom('dto.syllabusFlightAttempts')
    .selectAll()
    .where('attemptId', '=', attemptId)
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
  const r = await camelDb
    .selectFrom('dto.syllabusFlightAttempts')
    .innerJoin('flight.logs', 'flight.logs.flightId', 'dto.syllabusFlightAttempts.flightLogId')
    .leftJoin('member.register as v', 'v.memberId', 'dto.syllabusFlightAttempts.verifiedBy')
    .select([
      'dto.syllabusFlightAttempts.attemptId',
      'dto.syllabusFlightAttempts.flightLogId',
      'dto.syllabusFlightAttempts.syllabusFlightId',
      'dto.syllabusFlightAttempts.memberSyllabusId',
      'dto.syllabusFlightAttempts.instructorMemberId',
      'dto.syllabusFlightAttempts.instructorComments',
      'dto.syllabusFlightAttempts.verificationResult',
      'dto.syllabusFlightAttempts.verifiedAt',
      'dto.syllabusFlightAttempts.verifiedBy',
      'dto.syllabusFlightAttempts.requiresReverification',
      'dto.syllabusFlightAttempts.createdAt',
      'dto.syllabusFlightAttempts.updatedAt',
      'flight.logs.offBlockTimeUtc',
      'flight.logs.onBlockTimeUtc',
      'flight.logs.takeoffTimeUtc',
      'flight.logs.landingTimeUtc',
      'flight.logs.blockTime',
      'flight.logs.flightTime',
      'flight.logs.departureAirport',
      'flight.logs.arrivalAirport',
      'flight.logs.numberOfLandings',
      'v.firstName as verifierFirstName',
      'v.lastName as verifierLastName',
    ])
    .where('dto.syllabusFlightAttempts.attemptId', '=', attemptId)
    .executeTakeFirst()

  if (!r) return undefined

  return {
    ...mapAttempt(r),
    flightDate: toIso(r.offBlockTimeUtc).substring(0, 10),
    offBlockTimeUtc: toIso(r.offBlockTimeUtc),
    onBlockTimeUtc: toIso(r.onBlockTimeUtc),
    takeoffTimeUtc: toIso(r.takeoffTimeUtc),
    landingTimeUtc: toIso(r.landingTimeUtc),
    blockTime: r.blockTime,
    flightTime: r.flightTime,
    departureAirport: r.departureAirport,
    arrivalAirport: r.arrivalAirport,
    numberOfLandings: r.numberOfLandings,
  }
}

export async function copySyllabusAsDraft(
  syllabusId: string,
  userId: string,
): Promise<SyllabusWithFlights | undefined> {
  const source = await getSyllabusWithFlights(syllabusId)
  if (!source) return undefined

  const version = await nextMinorVersion(source.programId)

  const newRow = await camelDb
    .insertInto('dto.syllabus')
    .values({
      programId: source.programId,
      majorVersion: version.majorVersion,
      minorVersion: version.minorVersion,
      patchVersion: version.patchVersion,
      description: source.description ?? null,
      requirementsExperienceCredit: source.requirementsExperienceCredit ?? null,
      generalInformation: source.generalInformation ?? null,
      minBlockTimeMins: source.minBlockTimeMins ?? null,
      status: 'DRAFT',
      createdBy: userId,
      updatedBy: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const newSyllabus = mapSyllabus(newRow)

  await upsertSyllabusFlights(
    newSyllabus.syllabusId,
    (source.flights ?? []).map((f) => ({
      code: f.code,
      name: f.name,
      description: f.description,
      tags: f.tags,
      isInterimCheckpoint: f.isInterimCheckpoint,
      recommendedBlockTimeMins: f.recommendedBlockTimeMins,
      flightType: f.flightType,
      easaFclReference: f.easaFclReference,
      items: (f.items ?? []).map((i) => ({
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
  const rows = await camelDb
    .selectFrom('dto.syllabusFlightAttempts')
    .selectAll()
    .where('memberSyllabusId', '=', memberSyllabusId)
    .orderBy('createdAt', 'desc')
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
  const rows = await camelDb
    .selectFrom('dto.syllabusFlightAttempts')
    .innerJoin('flight.logs', 'flight.logs.flightId', 'dto.syllabusFlightAttempts.flightLogId')
    .select([
      'dto.syllabusFlightAttempts.attemptId',
      'dto.syllabusFlightAttempts.flightLogId',
      'dto.syllabusFlightAttempts.syllabusFlightId',
      'dto.syllabusFlightAttempts.memberSyllabusId',
      'dto.syllabusFlightAttempts.instructorMemberId',
      'dto.syllabusFlightAttempts.instructorComments',
      'dto.syllabusFlightAttempts.verificationResult',
      'dto.syllabusFlightAttempts.verifiedAt',
      'dto.syllabusFlightAttempts.verifiedBy',
      'dto.syllabusFlightAttempts.requiresReverification',
      'dto.syllabusFlightAttempts.createdAt',
      'dto.syllabusFlightAttempts.updatedAt',
      'flight.logs.offBlockTimeUtc',
      'flight.logs.onBlockTimeUtc',
      'flight.logs.blockTime',
      'flight.logs.flightTime',
    ])
    .where('dto.syllabusFlightAttempts.memberSyllabusId', '=', memberSyllabusId)
    .orderBy('dto.syllabusFlightAttempts.createdAt', 'desc')
    .execute()

  return rows.map((r) => ({
    ...mapAttempt(r),
    flightDate: toIso(r.offBlockTimeUtc).substring(0, 10),
    offBlockTimeUtc: toIso(r.offBlockTimeUtc),
    onBlockTimeUtc: toIso(r.onBlockTimeUtc),
    blockTime: r.blockTime,
    flightTime: r.flightTime,
  }))
}

export type PendingVerificationItem = SyllabusFlightAttempt & {
  memberName: string
  syllabusFlightCode: string
  syllabusFlightName: string
}

export async function getPendingVerifications(): Promise<PendingVerificationItem[]> {
  const rows = await camelDb
    .selectFrom('dto.syllabusFlightAttempts')
    .innerJoin(
      'dto.memberSyllabus',
      'dto.memberSyllabus.memberSyllabusId',
      'dto.syllabusFlightAttempts.memberSyllabusId',
    )
    .innerJoin('member.register', 'member.register.memberId', 'dto.memberSyllabus.memberId')
    .innerJoin(
      'dto.syllabusFlights',
      'dto.syllabusFlights.flightId',
      'dto.syllabusFlightAttempts.syllabusFlightId',
    )
    .select([
      'dto.syllabusFlightAttempts.attemptId',
      'dto.syllabusFlightAttempts.flightLogId',
      'dto.syllabusFlightAttempts.syllabusFlightId',
      'dto.syllabusFlightAttempts.memberSyllabusId',
      'dto.syllabusFlightAttempts.instructorMemberId',
      'dto.syllabusFlightAttempts.instructorComments',
      'dto.syllabusFlightAttempts.verificationResult',
      'dto.syllabusFlightAttempts.verifiedAt',
      'dto.syllabusFlightAttempts.verifiedBy',
      'dto.syllabusFlightAttempts.requiresReverification',
      'dto.syllabusFlightAttempts.createdAt',
      'dto.syllabusFlightAttempts.updatedAt',
      'member.register.firstName',
      'member.register.lastName',
      'dto.syllabusFlights.code as flightCode',
      'dto.syllabusFlights.name as flightName',
    ])
    .where((eb) =>
      eb.or([
        eb('dto.syllabusFlightAttempts.verificationResult', 'is', null),
        eb('dto.syllabusFlightAttempts.requiresReverification', '=', true),
      ]),
    )
    .orderBy('dto.syllabusFlightAttempts.createdAt')
    .execute()

  return rows.map((r) => ({
    ...mapAttempt(r),
    memberName: `${r.firstName} ${r.lastName}`,
    syllabusFlightCode: r.flightCode,
    syllabusFlightName: r.flightName,
  }))
}

export async function getPendingVerificationsCount(): Promise<number> {
  const r = await camelDb
    .selectFrom('dto.syllabusFlightAttempts')
    .select((eb) => eb.fn.count('attemptId').as('count'))
    .where((eb) =>
      eb.or([eb('verificationResult', 'is', null), eb('requiresReverification', '=', true)]),
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
  const r = await camelDb
    .insertInto('dto.syllabusFlightAttempts')
    .values({
      flightLogId: flightLogId,
      syllabusFlightId: syllabusFlightId,
      memberSyllabusId: memberSyllabusId,
      instructorMemberId: instructorMemberId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  // Mark the flight log entry as a DTO training flight (used for invoicing)
  await camelDb
    .updateTable('flight.logs')
    .set({ isDtoTrainingFlight: true })
    .where('flightId', '=', flightLogId)
    .execute()

  return mapAttempt(r)
}

export async function updateAttemptSyllabusFlight(
  flightLogId: string,
  syllabusFlightId: string,
): Promise<SyllabusFlightAttempt | undefined> {
  const r = await camelDb
    .updateTable('dto.syllabusFlightAttempts')
    .set({ syllabusFlightId: syllabusFlightId, updatedAt: new Date() })
    .where('flightLogId', '=', flightLogId)
    .where('verificationResult', 'is', null)
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

  const r = await camelDb
    .updateTable('dto.syllabusFlightAttempts')
    .set({
      verificationResult: data.result,
      verifiedAt: now,
      verifiedBy: verifiedBy,
      instructorComments: data.instructorComments ?? null,
      requiresReverification: false,
      updatedAt: now,
    })
    .where('attemptId', '=', attemptId)
    .where((eb) =>
      eb.or([eb('verificationResult', 'is', null), eb('requiresReverification', '=', true)]),
    )
    .returningAll()
    .executeTakeFirst()

  if (!r) return undefined

  // Upsert item outcomes
  if (data.itemOutcomes && data.itemOutcomes.length > 0) {
    for (const o of data.itemOutcomes) {
      await camelDb
        .insertInto('dto.flightItemOutcomes')
        .values({
          attemptId: attemptId,
          itemId: o.itemId,
          outcome: o.outcome,
          remarks: o.remarks ?? null,
        })
        .onConflict((oc) =>
          oc.columns(['attemptId', 'itemId']).doUpdateSet({
            outcome: o.outcome,
            remarks: o.remarks ?? null,
            updatedAt: now,
          }),
        )
        .execute()

      // If outcome is MOVED_TO_HIL, add to HIL queue (if not already open)
      if (o.outcome === 'MOVED_TO_HIL') {
        const memberSyllabus = await camelDb
          .selectFrom('dto.syllabusFlightAttempts')
          .innerJoin(
            'dto.memberSyllabus',
            'dto.memberSyllabus.memberSyllabusId',
            'dto.syllabusFlightAttempts.memberSyllabusId',
          )
          .select(['dto.memberSyllabus.memberId', 'dto.memberSyllabus.syllabusId'])
          .where('dto.syllabusFlightAttempts.attemptId', '=', attemptId)
          .executeTakeFirst()

        if (memberSyllabus) {
          // Check if there's already an open HIL entry for this member+item
          const existingHil = await camelDb
            .selectFrom('dto.hilQueue')
            .select('hilId')
            .where('memberId', '=', memberSyllabus.memberId)
            .where('itemId', '=', o.itemId)
            .where('resolvedAt', 'is', null)
            .executeTakeFirst()

          if (!existingHil) {
            await camelDb
              .insertInto('dto.hilQueue')
              .values({
                memberId: memberSyllabus.memberId,
                syllabusId: memberSyllabus.syllabusId,
                itemId: o.itemId,
                openedOnAttemptId: attemptId,
              })
              .execute()
          }
        }
      }

      // If outcome resolves a HIL entry, close it
      if (o.outcome === 'COMPLETED' || o.outcome === 'FAILED') {
        const memberSyllabus = await camelDb
          .selectFrom('dto.syllabusFlightAttempts')
          .innerJoin(
            'dto.memberSyllabus',
            'dto.memberSyllabus.memberSyllabusId',
            'dto.syllabusFlightAttempts.memberSyllabusId',
          )
          .select('dto.memberSyllabus.memberId')
          .where('dto.syllabusFlightAttempts.attemptId', '=', attemptId)
          .executeTakeFirst()

        if (memberSyllabus) {
          await camelDb
            .updateTable('dto.hilQueue')
            .set({
              resolvedAt: now,
              resolvedOnAttemptId: attemptId,
              resolutionOutcome: o.outcome,
            })
            .where('memberId', '=', memberSyllabus.memberId)
            .where('itemId', '=', o.itemId)
            .where('resolvedAt', 'is', null)
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
  await camelDb
    .updateTable('dto.syllabusFlightAttempts')
    .set({ requiresReverification: true, updatedAt: new Date() })
    .where('flightLogId', '=', flightLogId)
    .where('verificationResult', 'is not', null)
    .execute()
}

// ─────────────────────────────────────────────────────────────────────────────
// Item Outcomes
// ─────────────────────────────────────────────────────────────────────────────
export async function getItemOutcomesByAttempt(attemptId: string): Promise<FlightItemOutcome[]> {
  const rows = await camelDb
    .selectFrom('dto.flightItemOutcomes')
    .selectAll()
    .where('attemptId', '=', attemptId)
    .execute()
  return rows.map((r) => ({
    attemptId: r.attemptId,
    itemId: r.itemId,
    outcome: r.outcome as FlightItemOutcome['outcome'],
    remarks: r.remarks,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }))
}

export async function getItemOutcomesByAttempts(
  attemptIds: string[],
): Promise<Map<string, FlightItemOutcome[]>> {
  if (attemptIds.length === 0) return new Map()
  const rows = await camelDb
    .selectFrom('dto.flightItemOutcomes')
    .selectAll()
    .where('attemptId', 'in', attemptIds)
    .execute()
  const grouped = new Map<string, FlightItemOutcome[]>()
  for (const r of rows) {
    const outcome: FlightItemOutcome = {
      attemptId: r.attemptId,
      itemId: r.itemId,
      outcome: r.outcome as FlightItemOutcome['outcome'],
      remarks: r.remarks,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    }
    const list = grouped.get(r.attemptId) ?? []
    list.push(outcome)
    grouped.set(r.attemptId, list)
  }
  return grouped
}

// ─────────────────────────────────────────────────────────────────────────────
// HIL Queue
// ─────────────────────────────────────────────────────────────────────────────
export async function getOpenHilForMember(memberId: string): Promise<HilEntry[]> {
  const rows = await camelDb
    .selectFrom('dto.hilQueue')
    .selectAll()
    .where('memberId', '=', memberId)
    .where('resolvedAt', 'is', null)
    .orderBy('openedAt')
    .execute()
  return rows.map((r) => ({
    hilId: r.hilId,
    memberId: r.memberId,
    syllabusId: r.syllabusId,
    itemId: r.itemId,
    openedOnAttemptId: r.openedOnAttemptId,
    openedAt: toIso(r.openedAt),
    resolvedOnAttemptId: r.resolvedOnAttemptId,
    resolvedAt: toIsoNullable(r.resolvedAt),
    resolutionOutcome: r.resolutionOutcome as HilEntry['resolutionOutcome'],
    notes: r.notes,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────
export async function getStudentProgress(): Promise<StudentProgress[]> {
  // Get all active member syllabus assignments with member names and syllabus info
  const rows = await camelDb
    .selectFrom('dto.memberSyllabus')
    .innerJoin('member.register', 'member.register.memberId', 'dto.memberSyllabus.memberId')
    .innerJoin('dto.syllabus', 'dto.syllabus.syllabusId', 'dto.memberSyllabus.syllabusId')
    .innerJoin('dto.trainingProgram', 'dto.trainingProgram.programId', 'dto.syllabus.programId')
    .select([
      'dto.memberSyllabus.memberId',
      'dto.memberSyllabus.memberSyllabusId',
      'dto.memberSyllabus.syllabusId',
      'dto.trainingProgram.name as programName',
      'dto.syllabus.version',
      'dto.syllabus.minBlockTimeMins',
      'member.register.firstName',
      'member.register.lastName',
    ])
    .where('dto.memberSyllabus.isActive', '=', true)
    .execute()

  const results: StudentProgress[] = []

  for (const row of rows) {
    // Get syllabus flights count
    const flightCountRow = await camelDb
      .selectFrom('dto.syllabusFlights')
      .select((eb) => eb.fn.count('flightId').as('count'))
      .where('syllabusId', '=', row.syllabusId)
      .executeTakeFirstOrThrow()
    const totalFlights = Number(flightCountRow.count)

    // Get completed flight attempts for this member's syllabus
    const completedRows = await camelDb
      .selectFrom('dto.syllabusFlightAttempts')
      .select(['syllabusFlightId', 'createdAt'])
      .where('memberSyllabusId', '=', row.memberSyllabusId)
      .where('verificationResult', '=', 'APPROVED')
      .execute()

    // Count distinct syllabus flights that have been approved
    const completedFlightIds = new Set(completedRows.map((r) => r.syllabusFlightId))
    const completedFlights = completedFlightIds.size

    // Sum block minutes from all approved attempts
    const blockTimeSumRow = await camelDb
      .selectFrom('dto.syllabusFlightAttempts')
      .innerJoin('flight.logs', 'flight.logs.flightId', 'dto.syllabusFlightAttempts.flightLogId')
      .select((eb) => eb.fn.sum<number>('flight.logs.blockMins').as('totalBlockMins'))
      .where('dto.syllabusFlightAttempts.memberSyllabusId', '=', row.memberSyllabusId)
      .where('dto.syllabusFlightAttempts.verificationResult', '=', 'APPROVED')
      .executeTakeFirst()
    const totalBlockTimeMins = Number(blockTimeSumRow?.totalBlockMins ?? 0)

    // Last DTO flight date
    const lastAttemptRow = await camelDb
      .selectFrom('dto.syllabusFlightAttempts')
      .select('createdAt')
      .where('memberSyllabusId', '=', row.memberSyllabusId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst()

    // Check interim checkpoint
    const interimFlightRow = await camelDb
      .selectFrom('dto.syllabusFlights')
      .select('flightId')
      .where('syllabusId', '=', row.syllabusId)
      .where('isInterimCheckpoint', '=', true)
      .executeTakeFirst()

    let interimCheckpointCompleted = false
    if (interimFlightRow) {
      interimCheckpointCompleted = completedFlightIds.has(interimFlightRow.flightId)
    }

    const minBlockTimeMins = row.minBlockTimeMins ?? null
    const meetsTimeRequirement = minBlockTimeMins === null || totalBlockTimeMins >= minBlockTimeMins

    results.push({
      memberId: row.memberId,
      memberName: `${row.firstName} ${row.lastName}`,
      memberSyllabusId: row.memberSyllabusId,
      syllabusId: row.syllabusId,
      syllabusTitle: row.programName,
      syllabusVersion: row.version,
      totalFlights,
      completedFlights,
      lastDtoFlightDate: lastAttemptRow ? toIso(lastAttemptRow.createdAt) : null,
      interimCheckpointCompleted,
      totalBlockTimeMins,
      minBlockTimeMins,
      meetsTimeRequirement,
    })
  }

  return results
}
