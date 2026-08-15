import { camelDb } from './connection.ts'
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
  const rows = await camelDb
    .selectFrom('flight.logs')
    .leftJoin('member.register', 'flight.logs.picMemberId', 'member.register.memberId')
    .select([
      'flight.logs.flightId',
      'flight.logs.offBlockTimeUtc',
      'member.register.firstName',
      'flight.logs.picLastName',
      'flight.logs.fuelUpliftLitres',
      'flight.logs.oilUpliftLitres',
    ])
    .where('flight.logs.aircraftRegistration', '=', filters.aircraftRegistration)
    // Raw on both sides deliberately: the ::date casts are the comparison. A bare
    // column ref would compare the timestamp, so this is one of the fragments that
    // genuinely cannot move into the builder.
    .where(sql`flight.logs.off_block_time_utc::date`, '>=', sql`${filters.startDate}::date`)
    .where(sql`flight.logs.off_block_time_utc::date`, '<=', sql`${filters.endDate}::date`)
    .where((eb) =>
      eb.or([
        eb('flight.logs.fuelUpliftLitres', 'is not', null),
        eb('flight.logs.oilUpliftLitres', 'is not', null),
      ]),
    )
    .orderBy('flight.logs.offBlockTimeUtc', 'asc')
    .execute()

  const data: UpliftReportEntry[] = rows.map((row) => ({
    flightId: row.flightId,
    offBlockTimeUtc: row.offBlockTimeUtc.toISOString(),
    picName: [row.firstName, row.picLastName].filter(Boolean).join(' '),
    fuelUpliftLitres: row.fuelUpliftLitres != null ? Number(row.fuelUpliftLitres) : null,
    oilUpliftLitres: row.oilUpliftLitres != null ? Number(row.oilUpliftLitres) : null,
  }))

  const totalFuelUpliftLitres = data.reduce((sum, e) => sum + (e.fuelUpliftLitres ?? 0), 0)
  const totalOilUpliftLitres = data.reduce((sum, e) => sum + (e.oilUpliftLitres ?? 0), 0)

  // Fetch fuel types for this aircraft
  const aircraft = await camelDb
    .selectFrom('flight.aircraft')
    .select('fuelTypes')
    .where('registration', '=', filters.aircraftRegistration)
    .executeTakeFirst()

  const fuelTypes: string[] = aircraft?.fuelTypes ?? []

  return {
    data,
    summary: {
      totalFuelUpliftLitres,
      totalOilUpliftLitres,
      fuelTypes,
    },
  }
}
