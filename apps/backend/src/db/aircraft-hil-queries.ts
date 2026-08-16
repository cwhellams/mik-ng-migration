import { auditCreate, auditUpdate, mapAudit } from './audit.ts'
import { sql, type Kysely } from 'kysely'

import * as connection from './connection.ts'
import type { DbRow } from './connection.ts'
import type { DB } from './schema.d.ts'
import type {
  AircraftHil,
  AircraftHilAuditEntry,
  AircraftHilDetail,
  AircraftHilExtension,
  AircraftHilOverview,
  CreateAircraftHilRequest,
  UpdateAircraftHilRequest,
  CreateAircraftHilExtensionRequest,
  HilLinkedDefect,
} from '@mik/contracts/aircraft-hil'
import type { DefectStatus } from '@mik/contracts/defects'
import { problem } from '../routes/response.ts'

function mapRowToHil(row: DbRow<'flight.aircraftHil'> & { name: string }): AircraftHil {
  return {
    hilId: row.hilId,
    aircraftRegistration: row.aircraftRegistration,
    hilNumber: row.hilNumber,
    sourceRef: row.sourceRef,
    defectCat: row.defectCat,
    description: row.description,
    restrictions: row.restrictions,
    openDate: row.openDate.toISOString(),
    name: row.name,
    dueDate: row.dueDate?.toISOString() ?? null,
    resolvedNoteId: row.resolvedNoteId,
    ...mapAudit(row),
  }
}

function mapRowToExtension(
  row: DbRow<'flight.aircraftHilExtension'> & { name: string },
): AircraftHilExtension {
  return {
    extensionId: row.extensionId,
    hilId: row.hilId,
    extensionDate: row.extensionDate.toISOString(),
    name: row.name,
    extensionDue: row.extensionDue.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  }
}

export async function getAircraftHilEntries(aircraftRegistration: string): Promise<AircraftHil[]> {
  const rows = await connection.db
    .selectFrom('flight.aircraftHil')
    .selectAll()
    .where('aircraftRegistration', '=', aircraftRegistration)
    .orderBy('hilNumber', 'asc')
    .execute()

  return rows.map(mapRowToHil)
}

export async function getAircraftHilEntry(hilId: string): Promise<AircraftHil | undefined> {
  const row = await connection.db
    .selectFrom('flight.aircraftHil')
    .selectAll()
    .where('hilId', '=', hilId)
    .executeTakeFirst()

  return row ? mapRowToHil(row) : undefined
}

export async function createAircraftHilEntry(
  data: CreateAircraftHilRequest,
  createdBy: string,
): Promise<AircraftHil> {
  const now = new Date()

  // When no number is given, take the next free one for the aircraft. Resolving
  // it inside the INSERT keeps concurrent creations from picking the same number.
  const hilNumber =
    data.hilNumber ??
    sql<number>`(SELECT COALESCE(MAX(hil_number), 0) + 1 FROM flight.aircraft_hil WHERE aircraft_registration = ${data.aircraftRegistration})`

  try {
    return await connection.db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto('flight.aircraftHil')
        .values({
          aircraftRegistration: data.aircraftRegistration,
          hilNumber,
          sourceRef: data.sourceRef ?? null,
          defectCat: data.defectCat ?? null,
          description: data.description,
          restrictions: data.restrictions ?? null,
          openDate: new Date(data.openDate),
          name: data.name,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          resolvedNoteId: null,
          ...auditCreate(createdBy, now),
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      // Defer the originating defect to the entry we just created. The
      // status = 'ACTIVE' guard re-checks the precondition the route already
      // validated, but atomically this time: if a concurrent request already
      // deferred (or resolved) this same defect first, this UPDATE affects no
      // rows and the transaction rolls back instead of creating an orphaned
      // HIL entry. Verifying a row was actually updated also catches a
      // mismatched/invalid defectId the same way.
      if (data.defectId) {
        const updateResult = await trx
          .updateTable('flight.defect')
          .set({
            hilId: row.hilId,
            status: 'MOVED_TO_HIL',
            ...auditUpdate(createdBy, now),
          })
          .where('defectId', '=', data.defectId)
          .where('aircraftRegistration', '=', data.aircraftRegistration)
          .where('status', '=', 'ACTIVE')
          .executeTakeFirst()

        if (!updateResult || updateResult.numUpdatedRows === 0n) {
          return problem({
            status: 400,
            detail: 'Defect not found for this aircraft, or no longer active',
          })
        }
      }

      return mapRowToHil(row)
    })
  } catch (error: any) {
    if (error.code === '23505') {
      return problem({ status: 409, detail: 'That hold item number is already in use' })
    }
    throw error
  }
}

export async function updateAircraftHilEntry(
  hilId: string,
  data: UpdateAircraftHilRequest,
  updatedBy: string,
  executor: Kysely<DB> = connection.db,
): Promise<AircraftHil | undefined> {
  try {
    const row = await executor
      .updateTable('flight.aircraftHil')
      .set({
        ...(data.hilNumber !== undefined && { hilNumber: data.hilNumber }),
        ...(data.sourceRef !== undefined && { sourceRef: data.sourceRef }),
        ...(data.defectCat !== undefined && { defectCat: data.defectCat }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.restrictions !== undefined && { restrictions: data.restrictions }),
        ...(data.openDate !== undefined && { openDate: new Date(data.openDate) }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.dueDate !== undefined && {
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        }),
        ...(data.resolvedNoteId !== undefined && { resolvedNoteId: data.resolvedNoteId }),
        updatedAt: new Date(),
        updatedBy,
      })
      .where('hilId', '=', hilId)
      .returningAll()
      .executeTakeFirst()

    return row ? mapRowToHil(row) : undefined
  } catch (error: any) {
    if (error.code === '23505') {
      return problem({ status: 409, detail: 'That hold item number is already in use' })
    }
    throw error
  }
}

export async function getAircraftHilExtensions(hilId: string): Promise<AircraftHilExtension[]> {
  const rows = await connection.db
    .selectFrom('flight.aircraftHilExtension')
    .selectAll()
    .where('hilId', '=', hilId)
    .orderBy('extensionDate', 'asc')
    .execute()

  return rows.map(mapRowToExtension)
}

export async function createAircraftHilExtension(
  hilId: string,
  data: CreateAircraftHilExtensionRequest,
  createdBy: string,
): Promise<AircraftHilExtension> {
  const row = await connection.db
    .insertInto('flight.aircraftHilExtension')
    .values({
      hilId,
      extensionDate: new Date(data.extensionDate),
      name: data.name,
      extensionDue: new Date(data.extensionDue),
      createdAt: new Date(),
      createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRowToExtension(row)
}

export async function getAircraftHilAudit(hilId: string): Promise<AircraftHilAuditEntry[]> {
  const hilRows = await connection.db
    .selectFrom('flight.aircraftHilAudit')
    .selectAll()
    .where('hilId', '=', hilId)
    .execute()

  // Extensions are audited in their own table; surface them here too so the
  // "change history" for a hold item shows when its due date was extended.
  const extensionRows = await connection.db
    .selectFrom('flight.aircraftHilExtensionAudit')
    .innerJoin(
      'flight.aircraftHilExtension',
      'flight.aircraftHilExtension.extensionId',
      'flight.aircraftHilExtensionAudit.extensionId',
    )
    .select([
      'flight.aircraftHilExtensionAudit.auditId',
      'flight.aircraftHilExtensionAudit.operationType',
      'flight.aircraftHilExtensionAudit.changedData',
      'flight.aircraftHilExtensionAudit.newData',
      'flight.aircraftHilExtensionAudit.changedBy',
      'flight.aircraftHilExtensionAudit.changedAt',
    ])
    .where('flight.aircraftHilExtension.hilId', '=', hilId)
    .execute()

  const entries: AircraftHilAuditEntry[] = [
    ...hilRows.map((row) => ({
      auditId: row.auditId,
      hilId: row.hilId,
      operationType: row.operationType,
      changedData: row.changedData ?? null,
      newData: row.newData ?? null,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
    })),
    ...extensionRows.map((row) => ({
      auditId: row.auditId,
      hilId,
      operationType: `EXTENSION_${row.operationType}`,
      changedData: row.changedData ?? null,
      newData: row.newData ?? null,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
    })),
  ]

  return entries.sort((a, b) => b.changedAt.localeCompare(a.changedAt))
}

/**
 * Hold Item List per aircraft, with each entry's extensions, effective due date
 * and the flight-log defects deferred to it, plus the grounding status derived
 * from open defects and overdue hold items.
 */
export async function getAircraftHilOverview(
  aircraftRegistration?: string,
  includeResolved = false,
): Promise<AircraftHilOverview[]> {
  const hilRows = await connection.db
    .selectFrom('flight.aircraftHil')
    .selectAll()
    .$if(aircraftRegistration !== undefined, (qb) =>
      qb.where('aircraftRegistration', '=', aircraftRegistration!),
    )
    .$if(!includeResolved, (qb) => qb.where('resolvedNoteId', 'is', null))
    .orderBy('aircraftRegistration', 'asc')
    .orderBy('hilNumber', 'asc')
    .execute()

  const hilIds = hilRows.map((row) => row.hilId)

  // None of these three depend on each other's result, only on hilIds above.
  const [extensionRows, defectRows, openDefectRows] = await Promise.all([
    hilIds.length
      ? connection.db
          .selectFrom('flight.aircraftHilExtension')
          .selectAll()
          .where('hilId', 'in', hilIds)
          .orderBy('extensionDate', 'asc')
          .orderBy('createdAt', 'asc')
          .execute()
      : Promise.resolve([]),

    hilIds.length
      ? connection.db
          .selectFrom('flight.defect')
          .select([
            'defectId',
            'hilId',
            'ajlbSeqNo',
            'flightId',
            'description',
            'status',
            'flightMins',
          ])
          .where('hilId', 'in', hilIds)
          .orderBy('ajlbSeqNo', 'asc')
          .execute()
      : Promise.resolve([]),

    // A defect is ACTIVE only while it has neither a HIL deferral nor a
    // maintenance release, which is exactly when the aircraft is grounded by it.
    connection.db
      .selectFrom('flight.defect')
      .select([
        'defectId',
        'aircraftRegistration',
        'ajlbSeqNo',
        'flightId',
        'description',
        'status',
        'flightMins',
      ])
      .where('status', '=', 'ACTIVE')
      .$if(aircraftRegistration !== undefined, (qb) =>
        qb.where('aircraftRegistration', '=', aircraftRegistration!),
      )
      .orderBy('ajlbSeqNo', 'asc')
      .execute(),
  ])

  const extensionsByHil = new Map<string, AircraftHilExtension[]>()
  for (const row of extensionRows) {
    const list = extensionsByHil.get(row.hilId) ?? []
    list.push(mapRowToExtension(row))
    extensionsByHil.set(row.hilId, list)
  }

  const defectsByHil = new Map<string, HilLinkedDefect[]>()
  for (const row of defectRows) {
    if (!row.hilId) continue
    const list = defectsByHil.get(row.hilId) ?? []
    list.push({
      defectId: row.defectId,
      ajlbSeqNo: row.ajlbSeqNo,
      flightId: row.flightId,
      description: row.description,
      status: row.status as DefectStatus,
      flightMins: row.flightMins,
    })
    defectsByHil.set(row.hilId, list)
  }

  const now = Date.now()
  const byRegistration = new Map<string, AircraftHilOverview>()

  const overviewFor = (registration: string): AircraftHilOverview => {
    let overview = byRegistration.get(registration)
    if (!overview) {
      overview = {
        aircraftRegistration: registration,
        isGrounded: false,
        openDefectCount: 0,
        openDefects: [],
        overdueHilCount: 0,
        hil: [],
      }
      byRegistration.set(registration, overview)
    }
    return overview
  }

  // Always report the requested aircraft, even when it has nothing on the list
  if (aircraftRegistration !== undefined) overviewFor(aircraftRegistration)

  for (const row of hilRows) {
    const hil = mapRowToHil(row)
    // extensionRows is ordered by extension_date, so the last entry is the
    // most recent one — its due date is the effective one, whether it moves
    // the date later (an extension) or earlier (a correction).
    const extensions = extensionsByHil.get(hil.hilId) ?? []
    const latestExtension = extensions.length ? extensions[extensions.length - 1] : undefined
    const effectiveDueDate = latestExtension?.extensionDue ?? hil.dueDate

    const detail: AircraftHilDetail = {
      ...hil,
      extensions,
      effectiveDueDate,
      // A hold item with no due date has no date to be past, so it is never
      // overdue and never grounds the aircraft on its own (issue #1120).
      isOverdue:
        !hil.resolvedNoteId &&
        effectiveDueDate !== null &&
        new Date(effectiveDueDate).getTime() < now,
      defects: defectsByHil.get(hil.hilId) ?? [],
    }

    const overview = overviewFor(hil.aircraftRegistration)
    overview.hil.push(detail)
    if (detail.isOverdue) overview.overdueHilCount += 1
  }

  for (const row of openDefectRows) {
    const overview = overviewFor(row.aircraftRegistration)
    overview.openDefects.push({
      defectId: row.defectId,
      ajlbSeqNo: row.ajlbSeqNo,
      flightId: row.flightId,
      description: row.description,
      status: row.status as DefectStatus,
      flightMins: row.flightMins,
    })
    overview.openDefectCount += 1
  }

  for (const overview of byRegistration.values()) {
    overview.isGrounded = overview.openDefectCount > 0 || overview.overdueHilCount > 0
  }

  return [...byRegistration.values()].sort((a, b) =>
    a.aircraftRegistration.localeCompare(b.aircraftRegistration),
  )
}
