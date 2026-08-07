import { sql, type Kysely } from 'kysely'

import * as connection from './connection.ts'
import type { DB } from './schema.d.ts'
import type {
  Defect,
  DefectStatus,
  CreateDefectRequest,
  UpdateDefectRequest,
} from '../routes/defects/models.ts'

function mapRowToDefect(row: {
  defect_id: string
  aircraft_registration: string
  ajlb_seq_no: number
  flight_id: string | null
  description: string
  flight_mins: number
  rows: number
  blank_rows_after: number
  status: DefectStatus
  hil_id: string | null
  resolved_note_id: string | null
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}): Defect {
  return {
    defectId: row.defect_id,
    aircraftRegistration: row.aircraft_registration,
    ajlbSeqNo: row.ajlb_seq_no,
    flightId: row.flight_id,
    description: row.description,
    flightMins: row.flight_mins,
    rows: row.rows,
    blankRowsAfter: row.blank_rows_after,
    status: row.status,
    hilId: row.hil_id,
    resolvedNoteId: row.resolved_note_id,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  }
}

export async function getDefects(
  aircraftRegistration: string,
  ajlbSeqNo?: number,
): Promise<Defect[]> {
  const rows = await connection.db
    .selectFrom('flight.defect')
    .selectAll()
    .where('aircraft_registration', '=', aircraftRegistration)
    .$if(ajlbSeqNo !== undefined, (qb) => qb.where('ajlb_seq_no', '=', ajlbSeqNo!))
    .orderBy('flight_mins', 'asc')
    .execute()

  return rows.map(mapRowToDefect)
}

export async function getDefect(defectId: string): Promise<Defect | undefined> {
  const row = await connection.db
    .selectFrom('flight.defect')
    .selectAll()
    .where('defect_id', '=', defectId)
    .executeTakeFirst()

  return row ? mapRowToDefect(row) : undefined
}

export async function createDefect(data: CreateDefectRequest, createdBy: string): Promise<Defect> {
  const now = new Date()
  const row = await connection.db
    .insertInto('flight.defect')
    .values({
      aircraft_registration: data.aircraftRegistration,
      ajlb_seq_no: data.ajlbSeqNo,
      flight_id: data.flightId ?? null,
      description: data.description,
      flight_mins: data.flightMins,
      rows: data.rows,
      blank_rows_after: data.blankRowsAfter,
      status: 'ACTIVE',
      hil_id: null,
      resolved_note_id: null,
      created_at: now,
      created_by: createdBy,
      updated_at: now,
      updated_by: createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRowToDefect(row)
}

export async function updateDefect(
  defectId: string,
  data: UpdateDefectRequest,
  updatedBy: string,
  createdByFilter?: string,
): Promise<Defect | undefined> {
  let query = connection.db
    .updateTable('flight.defect')
    .set({
      ...(data.description !== undefined && { description: data.description }),
      ...(data.rows !== undefined && { rows: data.rows }),
      ...(data.blankRowsAfter !== undefined && { blank_rows_after: data.blankRowsAfter }),
      ...(data.hilId !== undefined && {
        hil_id: data.hilId,
        status: data.hilId !== null ? 'MOVED_TO_HIL' : 'ACTIVE',
      }),
      ...(data.resolvedNoteId !== undefined && {
        resolved_note_id: data.resolvedNoteId,
        // Un-resolving (resolvedNoteId: null) should only land back on
        // MOVED_TO_HIL if the defect is actually linked to a hold item —
        // otherwise it belongs back on ACTIVE.
        status:
          data.resolvedNoteId !== null
            ? ('RESOLVED' as const)
            : (sql<
                'ACTIVE' | 'MOVED_TO_HIL'
              >`CASE WHEN hil_id IS NOT NULL THEN 'MOVED_TO_HIL' ELSE 'ACTIVE' END` as any),
      }),
      updated_at: new Date(),
      updated_by: updatedBy,
    })
    .where('defect_id', '=', defectId)

  if (createdByFilter !== undefined) {
    query = query.where('created_by', '=', createdByFilter)
  }

  const row = await query.returningAll().executeTakeFirst()
  return row ? mapRowToDefect(row) : undefined
}

export async function resolveDefectsByHil(
  hilId: string,
  aircraftRegistration: string,
  resolvedNoteId: string,
  updatedBy: string,
  executor: Kysely<DB> = connection.db,
): Promise<void> {
  await executor
    .updateTable('flight.defect')
    .set({
      status: 'RESOLVED',
      resolved_note_id: resolvedNoteId,
      updated_at: new Date(),
      updated_by: updatedBy,
    })
    .where('hil_id', '=', hilId)
    .where('aircraft_registration', '=', aircraftRegistration)
    .where('status', '!=', 'RESOLVED')
    .execute()
}

/**
 * Reconciles which flight-log defects a hold item defers to exactly defectIds:
 * defects no longer in the set go back to ACTIVE, new ones are deferred. Lets a
 * plane captain correct a hold item opened against the wrong defect (#1120).
 *
 * The ACTIVE + aircraft guard on the additions re-checks the precondition the
 * route already validated, but atomically this time: if a concurrent request
 * deferred or resolved one of these defects first, the row count won't match
 * and the caller's transaction rolls back rather than stealing the defect.
 */
export async function setDefectsForHil(
  hilId: string,
  aircraftRegistration: string,
  defectIds: string[],
  updatedBy: string,
  executor: Kysely<DB> = connection.db,
): Promise<boolean> {
  const now = new Date()

  // A defect can be resolved directly while its hold item is still open. Such a
  // defect is left out of the reconciliation entirely, so it is never unlinked
  // and reactivated — a resolved defect must stay resolved.
  const currentIds = (
    await executor
      .selectFrom('flight.defect')
      .select('defect_id')
      .where('hil_id', '=', hilId)
      .where('status', '!=', 'RESOLVED')
      .execute()
  ).map((row) => row.defect_id)

  const removed = currentIds.filter((id) => !defectIds.includes(id))
  const added = defectIds.filter((id) => !currentIds.includes(id))

  if (removed.length) {
    // Back to ACTIVE: an open defect with neither a deferral nor a maintenance
    // release, which grounds the aircraft until it is re-deferred or released.
    await executor
      .updateTable('flight.defect')
      .set({
        hil_id: null,
        status: 'ACTIVE',
        updated_at: now,
        updated_by: updatedBy,
      })
      .where('defect_id', 'in', removed)
      .where('hil_id', '=', hilId)
      .execute()
  }

  if (added.length) {
    const result = await executor
      .updateTable('flight.defect')
      .set({
        hil_id: hilId,
        status: 'MOVED_TO_HIL',
        updated_at: now,
        updated_by: updatedBy,
      })
      .where('defect_id', 'in', added)
      .where('aircraft_registration', '=', aircraftRegistration)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst()

    if (Number(result?.numUpdatedRows ?? 0n) !== added.length) return false
  }

  return true
}

/**
 * Resolves defects directly by id, without going via a hold item. Scoped to
 * ACTIVE defects on the given aircraft so a maintenance note can't reach into
 * another aircraft's defects or one already deferred to HIL / resolved.
 */
export async function resolveDefects(
  defectIds: string[],
  aircraftRegistration: string,
  resolvedNoteId: string,
  updatedBy: string,
  executor: Kysely<DB> = connection.db,
): Promise<void> {
  await executor
    .updateTable('flight.defect')
    .set({
      status: 'RESOLVED',
      resolved_note_id: resolvedNoteId,
      updated_at: new Date(),
      updated_by: updatedBy,
    })
    .where('defect_id', 'in', defectIds)
    .where('aircraft_registration', '=', aircraftRegistration)
    .where('status', '=', 'ACTIVE')
    .execute()
}
