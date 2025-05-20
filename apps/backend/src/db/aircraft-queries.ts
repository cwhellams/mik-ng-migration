import type { Selectable } from 'kysely'

import * as connection from './connection.ts'
import type { FlightAircraft } from './schema.js'
import {
  type Aircraft,
  type AircraftDocument,
  type AircraftNote,
} from '../routes/aircrafts/models.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'
import type { Upsert } from '../types/schema.ts'

// Get all aircraft
export const getAllAircraft = async (onlyActive: boolean): Promise<Aircraft[]> => {
  const rows = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .$if(onlyActive, qb => qb.where('active', '=', true))
    .orderBy('display_name')
    .execute()

  return Promise.all(rows.map(async row => toAircraft(row, await getDocuments(row.registration))))
}

// Get aircraft by registration
export const getAircraftByRegistration = async (
  registration: string,
  onlyActive: boolean,
): Promise<Aircraft | undefined> => {
  const row = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .where('registration', '=', registration)
    .$if(onlyActive, qb => qb.where('active', '=', true))
    .executeTakeFirst()
  if (row) {
    return toAircraft(row, await getDocuments(row.registration))
  }
}

const toAircraft = (
  aircraft: Selectable<FlightAircraft>,
  documents: AircraftDocument[],
): Aircraft => ({
  registration: aircraft.registration,
  displayName: aircraft.display_name,
  model: aircraft.model,
  manufacturer: aircraft.manufacturer,
  yearOfManufacture: aircraft.year_of_manufacture,
  active: aircraft.active,

  documents: documents,
  maintenance: {
    maintenanceCycle: aircraft.maintenance_cycle,
    lastMaintenanceDate: aircraft.last_maintenance_date,
    lastMaintenanceType: aircraft.last_maintenance_type,
    lastMaintenanceTach: aircraft.last_maintenance_tach,
    nextMaintenanceDate: aircraft.next_maintenance_date,
    nextMaintenanceType: aircraft.next_maintenance_type,
    nextMaintenanceTach: aircraft.next_maintenance_tach,

    totalPercentageHours: aircraft.total_percentage_hours,
    usablePercentageHours: aircraft.usable_percentage_hours,
  },

  notes: aircraft.notes as AircraftNote[],

  location: aircraft.location,
  equipment: aircraft.equipment,
  hourlyRateEur: aircraft.hourly_rate_eur,
  createdAt: aircraft.created_at?.toISOString(),
  updatedAt: aircraft.updated_at?.toISOString(),
  createdBy: aircraft.created_by,
  updatedBy: aircraft.updated_by,
})

export async function addAircraft(aircraft: Upsert<Aircraft>, jwt: JWTUser): Promise<Aircraft> {
  const now = new Date()

  const result = await connection.db
    .insertInto('flight.aircraft')
    .values({
      registration: aircraft.registration,
      display_name: aircraft.displayName,
      model: aircraft.model,
      manufacturer: aircraft.manufacturer,
      year_of_manufacture: aircraft.yearOfManufacture,
      active: aircraft.active,

      maintenance_cycle: aircraft.maintenance.maintenanceCycle,
      last_maintenance_date: aircraft.maintenance.lastMaintenanceDate,
      last_maintenance_type: aircraft.maintenance.lastMaintenanceType,
      last_maintenance_tach: aircraft.maintenance.lastMaintenanceTach,
      next_maintenance_date: aircraft.maintenance.nextMaintenanceDate,
      next_maintenance_type: aircraft.maintenance.nextMaintenanceType,
      next_maintenance_tach: aircraft.maintenance.nextMaintenanceTach,

      total_percentage_hours: aircraft.maintenance.totalPercentageHours,
      usable_percentage_hours: aircraft.maintenance.usablePercentageHours,

      notes: JSON.stringify(aircraft.notes),

      location: aircraft.location,
      equipment: aircraft.equipment,
      hourly_rate_eur: aircraft.hourlyRateEur,

      created_at: now,
      created_by: jwt.memberId,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .executeTakeFirst()
  if (!result.numInsertedOrUpdatedRows) {
    return problem({ status: 500, detail: 'Aircraft insert failed' })
  }
  return {
    ...aircraft,
    createdAt: now.toISOString(),
    createdBy: jwt.memberId,
    updatedAt: now.toISOString(),
    updatedBy: jwt.memberId,
  }
}

export async function updateAircraft(
  registration: string,
  patch: Partial<Aircraft>,
  jwt: JWTUser,
): Promise<boolean> {
  const now = new Date()

  const result = await connection.db
    .updateTable('flight.aircraft')
    .set({
      registration: patch.registration,
      display_name: patch.displayName,
      model: patch.model,
      manufacturer: patch.manufacturer,
      year_of_manufacture: patch.yearOfManufacture,
      active: patch.active,

      notes: patch.notes ? JSON.stringify(patch.notes) : undefined,
      location: patch.location,
      equipment: patch.equipment,
      hourly_rate_eur: patch.hourlyRateEur,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .$if(!!patch.maintenance, qb =>
      qb.set({
        maintenance_cycle: patch.maintenance!.maintenanceCycle,
        last_maintenance_date: patch.maintenance!.lastMaintenanceDate,
        last_maintenance_type: patch.maintenance!.lastMaintenanceType,
        last_maintenance_tach: patch.maintenance!.lastMaintenanceTach,
        next_maintenance_date: patch.maintenance!.nextMaintenanceDate,
        next_maintenance_type: patch.maintenance!.nextMaintenanceType,
        next_maintenance_tach: patch.maintenance!.nextMaintenanceTach,
        total_percentage_hours: patch.maintenance?.totalPercentageHours,
        usable_percentage_hours: patch.maintenance?.usablePercentageHours,
      }),
    )
    .where('registration', '=', registration)
    .executeTakeFirstOrThrow()
  return result.numUpdatedRows == BigInt(1)
}

export async function removeAircraft(registration: string): Promise<boolean> {
  const result = await connection.db
    .deleteFrom('flight.aircraft')
    .where('registration', '=', registration)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows == BigInt(1)
}

//
// Document queries
//

export const getDocuments = async (
  registration: string,
  documentId?: string,
): Promise<AircraftDocument[]> => {
  const records = await connection.db
    .selectFrom('flight.aircraft_documents')
    .selectAll()
    .where('registration', '=', registration)
    .$if(documentId !== undefined, qb => qb.where('document_id', '=', documentId!))
    .execute()
  return records.map(record => ({
    documentId: record.document_id,
    startDate: record.start_date,
    endDate: record.end_date,
    alertDaysBefore: record.alert_days_before,
    softLimit: record.soft_limit,
    hardLimit: record.hard_limit,
    createdAt: record.created_at?.toISOString(),
    updatedAt: record.updated_at?.toISOString(),
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  }))
}

export async function addAircraftDocument(
  registration: string,
  document: Upsert<AircraftDocument>,
  jwt: JWTUser,
): Promise<AircraftDocument> {
  const now = new Date()

  const result = await connection.db
    .insertInto('flight.aircraft_documents')
    .values({
      registration,
      document_id: document.documentId,
      start_date: document.startDate,
      end_date: document.endDate,
      alert_days_before: document.alertDaysBefore,
      hard_limit: document.hardLimit,
      soft_limit: document.softLimit,

      created_at: now,
      created_by: jwt.memberId,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .executeTakeFirst()
  if (!result.numInsertedOrUpdatedRows) {
    return problem({ status: 500, detail: 'Document insert failed' })
  }
  return {
    ...document,
    createdAt: now.toISOString(),
    createdBy: jwt.memberId,
    updatedAt: now.toISOString(),
    updatedBy: jwt.memberId,
  }
}

export async function updateAircraftDocument(
  registration: string,
  documentId: string,
  patch: Partial<AircraftDocument>,
  jwt: JWTUser,
): Promise<boolean> {
  const now = new Date()

  const result = await connection.db
    .updateTable('flight.aircraft_documents')
    .set({
      document_id: patch.documentId,
      start_date: patch.startDate,
      end_date: patch.endDate,
      alert_days_before: patch.alertDaysBefore,
      hard_limit: patch.hardLimit,
      soft_limit: patch.softLimit,

      updated_at: now,
      updated_by: jwt.memberId,
    })
    .where('registration', '=', registration)
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow()
  return result.numUpdatedRows == BigInt(1)
}

export async function removeAircraftDocument(
  registration: string,
  documentId: string,
): Promise<boolean> {
  const result = await connection.db
    .deleteFrom('flight.aircraft_documents')
    .where('registration', '=', registration)
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows == BigInt(1)
}
