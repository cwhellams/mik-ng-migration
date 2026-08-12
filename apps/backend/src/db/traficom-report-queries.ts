import { db } from './connection.ts'
import { sql } from 'kysely'
import {
  TraficomReportFilter,
  type TraficomReportEntry,
  type TraficomReportFilters,
} from '@mik/contracts/traficom-reports'

/**
 * Returns the SQL fragment used to identify flight log entries that match the
 * selected filter category.
 *
 * Mapping:
 *  - ALL              -> no restriction (TRUE)
 *  - PRIVATE          -> flight_type = 'PRIVATE'
 *  - SCHOOL           -> any school flight (DTO and non-DTO), i.e. flight_type IN ('SCHOOL', 'DTO')
 *  - DTO_SCHOOL       -> DTO school flights, i.e. flight_type = 'DTO'
 *  - NON_DTO_SCHOOL   -> non-DTO school flights, i.e. flight_type = 'SCHOOL'
 *
 * Note: in this codebase a flight is stored with flight_type = 'DTO' iff it is
 * a DTO training flight (see flight-log-queries.ts), so flight_type alone
 * suffices to discriminate DTO vs non-DTO school flights.
 */
function filterCondition(filter: TraficomReportFilter) {
  switch (filter) {
    case TraficomReportFilter.PRIVATE:
      return sql<boolean>`flight_type = 'PRIVATE'`
    case TraficomReportFilter.SCHOOL:
      return sql<boolean>`flight_type IN ('SCHOOL', 'DTO')`
    case TraficomReportFilter.DTO_SCHOOL:
      return sql<boolean>`flight_type = 'DTO'`
    case TraficomReportFilter.NON_DTO_SCHOOL:
      return sql<boolean>`flight_type = 'SCHOOL'`
    case TraficomReportFilter.ALL:
    default:
      return sql<boolean>`TRUE`
  }
}

export async function getTraficomReport(
  filters: TraficomReportFilters,
): Promise<TraficomReportEntry[]> {
  const cond = filterCondition(filters.filter)
  const yearStart = `${filters.year}-01-01`
  const yearEnd = `${filters.year}-12-31`

  const result = await db
    .selectFrom('flight.logs')
    .select([
      'aircraft_registration',
      // Filtered, selected year
      sql<number>`COUNT(*) FILTER (
        WHERE ${cond}
          AND off_block_time_utc::date >= ${yearStart}::date
          AND off_block_time_utc::date <= ${yearEnd}::date
      )`.as('flights'),
      sql<number>`COALESCE(SUM(number_of_landings) FILTER (
        WHERE ${cond}
          AND off_block_time_utc::date >= ${yearStart}::date
          AND off_block_time_utc::date <= ${yearEnd}::date
      ), 0)`.as('landings'),
      sql<number>`COALESCE(SUM(number_of_landings) FILTER (
        WHERE ${cond}
          AND arrival_airport = 'ZZZZ'
          AND off_block_time_utc::date >= ${yearStart}::date
          AND off_block_time_utc::date <= ${yearEnd}::date
      ), 0)`.as('zzzz_landings'),
      // Selected year totals (with filter)
      sql<number>`COALESCE(SUM(flight_mins) FILTER (
        WHERE ${cond}
          AND off_block_time_utc::date >= ${yearStart}::date
          AND off_block_time_utc::date <= ${yearEnd}::date
      ), 0)`.as('year_total_flight_mins'),
      // Selected year totals (no filter, all flight types)
      sql<number>`COALESCE(SUM(number_of_landings) FILTER (
        WHERE off_block_time_utc::date >= ${yearStart}::date
          AND off_block_time_utc::date <= ${yearEnd}::date
      ), 0)`.as('year_total_landings'),
      // Lifetime totals (no filter, all dates)
      sql<number>`COALESCE(SUM(flight_mins), 0)`.as('lifetime_total_flight_mins'),
      sql<number>`COALESCE(SUM(number_of_landings), 0)`.as('lifetime_total_landings'),
    ])
    .groupBy('aircraft_registration')
    .orderBy('aircraft_registration', 'asc')
    .execute()

  return (
    result
      .map((row) => ({
        aircraftRegistration: row.aircraft_registration,
        flights: Number(row.flights),
        landings: Number(row.landings),
        zzzzLandings: Number(row.zzzz_landings),
        yearTotalFlightMins: Number(row.year_total_flight_mins),
        yearTotalLandings: Number(row.year_total_landings),
        lifetimeTotalFlightMins: Number(row.lifetime_total_flight_mins),
        lifetimeTotalLandings: Number(row.lifetime_total_landings),
      }))
      // Only include aircraft that have activity matching the selected filter
      // in the selected year. Aircraft with no flights/landings for the chosen
      // filter (e.g. an aircraft that only had school flights when
      // filter=PRIVATE) are omitted to avoid noisy zero rows.
      .filter((row) => row.flights > 0 || row.landings > 0)
  )
}
