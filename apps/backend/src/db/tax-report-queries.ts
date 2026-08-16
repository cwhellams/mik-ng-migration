import { db } from './connection.ts'
import { sql } from 'kysely'
import type { TaxReportEntry, TaxReportFilters } from '@mik/contracts/tax-reports'

export async function getTaxReport(filters: TaxReportFilters): Promise<TaxReportEntry[]> {
  const result = await db
    .selectFrom('flight.logs')
    .select([
      sql<string>`TO_CHAR(off_block_time_utc, 'YYYY-MM')`.as('month'),
      'aircraftRegistration',
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'C' THEN block_mins ELSE 0 END)`.as(
        'commercialBlockMins',
      ),
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'C' THEN flight_mins ELSE 0 END)`.as(
        'commercialFlightMins',
      ),
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'P' THEN block_mins ELSE 0 END)`.as(
        'privateBlockMins',
      ),
      sql<number>`SUM(CASE WHEN priv_or_com_flight = 'P' THEN flight_mins ELSE 0 END)`.as(
        'privateFlightMins',
      ),
      sql<number>`SUM(block_mins)`.as('totalBlockMins'),
      sql<number>`SUM(flight_mins)`.as('totalFlightMins'),
    ])
    .where(sql`off_block_time_utc::date`, '>=', sql`${filters.startDate}::date`)
    .where(sql`off_block_time_utc::date`, '<=', sql`${filters.endDate}::date`)
    .groupBy([sql`TO_CHAR(off_block_time_utc, 'YYYY-MM')`, 'aircraftRegistration'])
    .orderBy(sql`TO_CHAR(off_block_time_utc, 'YYYY-MM')`, 'asc')
    .orderBy('aircraftRegistration', 'asc')
    .execute()

  return result.map((row) => ({
    month: row.month,
    aircraftRegistration: row.aircraftRegistration,
    commercialBlockMins: Number(row.commercialBlockMins),
    commercialFlightMins: Number(row.commercialFlightMins),
    privateBlockMins: Number(row.privateBlockMins),
    privateFlightMins: Number(row.privateFlightMins),
    totalBlockMins: Number(row.totalBlockMins),
    totalFlightMins: Number(row.totalFlightMins),
  }))
}
