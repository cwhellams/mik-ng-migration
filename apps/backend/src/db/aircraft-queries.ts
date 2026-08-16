import { auditCreate, auditUpdate } from './audit.ts'
import type { Updateable } from 'kysely'
import { sql, type Selectable } from 'kysely'

import * as connection from './connection.ts'
import type { FlightAircraft } from './schema.d.ts'
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
    .orderBy('displayName')
    .execute()

  return Promise.all(
    rows.map(async (row) => {
      const docs = await getAllAircraftDocuments({
        aircraftRegistration: row.registration,
      })
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
      await getAllAircraftDocuments({
        aircraftRegistration: row.registration,
      }),
    )
  }
}

const toAircraft = (
  aircraft: Selectable<FlightAircraft>,
  documents: AircraftDocument[],
): Aircraft => ({
  registration: aircraft.registration,
  displayName: aircraft.displayName,
  model: aircraft.model,
  manufacturer: aircraft.manufacturer,
  yearOfManufacture: aircraft.yearOfManufacture,
  seats: aircraft.seats,
  usableFuelLitres: aircraft.usableFuelLitres,
  fuelTypes: aircraft.fuelTypes ?? [],
  preferredFuelType: aircraft.preferredFuelType ?? null,
  active: aircraft.active,
  hidden: aircraft.hidden,

  documents: documents,
  maintenance: {
    maintenanceCycle: aircraft.maintenanceCycle,
    lastMaintenanceDate: aircraft.lastMaintenanceDate,
    lastMaintenanceType: aircraft.lastMaintenanceType,
    lastMaintenanceMins: aircraft.lastMaintenanceMins,
    nextMaintenanceDate: aircraft.nextMaintenanceDate,
    nextMaintenanceType: aircraft.nextMaintenanceType,
    nextMaintenanceMins: aircraft.nextMaintenanceMins,

    totalPercentageHours: aircraft.totalPercentageHours,
    reservedHours: aircraft.reservedHours,
  },

  notes: aircraft.notes as AircraftNote[],

  location: aircraft.location,
  equipment: aircraft.equipment,
  imageUrl: aircraft.imageUrl,
  createdAt: aircraft.createdAt?.toISOString(),
  updatedAt: aircraft.updatedAt?.toISOString(),
  createdBy: aircraft.createdBy,
  updatedBy: aircraft.updatedBy,
})

export async function addAircraft(aircraft: Upsert<Aircraft>, jwt: JWTUser): Promise<Aircraft> {
  const now = new Date()

  const result = await connection.db
    .insertInto('flight.aircraft')
    .values({
      registration: aircraft.registration,
      displayName: aircraft.displayName,
      model: aircraft.model,
      manufacturer: aircraft.manufacturer,
      yearOfManufacture: aircraft.yearOfManufacture,
      seats: aircraft.seats,
      usableFuelLitres: aircraft.usableFuelLitres,
      fuelTypes: aircraft.fuelTypes,
      preferredFuelType: aircraft.preferredFuelType ?? null,
      active: aircraft.active,
      hidden: aircraft.hidden,

      maintenanceCycle: aircraft.maintenance.maintenanceCycle,
      lastMaintenanceDate: aircraft.maintenance.lastMaintenanceDate,
      lastMaintenanceType: aircraft.maintenance.lastMaintenanceType,
      lastMaintenanceMins: aircraft.maintenance.lastMaintenanceMins,
      nextMaintenanceDate: aircraft.maintenance.nextMaintenanceDate,
      nextMaintenanceType: aircraft.maintenance.nextMaintenanceType,
      nextMaintenanceMins: aircraft.maintenance.nextMaintenanceMins,

      totalPercentageHours: aircraft.maintenance.totalPercentageHours,
      reservedHours: aircraft.maintenance.reservedHours,

      notes: JSON.stringify(aircraft.notes),

      location: aircraft.location,
      equipment: aircraft.equipment,
      imageUrl: aircraft.imageUrl,

      ...auditCreate(jwt.memberId, now),
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
  type UpdateAircraftPreferredFuelType = Updateable<FlightAircraft>['preferredFuelType']

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
      displayName: patch.displayName,
      model: patch.model,
      manufacturer: patch.manufacturer,
      yearOfManufacture: patch.yearOfManufacture,
      seats: patch.seats,
      usableFuelLitres: patch.usableFuelLitres,
      fuelTypes: patch.fuelTypes,
      // Either a plain value or the raw CASE expression above; the union of the
      // two is wider than .set() accepts, so the cast is to the column type rather
      // than to any.
      preferredFuelType: preferredFuelType as UpdateAircraftPreferredFuelType,
      active: patch.active,
      hidden: patch.hidden,

      notes: patch.notes ? JSON.stringify(patch.notes) : undefined,
      location: patch.location,
      equipment: patch.equipment,
      imageUrl: patch.imageUrl,
      ...auditUpdate(jwt.memberId, now),
    })
    .$if(!!patch.maintenance, (qb) =>
      qb.set({
        maintenanceCycle: patch.maintenance!.maintenanceCycle,
        lastMaintenanceDate: patch.maintenance!.lastMaintenanceDate,
        lastMaintenanceType: patch.maintenance!.lastMaintenanceType,
        lastMaintenanceMins: patch.maintenance!.lastMaintenanceMins,
        nextMaintenanceDate: patch.maintenance!.nextMaintenanceDate,
        nextMaintenanceType: patch.maintenance!.nextMaintenanceType,
        nextMaintenanceMins: patch.maintenance!.nextMaintenanceMins,
        totalPercentageHours: patch.maintenance?.totalPercentageHours,
        reservedHours: patch.maintenance?.reservedHours,
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
    .selectFrom('flight.fuelTypes')
    .selectAll()
    .orderBy('sortOrder')
    .execute()
  return rows.map((row) => ({ name: row.name, sortOrder: row.sortOrder }))
}
