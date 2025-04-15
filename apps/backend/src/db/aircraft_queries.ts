import * as connection from './connection.ts'
import type { Aircraft } from '../routes/aircrafts/models.ts'

// Get all aircraft
export async function getAllAircraft(): Promise<Aircraft[]> {
  return await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .orderBy('display_name')
    .execute()
}

// Get aircraft by registration
export async function getAircraftByRegistration(registration: string): Promise<Aircraft> {
  return await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .where('registration', '=', registration)
    .executeTakeFirstOrThrow()
}
