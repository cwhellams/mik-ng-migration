import type { Selectable } from 'kysely'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  OccurrenceCategory,
  OccurrenceStatus,
  type Occurrence,
  type OccurrenceUpsert,
} from '../routes/occurrences/models.ts'
import { generateShortId } from '../util/nanoId.ts'
import * as connection from './connection.ts'
import type { FlightOccurrences } from './schema.js'

const toOccurrence = (row: Selectable<FlightOccurrences>): Occurrence => ({
  id: row.report_id,
  occurrenceDate: row.occurrence_date.toISOString(),
  reportDate: row.report_date.toISOString(),
  deadLine: row.dead_line?.toISOString(),
  status: row.status as OccurrenceStatus,
  headline: row.headline,
  aircraftRegistration: row.registration,
  categories: row.categories as OccurrenceCategory[],
  description: row.description,
  location: row.location,
  isWeatherRelevant: row.is_weather_relevant,
  animalNumber: row.animal_number,
  animalSize: row.animal_size,
  animalSpecies: row.animal_species,
  arrivalAirport: row.arrival_airport,
  departureAirport: row.departure_airport,
  isDtoReport: row.is_dto_report,
  linkedReportId: row.linked_report_id,
  createdAt: row.created_at.toISOString(),
  createdBy: row.created_by,
  updatedAt: row.updated_at.toISOString(),
  updatedBy: row.updated_by,
})

export const getOccurrence = async (
  reportId: string,
  limitations: {
    owner?: string
    statuses?: OccurrenceStatus[]
  },
): Promise<Occurrence | undefined> => {
  const result = await connection.db
    .selectFrom('flight.occurrences')
    .selectAll()
    .$if(!!limitations.owner, qb => qb.where(eb => eb('created_by', '=', limitations.owner!)))
    .where(eb =>
      eb(
        'status',
        limitations.statuses ? 'in' : 'not in',
        limitations.statuses ?? [OccurrenceStatus.DELETED],
      ),
    )
    .where('report_id', '=', reportId)
    .executeTakeFirst()

  return result ? toOccurrence(result) : undefined
}

export async function getOccurrences(limitations: {
  owner?: string
  statuses?: OccurrenceStatus[]
}): Promise<Occurrence[]> {
  const results = await connection.db
    .selectFrom('flight.occurrences')
    .selectAll()
    .$if(!!limitations.owner, qb => qb.where(eb => eb('created_by', '=', limitations.owner!)))
    .where(eb =>
      eb(
        'status',
        limitations.statuses ? 'in' : 'not in',
        limitations.statuses ?? [OccurrenceStatus.DELETED],
      ),
    )
    .orderBy('report_date', 'desc')
    // keep the anonymized report with the same report date ordered first
    .orderBy('created_at', 'desc')
    .execute()

  return results.map(toOccurrence)
}

export async function createOccurrence(
  occurrence: OccurrenceUpsert & {
    reportDate: string
    deadLine: string | undefined
    status: OccurrenceStatus
    linkedReportId: string | null
  },
  user: JWTUser,
): Promise<Occurrence> {
  const now = new Date()

  const created: Occurrence = {
    ...occurrence,
    id: generateShortId(),
    createdAt: now.toISOString(),
    createdBy: user.memberId!,
    updatedAt: now.toISOString(),
    updatedBy: user.memberId!,
  }

  await connection.db
    .insertInto('flight.occurrences')
    .values({
      report_id: created.id,
      occurrence_date: created.occurrenceDate,
      report_date: created.reportDate,
      dead_line: created.deadLine,
      status: created.status,
      headline: created.headline,
      location: created.location,
      description: created.description,
      categories: JSON.stringify(created.categories),
      is_weather_relevant: created.isWeatherRelevant,
      animal_number: created.animalNumber,
      animal_size: created.animalSize,
      animal_species: created.animalSpecies,
      registration: created.aircraftRegistration,
      arrival_airport: created.arrivalAirport,
      departure_airport: created.departureAirport,
      is_dto_report: created.isDtoReport,
      linked_report_id: created.linkedReportId,
      created_at: created.createdAt,
      created_by: created.createdBy,
      updated_at: created.updatedAt,
      updated_by: created.updatedBy,
    })
    .execute()

  return created
}
export async function updateOccurrence(
  existing: Occurrence,
  patch: Partial<
    OccurrenceUpsert & {
      status: OccurrenceStatus
      linkedReportId: string | null
      deadLine: string | undefined
    }
  >,
  user: JWTUser,
): Promise<Occurrence> {
  const now = new Date().toISOString()
  const updated: Occurrence = {
    ...existing,
    ...patch,
    updatedBy: user.memberId!,
    updatedAt: now,
  }

  await connection.db
    .updateTable('flight.occurrences')
    .set({
      occurrence_date: patch.occurrenceDate,
      dead_line: patch.deadLine,
      status: patch.status,
      headline: patch.headline,
      location: patch.location,
      description: patch.description,
      categories: patch.categories ? JSON.stringify(patch.categories) : undefined,
      is_weather_relevant: patch.isWeatherRelevant,
      animal_number: patch.animalNumber,
      animal_size: patch.animalSize,
      animal_species: patch.animalSpecies,
      registration: patch.aircraftRegistration,
      arrival_airport: patch.arrivalAirport,
      departure_airport: patch.departureAirport,
      is_dto_report: patch.isDtoReport,
      linked_report_id: patch.linkedReportId,
      updated_by: updated.updatedBy,
      updated_at: updated.updatedAt,
    })
    .where('report_id', '=', existing.id)
    .execute()

  return updated
}
