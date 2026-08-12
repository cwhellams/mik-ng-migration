import { db } from './connection.ts'
import { sql } from 'kysely'
import type {
  UpliftReportEntry,
  UpliftReportFilters,
  UpliftReportSummary,
} from '@mik/contracts/uplift-reports'

export async function getUpliftReport(filters: UpliftReportFilters): Promise<{
  data: UpliftReportEntry[]
  summary: UpliftReportSummary
}> {
  const rows = await db
    .selectFrom('flight.logs')
    .leftJoin('member.register', 'flight.logs.pic_member_id', 'member.register.member_id')
    .select([
      'flight.logs.flight_id',
      'flight.logs.off_block_time_utc',
      'member.register.first_name',
      'flight.logs.pic_last_name',
      'flight.logs.fuel_uplift_litres',
      'flight.logs.oil_uplift_litres',
    ])
    .where('flight.logs.aircraft_registration', '=', filters.aircraftRegistration)
    .where(sql`flight.logs.off_block_time_utc::date`, '>=', sql`${filters.startDate}::date`)
    .where(sql`flight.logs.off_block_time_utc::date`, '<=', sql`${filters.endDate}::date`)
    .where((eb) =>
      eb.or([
        eb('flight.logs.fuel_uplift_litres', 'is not', null),
        eb('flight.logs.oil_uplift_litres', 'is not', null),
      ]),
    )
    .orderBy('flight.logs.off_block_time_utc', 'asc')
    .execute()

  const data: UpliftReportEntry[] = rows.map((row) => ({
    flightId: row.flight_id,
    offBlockTimeUtc: row.off_block_time_utc.toISOString(),
    picName: [row.first_name, row.pic_last_name].filter(Boolean).join(' '),
    fuelUpliftLitres: row.fuel_uplift_litres != null ? Number(row.fuel_uplift_litres) : null,
    oilUpliftLitres: row.oil_uplift_litres != null ? Number(row.oil_uplift_litres) : null,
  }))

  const totalFuelUpliftLitres = data.reduce((sum, e) => sum + (e.fuelUpliftLitres ?? 0), 0)
  const totalOilUpliftLitres = data.reduce((sum, e) => sum + (e.oilUpliftLitres ?? 0), 0)

  // Fetch fuel types for this aircraft
  const aircraft = await db
    .selectFrom('flight.aircraft')
    .select('fuel_types')
    .where('registration', '=', filters.aircraftRegistration)
    .executeTakeFirst()

  const fuelTypes: string[] = aircraft?.fuel_types ?? []

  return {
    data,
    summary: {
      totalFuelUpliftLitres,
      totalOilUpliftLitres,
      fuelTypes,
    },
  }
}
