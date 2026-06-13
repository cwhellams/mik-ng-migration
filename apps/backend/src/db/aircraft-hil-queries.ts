import * as connection from './connection.ts'
import type {
  AircraftHil,
  AircraftHilExtension,
  CreateAircraftHilRequest,
  UpdateAircraftHilRequest,
  CreateAircraftHilExtensionRequest,
} from '../routes/aircraft-hil/models.ts'

function mapRowToHil(row: {
  hil_id: string
  aircraft_registration: string
  hil_number: number
  source_ref: string
  defect_cat: string
  description: string
  open_date: Date
  name: string
  due_date: Date
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
    openDate: row.open_date.toISOString(),
    name: row.name,
    dueDate: row.due_date.toISOString(),
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

export async function getAircraftHilEntries(
  aircraftRegistration: string,
): Promise<AircraftHil[]> {
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
  const row = await connection.db
    .insertInto('flight.aircraft_hil')
    .values({
      aircraft_registration: data.aircraftRegistration,
      hil_number: data.hilNumber,
      source_ref: data.sourceRef,
      defect_cat: data.defectCat,
      description: data.description,
      open_date: new Date(data.openDate),
      name: data.name,
      due_date: new Date(data.dueDate),
      resolved_note_id: null,
      created_at: now,
      created_by: createdBy,
      updated_at: now,
      updated_by: createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return mapRowToHil(row)
}

export async function updateAircraftHilEntry(
  hilId: string,
  data: UpdateAircraftHilRequest,
  updatedBy: string,
): Promise<AircraftHil | undefined> {
  const row = await connection.db
    .updateTable('flight.aircraft_hil')
    .set({
      ...(data.sourceRef !== undefined && { source_ref: data.sourceRef }),
      ...(data.defectCat !== undefined && { defect_cat: data.defectCat }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.openDate !== undefined && { open_date: new Date(data.openDate) }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.dueDate !== undefined && { due_date: new Date(data.dueDate) }),
      ...(data.resolvedNoteId !== undefined && { resolved_note_id: data.resolvedNoteId }),
      updated_at: new Date(),
      updated_by: updatedBy,
    })
    .where('hil_id', '=', hilId)
    .returningAll()
    .executeTakeFirst()

  return row ? mapRowToHil(row) : undefined
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
