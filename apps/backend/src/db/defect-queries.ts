import { auditCreate, mapAudit } from './audit.ts'
import { sql, type Kysely } from 'kysely'

import * as connection from './connection.ts'
import type { DbRow } from './connection.ts'
import type { DB } from './schema.d.ts'
import type { Defect, CreateDefectRequest, UpdateDefectRequest } from '@mik/contracts/defects'

function mapRowToDefect(row: DbRow<'flight.defect'>): Defect {
  return {
    defectId: row.defectId,
    aircraftRegistration: row.aircraftRegistration,
    ajlbSeqNo: row.ajlbSeqNo,
    flightId: row.flightId,
    description: row.description,
    flightMins: row.flightMins,
    rows: row.rows,
    blankRowsBefore: row.blankRowsBefore,
    status: row.status,
    hilId: row.hilId,
    resolvedNoteId: row.resolvedNoteId,
    ...mapAudit(row),
  }
}

export async function getDefects(
  aircraftRegistration: string,
  ajlbSeqNo?: number,
): Promise<Defect[]> {
  const rows = await connection.db
    .selectFrom('flight.defect')
    .selectAll()
    .where('aircraftRegistration', '=', aircraftRegistration)
    .$if(ajlbSeqNo !== undefined, (qb) => qb.where('ajlbSeqNo', '=', ajlbSeqNo!))
    .orderBy('flightMins', 'asc')
    .execute()

  return rows.map(mapRowToDefect)
}

export async function getDefect(defectId: string): Promise<Defect | undefined> {
  const row = await connection.db
    .selectFrom('flight.defect')
    .selectAll()
    .where('defectId', '=', defectId)
    .executeTakeFirst()

  return row ? mapRowToDefect(row) : undefined
}

export async function createDefect(data: CreateDefectRequest, createdBy: string): Promise<Defect> {
  const now = new Date()
  const row = await connection.db
    .insertInto('flight.defect')
    .values({
      aircraftRegistration: data.aircraftRegistration,
      ajlbSeqNo: data.ajlbSeqNo,
      flightId: data.flightId ?? null,
      description: data.description,
      flightMins: data.flightMins,
      rows: data.rows,
      blankRowsBefore: data.blankRowsBefore,
      status: 'ACTIVE',
      hilId: null,
      resolvedNoteId: null,
      ...auditCreate(createdBy, now),
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
      ...(data.blankRowsBefore !== undefined && { blankRowsBefore: data.blankRowsBefore }),
      ...(data.hilId !== undefined && {
        hilId: data.hilId,
        status: data.hilId !== null ? 'MOVED_TO_HIL' : 'ACTIVE',
      }),
      ...(data.resolvedNoteId !== undefined && {
        resolvedNoteId: data.resolvedNoteId,
        // Un-resolving (resolvedNoteId: null) should only land back on
        // MOVED_TO_HIL if the defect is actually linked to a hold item —
        // otherwise it belongs back on ACTIVE.
        status:
          data.resolvedNoteId !== null
            ? ('RESOLVED' as const)
            : sql<
                'ACTIVE' | 'MOVED_TO_HIL'
              >`CASE WHEN hil_id IS NOT NULL THEN 'MOVED_TO_HIL' ELSE 'ACTIVE' END`,
      }),
      updatedAt: new Date(),
      updatedBy,
    })
    .where('defectId', '=', defectId)

  if (createdByFilter !== undefined) {
    query = query.where('createdBy', '=', createdByFilter)
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
      resolvedNoteId,
      updatedAt: new Date(),
      updatedBy,
    })
    .where('hilId', '=', hilId)
    .where('aircraftRegistration', '=', aircraftRegistration)
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
      .select('defectId')
      .where('hilId', '=', hilId)
      .where('status', '!=', 'RESOLVED')
      .execute()
  ).map((row) => row.defectId)

  const removed = currentIds.filter((id) => !defectIds.includes(id))
  const added = defectIds.filter((id) => !currentIds.includes(id))

  if (removed.length) {
    // Back to ACTIVE: an open defect with neither a deferral nor a maintenance
    // release, which grounds the aircraft until it is re-deferred or released.
    await executor
      .updateTable('flight.defect')
      .set({
        hilId: null,
        status: 'ACTIVE',
        updatedAt: now,
        updatedBy,
      })
      .where('defectId', 'in', removed)
      .where('hilId', '=', hilId)
      .where('status', '=', 'MOVED_TO_HIL')
      .execute()
  }

  if (added.length) {
    const result = await executor
      .updateTable('flight.defect')
      .set({
        hilId,
        status: 'MOVED_TO_HIL',
        updatedAt: now,
        updatedBy,
      })
      .where('defectId', 'in', added)
      .where('aircraftRegistration', '=', aircraftRegistration)
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
      resolvedNoteId,
      updatedAt: new Date(),
      updatedBy,
    })
    .where('defectId', 'in', defectIds)
    .where('aircraftRegistration', '=', aircraftRegistration)
    .where('status', '=', 'ACTIVE')
    .execute()
}
