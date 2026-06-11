import { db } from './connection.ts'
import { sql } from 'kysely'
import type { TaxReportEntry, TaxReportFilters } from '../routes/tax-reports/models.ts'

export async function getTaxReport(filters: TaxReportFilters): Promise<TaxReportEntry[]> {
  const result = await db
    .selectFrom('flight.logs')
    .select([
      sql<string>`TO_CHAR(off_block_time_utc, 'YYYY-MM')`.as('month'),
      'aircraft_registration',
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'C' THEN block_mins ELSE 0 END)`.as(
        'commercial_block_mins',
      ),
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'C' THEN flight_mins ELSE 0 END)`.as(
        'commercial_flight_mins',
      ),
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'P' THEN block_mins ELSE 0 END)`.as(
        'private_block_mins',
      ),
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'P' THEN flight_mins ELSE 0 END)`.as(
        'private_flight_mins',
      ),
      sql<number>`SUM(block_mins)`.as('total_block_mins'),
      sql<number>`SUM(flight_mins)`.as('total_flight_mins'),
    ])
    .where(sql`off_block_time_utc::date`, '>=', sql`${filters.startDate}::date`)
    .where(sql`off_block_time_utc::date`, '<=', sql`${filters.endDate}::date`)
    .groupBy([sql`TO_CHAR(off_block_time_utc, 'YYYY-MM')`, 'aircraft_registration'])
    .orderBy(sql`TO_CHAR(off_block_time_utc, 'YYYY-MM')`, 'asc')
    .orderBy('aircraft_registration', 'asc')
    .execute()

  return result.map((row) => ({
    month: row.month,
    aircraftRegistration: row.aircraft_registration,
    commercialBlockMins: Number(row.commercial_block_mins),
    commercialFlightMins: Number(row.commercial_flight_mins),
    privateBlockMins: Number(row.private_block_mins),
    privateFlightMins: Number(row.private_flight_mins),
    totalBlockMins: Number(row.total_block_mins),
    totalFlightMins: Number(row.total_flight_mins),
  }))
}
