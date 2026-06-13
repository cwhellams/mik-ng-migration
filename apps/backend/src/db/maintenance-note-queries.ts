import * as connection from './connection.ts'
import type {
  MaintenanceNote,
  CreateMaintenanceNoteRequest,
  UpdateMaintenanceNoteRequest,
} from '../routes/maintenance-notes/models.ts'

function mapRowToNote(row: {
  note_id: string
  aircraft_registration: string
  ajlb_seq_no: number
  description: string
  performed_by: string
  flight_mins: number
  blank_rows_after: number
  hil_id: string | null
  created_at: Date
  created_by: string
  updated_at?: Date
  updated_by?: string
}): MaintenanceNote {
  return {
    noteId: row.note_id,
    aircraftRegistration: row.aircraft_registration,
    ajlbSeqNo: row.ajlb_seq_no,
    description: row.description,
    performedBy: row.performed_by,
    flightMins: row.flight_mins,
    blankRowsAfter: row.blank_rows_after,
    hilId: row.hil_id,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
  }
}

export async function getMaintenanceNotes(
  aircraftRegistration: string,
  ajlbSeqNo: number,
): Promise<MaintenanceNote[]> {
  const rows = await connection.db
    .selectFrom('flight.maintenance_note')
    .selectAll()
    .where('aircraft_registration', '=', aircraftRegistration)
    .where('ajlb_seq_no', '=', ajlbSeqNo)
    .orderBy('flight_mins', 'asc')
    .execute()

  return rows.map(mapRowToNote)
}

export async function createMaintenanceNote(
  data: CreateMaintenanceNoteRequest,
  createdBy: string,
): Promise<MaintenanceNote> {
  const now = new Date()
  const row = await connection.db
    .insertInto('flight.maintenance_note')
    .values({
      aircraft_registration: data.aircraftRegistration,
      ajlb_seq_no: data.ajlbSeqNo,
      description: data.description,
      performed_by: data.performedBy,
      flight_mins: data.flightMins,
      blank_rows_after: data.blankRowsAfter,
      hil_id: data.hilId ?? null,
      created_at: now,
      created_by: createdBy,
      updated_at: now,
      updated_by: createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRowToNote(row)
}

export async function updateMaintenanceNote(
  noteId: string,
  data: UpdateMaintenanceNoteRequest,
  updatedBy: string,
  createdByFilter?: string,
): Promise<MaintenanceNote | undefined> {
  let query = connection.db
    .updateTable('flight.maintenance_note')
    .set({
      ...(data.description !== undefined && { description: data.description }),
      ...(data.performedBy !== undefined && { performed_by: data.performedBy }),
      ...(data.flightMins !== undefined && { flight_mins: data.flightMins }),
      ...(data.blankRowsAfter !== undefined && { blank_rows_after: data.blankRowsAfter }),
      ...(data.hilId !== undefined && { hil_id: data.hilId }),
      updated_at: new Date(),
      updated_by: updatedBy,
    })
    .where('note_id', '=', noteId)
  if (createdByFilter !== undefined) {
    query = query.where('created_by', '=', createdByFilter)
  }
  const row = await query.returningAll().executeTakeFirst()
  return row ? mapRowToNote(row) : undefined
}

export async function deleteMaintenanceNote(noteId: string): Promise<void> {
  await connection.db
    .deleteFrom('flight.maintenance_note')
    .where('note_id', '=', noteId)
    .execute()
}

export async function getMaintenanceNote(noteId: string): Promise<MaintenanceNote | undefined> {
  const row = await connection.db
    .selectFrom('flight.maintenance_note')
    .selectAll()
    .where('note_id', '=', noteId)
    .executeTakeFirst()

  return row ? mapRowToNote(row) : undefined
}
