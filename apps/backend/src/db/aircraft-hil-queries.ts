import { sql, type Kysely } from 'kysely'

import * as connection from './connection.ts'
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
} from '../routes/aircraft-hil/models.ts'
import type { DefectStatus } from '../routes/defects/models.ts'
import { problem } from '../routes/response.ts'

function mapRowToHil(row: {
  hil_id: string
  aircraft_registration: string
  hil_number: number
  source_ref: string | null
  defect_cat: string | null
  description: string
  restrictions: string | null
  open_date: Date
  name: string
  due_date: Date | null
  resolved_note_id: string | null
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}): AircraftHil {
  return {
    hilId: row.hil_id,
    aircraftRegistration: row.aircraft_registration,
    hilNumber: row.hil_number,
    sourceRef: row.source_ref,
    defectCat: row.defect_cat,
    description: row.description,
    restrictions: row.restrictions,
    openDate: row.open_date.toISOString(),
    name: row.name,
    dueDate: row.due_date?.toISOString() ?? null,
    resolvedNoteId: row.resolved_note_id,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  }
}

function mapRowToExtension(row: {
  extension_id: string
  hil_id: string
  extension_date: Date
  name: string
  extension_due: Date
  created_at: Date
  created_by: string
}): AircraftHilExtension {
  return {
    extensionId: row.extension_id,
    hilId: row.hil_id,
    extensionDate: row.extension_date.toISOString(),
    name: row.name,
    extensionDue: row.extension_due.toISOString(),
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
  }
}

export async function getAircraftHilEntries(aircraftRegistration: string): Promise<AircraftHil[]> {
  const rows = await connection.db
    .selectFrom('flight.aircraft_hil')
    .selectAll()
    .where('aircraft_registration', '=', aircraftRegistration)
    .orderBy('hil_number', 'asc')
    .execute()

  return rows.map(mapRowToHil)
}

export async function getAircraftHilEntry(hilId: string): Promise<AircraftHil | undefined> {
  const row = await connection.db
    .selectFrom('flight.aircraft_hil')
    .selectAll()
    .where('hil_id', '=', hilId)
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
        .insertInto('flight.aircraft_hil')
        .values({
          aircraft_registration: data.aircraftRegistration,
          hil_number: hilNumber,
          source_ref: data.sourceRef ?? null,
          defect_cat: data.defectCat ?? null,
          description: data.description,
          restrictions: data.restrictions ?? null,
          open_date: new Date(data.openDate),
          name: data.name,
          due_date: data.dueDate ? new Date(data.dueDate) : null,
          resolved_note_id: null,
          created_at: now,
          created_by: createdBy,
          updated_at: now,
          updated_by: createdBy,
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
            hil_id: row.hil_id,
            status: 'MOVED_TO_HIL',
            updated_at: now,
            updated_by: createdBy,
          })
          .where('defect_id', '=', data.defectId)
          .where('aircraft_registration', '=', data.aircraftRegistration)
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
      .updateTable('flight.aircraft_hil')
      .set({
        ...(data.hilNumber !== undefined && { hil_number: data.hilNumber }),
        ...(data.sourceRef !== undefined && { source_ref: data.sourceRef }),
        ...(data.defectCat !== undefined && { defect_cat: data.defectCat }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.restrictions !== undefined && { restrictions: data.restrictions }),
        ...(data.openDate !== undefined && { open_date: new Date(data.openDate) }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.dueDate !== undefined && {
          due_date: data.dueDate ? new Date(data.dueDate) : null,
        }),
        ...(data.resolvedNoteId !== undefined && { resolved_note_id: data.resolvedNoteId }),
        updated_at: new Date(),
        updated_by: updatedBy,
      })
      .where('hil_id', '=', hilId)
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
    .selectFrom('flight.aircraft_hil_extension')
    .selectAll()
    .where('hil_id', '=', hilId)
    .orderBy('extension_date', 'asc')
    .execute()

  return rows.map(mapRowToExtension)
}

export async function createAircraftHilExtension(
  hilId: string,
  data: CreateAircraftHilExtensionRequest,
  createdBy: string,
): Promise<AircraftHilExtension> {
  const row = await connection.db
    .insertInto('flight.aircraft_hil_extension')
    .values({
      hil_id: hilId,
      extension_date: new Date(data.extensionDate),
      name: data.name,
      extension_due: new Date(data.extensionDue),
      created_at: new Date(),
      created_by: createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRowToExtension(row)
}

export async function getAircraftHilAudit(hilId: string): Promise<AircraftHilAuditEntry[]> {
  const hilRows = await connection.db
    .selectFrom('flight.aircraft_hil_audit')
    .selectAll()
    .where('hil_id', '=', hilId)
    .execute()

  // Extensions are audited in their own table; surface them here too so the
  // "change history" for a hold item shows when its due date was extended.
  const extensionRows = await connection.db
    .selectFrom('flight.aircraft_hil_extension_audit')
    .innerJoin(
      'flight.aircraft_hil_extension',
      'flight.aircraft_hil_extension.extension_id',
      'flight.aircraft_hil_extension_audit.extension_id',
    )
    .select([
      'flight.aircraft_hil_extension_audit.audit_id',
      'flight.aircraft_hil_extension_audit.operation_type',
      'flight.aircraft_hil_extension_audit.changed_data',
      'flight.aircraft_hil_extension_audit.new_data',
      'flight.aircraft_hil_extension_audit.changed_by',
      'flight.aircraft_hil_extension_audit.changed_at',
    ])
    .where('flight.aircraft_hil_extension.hil_id', '=', hilId)
    .execute()

  const entries: AircraftHilAuditEntry[] = [
    ...hilRows.map((row) => ({
      auditId: row.audit_id,
      hilId: row.hil_id,
      operationType: row.operation_type,
      changedData: row.changed_data ?? null,
      newData: row.new_data ?? null,
      changedBy: row.changed_by,
      changedAt: row.changed_at.toISOString(),
    })),
    ...extensionRows.map((row) => ({
      auditId: row.audit_id,
      hilId,
      operationType: `EXTENSION_${row.operation_type}`,
      changedData: row.changed_data ?? null,
      newData: row.new_data ?? null,
      changedBy: row.changed_by,
      changedAt: row.changed_at.toISOString(),
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
    .selectFrom('flight.aircraft_hil')
    .selectAll()
    .$if(aircraftRegistration !== undefined, (qb) =>
      qb.where('aircraft_registration', '=', aircraftRegistration!),
    )
    .$if(!includeResolved, (qb) => qb.where('resolved_note_id', 'is', null))
    .orderBy('aircraft_registration', 'asc')
    .orderBy('hil_number', 'asc')
    .execute()

  const hilIds = hilRows.map((row) => row.hil_id)

  // None of these three depend on each other's result, only on hilIds above.
  const [extensionRows, defectRows, openDefectRows] = await Promise.all([
    hilIds.length
      ? connection.db
          .selectFrom('flight.aircraft_hil_extension')
          .selectAll()
          .where('hil_id', 'in', hilIds)
          .orderBy('extension_date', 'asc')
          .orderBy('created_at', 'asc')
          .execute()
      : Promise.resolve([]),

    hilIds.length
      ? connection.db
          .selectFrom('flight.defect')
          .select([
            'defect_id',
            'hil_id',
            'ajlb_seq_no',
            'flight_id',
            'description',
            'status',
            'flight_mins',
          ])
          .where('hil_id', 'in', hilIds)
          .orderBy('ajlb_seq_no', 'asc')
          .execute()
      : Promise.resolve([]),

    // A defect is ACTIVE only while it has neither a HIL deferral nor a
    // maintenance release, which is exactly when the aircraft is grounded by it.
    connection.db
      .selectFrom('flight.defect')
      .select([
        'defect_id',
        'aircraft_registration',
        'ajlb_seq_no',
        'flight_id',
        'description',
        'status',
        'flight_mins',
      ])
      .where('status', '=', 'ACTIVE')
      .$if(aircraftRegistration !== undefined, (qb) =>
        qb.where('aircraft_registration', '=', aircraftRegistration!),
      )
      .orderBy('ajlb_seq_no', 'asc')
      .execute(),
  ])

  const extensionsByHil = new Map<string, AircraftHilExtension[]>()
  for (const row of extensionRows) {
    const list = extensionsByHil.get(row.hil_id) ?? []
    list.push(mapRowToExtension(row))
    extensionsByHil.set(row.hil_id, list)
  }

  const defectsByHil = new Map<string, HilLinkedDefect[]>()
  for (const row of defectRows) {
    if (!row.hil_id) continue
    const list = defectsByHil.get(row.hil_id) ?? []
    list.push({
      defectId: row.defect_id,
      ajlbSeqNo: row.ajlb_seq_no,
      flightId: row.flight_id,
      description: row.description,
      status: row.status as DefectStatus,
      flightMins: row.flight_mins,
    })
    defectsByHil.set(row.hil_id, list)
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
    const overview = overviewFor(row.aircraft_registration)
    overview.openDefects.push({
      defectId: row.defect_id,
      ajlbSeqNo: row.ajlb_seq_no,
      flightId: row.flight_id,
      description: row.description,
      status: row.status as DefectStatus,
      flightMins: row.flight_mins,
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
