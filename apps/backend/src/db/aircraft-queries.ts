import { sql, type Selectable } from 'kysely'

import * as connection from './connection.ts'
import type { FlightAircraft } from './schema.js'
import type { Aircraft, AircraftNote, FuelTypeEntry } from '@mik/contracts/aircrafts'
import type { JWTUser } from '../routes/auth/token.ts'
import { problem } from '../routes/response.ts'
import type { Upsert } from '@mik/contracts/schema'
import { getAllAircraftDocuments } from './aircraft-document-queries.ts'
import type { AircraftDocument } from '@mik/contracts/aircraft-documents'

// Get all aircraft
export const getAllAircraft = async (
  onlyActive: boolean,
  visibleOnly: boolean,
): Promise<Aircraft[]> => {
  const rows = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .$if(onlyActive, (qb) => qb.where('active', '=', true))
    .$if(visibleOnly, (qb) => qb.where('hidden', '=', false))
    .orderBy('display_name')
    .execute()

  return Promise.all(
    rows.map(async (row) => {
      const docs = (await getAllAircraftDocuments({
        aircraftRegistration: row.registration,
      })) as unknown as AircraftDocument[]
      return toAircraft(row, docs)
    }),
  )
}

// Get aircraft by registration
export const getAircraftByRegistration = async (
  registration: string,
  onlyActive: boolean,
  visibleOnly: boolean = false,
): Promise<Aircraft | undefined> => {
  const row = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .where('registration', '=', registration)
    .$if(onlyActive, (qb) => qb.where('active', '=', true))
    .$if(visibleOnly, (qb) => qb.where('hidden', '=', false))
    .executeTakeFirst()
  if (row) {
    return toAircraft(
      row,
      (await getAllAircraftDocuments({
        aircraftRegistration: row.registration,
      })) as unknown as AircraftDocument[],
    )
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
  seats: aircraft.seats,
  usableFuelLitres: aircraft.usable_fuel_litres,
  fuelTypes: aircraft.fuel_types ?? [],
  preferredFuelType: aircraft.preferred_fuel_type ?? null,
  active: aircraft.active,
  hidden: aircraft.hidden,

  documents: documents,
  maintenance: {
    maintenanceCycle: aircraft.maintenance_cycle,
    lastMaintenanceDate: aircraft.last_maintenance_date,
    lastMaintenanceType: aircraft.last_maintenance_type,
    lastMaintenanceMins: aircraft.last_maintenance_mins,
    nextMaintenanceDate: aircraft.next_maintenance_date,
    nextMaintenanceType: aircraft.next_maintenance_type,
    nextMaintenanceMins: aircraft.next_maintenance_mins,

    totalPercentageHours: aircraft.total_percentage_hours,
    reservedHours: aircraft.reserved_hours,
  },

  notes: aircraft.notes as AircraftNote[],

  location: aircraft.location,
  equipment: aircraft.equipment,
  imageUrl: aircraft.image_url,
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
      seats: aircraft.seats,
      usable_fuel_litres: aircraft.usableFuelLitres,
      fuel_types: aircraft.fuelTypes,
      preferred_fuel_type: aircraft.preferredFuelType ?? null,
      active: aircraft.active,
      hidden: aircraft.hidden,

      maintenance_cycle: aircraft.maintenance.maintenanceCycle,
      last_maintenance_date: aircraft.maintenance.lastMaintenanceDate,
      last_maintenance_type: aircraft.maintenance.lastMaintenanceType,
      last_maintenance_mins: aircraft.maintenance.lastMaintenanceMins,
      next_maintenance_date: aircraft.maintenance.nextMaintenanceDate,
      next_maintenance_type: aircraft.maintenance.nextMaintenanceType,
      next_maintenance_mins: aircraft.maintenance.nextMaintenanceMins,

      total_percentage_hours: aircraft.maintenance.totalPercentageHours,
      reserved_hours: aircraft.maintenance.reservedHours,

      notes: JSON.stringify(aircraft.notes),

      location: aircraft.location,
      equipment: aircraft.equipment,
      image_url: aircraft.imageUrl,

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

  // When fuelTypes changes but preferredFuelType is not explicitly provided,
  // preserve the existing preferred_fuel_type only if it is still contained
  // in the new fuel_types array; otherwise clear it to NULL.
  let preferredFuelType: string | null | undefined | ReturnType<typeof sql<string | null>> =
    patch.preferredFuelType
  if (patch.fuelTypes && preferredFuelType === undefined) {
    preferredFuelType = sql<
      string | null
    >`CASE WHEN preferred_fuel_type = ANY(${patch.fuelTypes}) THEN preferred_fuel_type ELSE NULL END`
  }

  const result = await connection.db
    .updateTable('flight.aircraft')
    .set({
      registration: patch.registration,
      display_name: patch.displayName,
      model: patch.model,
      manufacturer: patch.manufacturer,
      year_of_manufacture: patch.yearOfManufacture,
      seats: patch.seats,
      usable_fuel_litres: patch.usableFuelLitres,
      fuel_types: patch.fuelTypes,
      preferred_fuel_type: preferredFuelType as any,
      active: patch.active,
      hidden: patch.hidden,

      notes: patch.notes ? JSON.stringify(patch.notes) : undefined,
      location: patch.location,
      equipment: patch.equipment,
      image_url: patch.imageUrl,
      updated_at: now,
      updated_by: jwt.memberId,
    })
    .$if(!!patch.maintenance, (qb) =>
      qb.set({
        maintenance_cycle: patch.maintenance!.maintenanceCycle,
        last_maintenance_date: patch.maintenance!.lastMaintenanceDate,
        last_maintenance_type: patch.maintenance!.lastMaintenanceType,
        last_maintenance_mins: patch.maintenance!.lastMaintenanceMins,
        next_maintenance_date: patch.maintenance!.nextMaintenanceDate,
        next_maintenance_type: patch.maintenance!.nextMaintenanceType,
        next_maintenance_mins: patch.maintenance!.nextMaintenanceMins,
        total_percentage_hours: patch.maintenance?.totalPercentageHours,
        reserved_hours: patch.maintenance?.reservedHours,
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

export async function getAllFuelTypes(): Promise<FuelTypeEntry[]> {
  const rows = await connection.db
    .selectFrom('flight.fuel_types')
    .selectAll()
    .orderBy('sort_order')
    .execute()
  return rows.map((row) => ({ name: row.name, sortOrder: row.sort_order }))
}
