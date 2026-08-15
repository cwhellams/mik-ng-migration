import * as connection from './connection.ts'
import type { CamelRow } from './connection.ts'
import { resolveDefectsByHil, resolveDefects } from './defect-queries.ts'
import type {
  MaintenanceNote,
  CreateMaintenanceNoteRequest,
  UpdateMaintenanceNoteRequest,
} from '@mik/contracts/maintenance-notes'

function mapRowToNote(row: CamelRow<'flight.maintenanceNote'>): MaintenanceNote {
  return {
    noteId: row.noteId,
    aircraftRegistration: row.aircraftRegistration,
    ajlbSeqNo: row.ajlbSeqNo,
    description: row.description,
    performedBy: row.performedBy,
    flightMins: row.flightMins,
    rows: row.rows,
    blankRowsAfter: row.blankRowsAfter,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  }
}

export async function getMaintenanceNotes(
  aircraftRegistration: string,
  ajlbSeqNo?: number,
): Promise<MaintenanceNote[]> {
  const rows = await connection.camelDb
    .selectFrom('flight.maintenanceNote')
    .selectAll()
    .where('aircraftRegistration', '=', aircraftRegistration)
    .$if(ajlbSeqNo !== undefined, (qb) => qb.where('ajlbSeqNo', '=', ajlbSeqNo!))
    .orderBy('flightMins', 'asc')
    .execute()

  return rows.map(mapRowToNote)
}

export async function createMaintenanceNote(
  data: CreateMaintenanceNoteRequest,
  createdBy: string,
): Promise<MaintenanceNote> {
  const now = new Date()

  return connection.camelDb.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto('flight.maintenanceNote')
      .values({
        aircraftRegistration: data.aircraftRegistration,
        ajlbSeqNo: data.ajlbSeqNo,
        description: data.description,
        performedBy: data.performedBy,
        flightMins: data.flightMins,
        rows: data.rows,
        blankRowsAfter: data.blankRowsAfter,
        createdAt: now,
        createdBy,
        updatedAt: now,
        updatedBy: createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // Close the hold items this note resolves, cascading to their defects
    if (data.hilIds?.length) {
      await trx
        .updateTable('flight.aircraftHil')
        .set({
          resolvedNoteId: row.noteId,
          updatedAt: now,
          updatedBy: createdBy,
        })
        .where('hilId', 'in', data.hilIds)
        .where('aircraftRegistration', '=', data.aircraftRegistration)
        .where('resolvedNoteId', 'is', null)
        .execute()

      for (const hilId of data.hilIds) {
        await resolveDefectsByHil(hilId, data.aircraftRegistration, row.noteId, createdBy, trx)
      }
    }

    // Resolve any open defects this note closes directly, without a hold item
    if (data.defectIds?.length) {
      await resolveDefects(data.defectIds, data.aircraftRegistration, row.noteId, createdBy, trx)
    }

    return mapRowToNote(row)
  })
}

export async function updateMaintenanceNote(
  noteId: string,
  data: UpdateMaintenanceNoteRequest,
  updatedBy: string,
  createdByFilter?: string,
): Promise<MaintenanceNote | undefined> {
  let query = connection.camelDb
    .updateTable('flight.maintenanceNote')
    .set({
      ...(data.description !== undefined && { description: data.description }),
      ...(data.performedBy !== undefined && { performedBy: data.performedBy }),
      ...(data.flightMins !== undefined && { flightMins: data.flightMins }),
      ...(data.rows !== undefined && { rows: data.rows }),
      ...(data.blankRowsAfter !== undefined && { blankRowsAfter: data.blankRowsAfter }),
      updatedAt: new Date(),
      updatedBy,
    })
    .where('noteId', '=', noteId)
  if (createdByFilter !== undefined) {
    query = query.where('createdBy', '=', createdByFilter)
  }
  const row = await query.returningAll().executeTakeFirst()
  return row ? mapRowToNote(row) : undefined
}

export async function deleteMaintenanceNote(noteId: string): Promise<void> {
  await connection.camelDb
    .deleteFrom('flight.maintenanceNote')
    .where('noteId', '=', noteId)
    .execute()
}

export async function getMaintenanceNote(noteId: string): Promise<MaintenanceNote | undefined> {
  const row = await connection.camelDb
    .selectFrom('flight.maintenanceNote')
    .selectAll()
    .where('noteId', '=', noteId)
    .executeTakeFirst()

  return row ? mapRowToNote(row) : undefined
}
