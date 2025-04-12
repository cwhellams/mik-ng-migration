import type { Selectable } from 'kysely'

import * as connection from './connection.ts'
import type { FlightAircraft } from './schema.js'
import { type Aircraft } from '../routes/aircrafts/models.ts'

// Get all aircraft
export const getAllAircraft = async (onlyActive: boolean): Promise<Aircraft[]> => {
  const aircrafts = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .$if(onlyActive, qb => qb.where('active', '=', true))
    .orderBy('display_name')
    .execute()

  return aircrafts.map(toAircraft)
}

// Get aircraft by registration
export const getAircraftByRegistration = async (
  registration: string,
  onlyActive: boolean,
): Promise<Aircraft | undefined> => {
  const aircraft = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .where('registration', '=', registration)
    .$if(onlyActive, qb => qb.where('active', '=', true))
    .executeTakeFirst()
  if (aircraft) {
    return toAircraft(aircraft)
  }
}

const toAircraft = (aircraft: Selectable<FlightAircraft>): Aircraft => ({
  registration: aircraft.registration,
  displayName: aircraft.display_name,
  model: aircraft.model,
  manufacturer: aircraft.manufacturer,
  yearOfManufacture: aircraft.year_of_manufacture,

  maintenance: {
    maintenanceCycle: aircraft.maintenance_cycle,
    lastMaintenanceDate: aircraft.last_maintenance_date,
    lastMaintenanceType: aircraft.next_maintenance_type,
    lastMaintenanceTach: aircraft.last_maintenance_tach,
    nextMaintenanceDate: aircraft.next_maintenance_date,
    nextMaintenanceType: aircraft.next_maintenance_type,
    nextMaintenanceTach: aircraft.next_maintenance_tach,

    totalPercentageHours: aircraft.total_percentage_hours,
    usablePercentageHours: aircraft.usable_percentage_hours,
  },

  warnings: aircraft.warnings,
  cautions: aircraft.cautions,
  notes: aircraft.notes,

  location: aircraft.location,
  equipment: aircraft.equipment,
  hourlyRateEur: aircraft.hourly_rate_eur,
  createdAt: aircraft.created_at?.toISOString(),
  updatedAt: aircraft.updated_at?.toISOString(),
  createdBy: aircraft.created_by,
  updatedBy: aircraft.updated_by,
})
