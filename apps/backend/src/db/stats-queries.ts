import { camelDb } from './connection.ts'
import { sql } from 'kysely'
import type { SelectQueryBuilder } from 'kysely'
import type {
  TotalFlightTimeByAc,
  TotalFlightTimeByAcYr,
  TotalFlightTimeByAcYrFt,
  TotalFlightTimeByAcYrMth,
  DtoFlightTimeByAc,
  DtoFlightTimeByAcYr,
  DtoFlightTimeByAcYrMth,
  NonBillableFlightTimeByAc,
  NonBillableFlightTimeByAcYr,
  NonBillableFlightTimeByAcYrMth,
  VisitedAirfieldsByAc,
  TotalLandingsByAcYr,
  TotalOilUpliftByAcYrMth,
  TotalFuelUpliftByAcYrMth,
  LongestShortestAvgFlightByAcYr,
  MemberCountByType,
  TotalFlightTimeByPilot,
  TotalFlightTimeByPilotYr,
  TotalFlightTimeByPilotYrMth,
  TotalFlightTimeByAcCalendar,
  CommercialFlightTimeByAcYrMth,
  MyStatistics,
  PilotStatistics,
  PilotStatisticsHistogramBin,
  ReservationEfficiencyByYr,
  ReservationEfficiencyByYrMth,
  ReservationEfficiencyByAcYr,
  ReservationEfficiencyByAcYrMth,
  ReservationEfficiencyByMemberYr,
  ReservationEfficiencyByMemberYrMth,
  AirfieldEfficiencyByYr,
  AirfieldEfficiencyByYrMth,
  AirfieldEfficiencyByAcYr,
  AirfieldEfficiencyByAcYrMth,
  AogDaysByAcYrMth,
  AogDaysByAcYr,
  PobDistributionByAcYr,
  OccurrencesPerHundredHrsByAcYr,
  SchoolFlightEfficiencyByYr,
  SchoolFlightEfficiencyByYrMth,
  SchoolFlightEfficiencyByAcYr,
  SchoolFlightEfficiencyByAcYrMth,
  SchoolFlightEfficiencyByInstructorYr,
  SchoolFlightEfficiencyByInstructorYrMth,
} from '@mik/contracts/stats'

// Helper function to apply year filters
const applyYearFilter = <DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  filters?: { yr?: number; yrFrom?: number; yrTo?: number },
): SelectQueryBuilder<DB, TB, O> => {
  if (!filters) return query

  if (filters.yr) {
    return query.where('yr' as any, '=', filters.yr)
  }

  if (filters.yrFrom) {
    query = query.where('yr' as any, '>=', filters.yrFrom)
  }
  if (filters.yrTo) {
    query = query.where('yr' as any, '<=', filters.yrTo)
  }

  return query
}

export const getTotalFlightTimeByAcDt = async (filters?: {
  aircraftRegistration?: string
  dateFrom?: string
  dateTo?: string
}): Promise<TotalFlightTimeByAcCalendar[]> => {
  let query = camelDb.selectFrom('stats.totalFlightTimeByAcDt').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }

  if (filters?.dateFrom) {
    query = query.where('date', '>=', filters.dateFrom)
  }

  if (filters?.dateTo) {
    query = query.where('date', '<=', filters.dateTo)
  }

  return await query.execute()
}

// V540: Total Flight Time Queries
export const getTotalFlightTimeByAc = async (filters?: {
  aircraftRegistration?: string
  date?: string
  dateFrom?: string
  dateTo?: string
}): Promise<TotalFlightTimeByAc[]> => {
  let query = camelDb.selectFrom('stats.totalFlightTimeByAcFt').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  if (filters?.date) {
    query = query.where('date', '=', filters.date)
  }

  if (filters?.dateFrom) {
    query = query.where('date', '>=', filters.dateFrom)
  }

  if (filters?.dateTo) {
    query = query.where('date', '<=', filters.dateTo)
  }

  return await query.execute()
}

export const getTotalFlightTimeByAcYrFt = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<TotalFlightTimeByAcYrFt[]> => {
  let query = camelDb.selectFrom('stats.totalFlightTimeByAcYrFt').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalFlightTimeByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<TotalFlightTimeByAcYr[]> => {
  let query = camelDb
    .selectFrom('stats.totalFlightTimeByAcYr')
    .select(['aircraftRegistration', 'totalFlightMins', 'yr'])

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    totalFlightMins: row.totalFlightMins != null ? Number(row.totalFlightMins) : null,
  }))
}

export const getTotalFlightTimeByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<TotalFlightTimeByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.totalFlightTimeByAcYrMthFt').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

// V560: Non-Billable Flight Time Queries
export const getNonBillableFlightTimeByAc = async (filters?: {
  aircraftRegistration?: string
  date?: string
}): Promise<NonBillableFlightTimeByAc[]> => {
  let query = camelDb.selectFrom('stats.nonBillableTotalFlightTimeByAc').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  if (filters?.date) {
    query = query.where('date', '=', filters.date)
  }

  return await query.execute()
}

export const getNonBillableFlightTimeByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<NonBillableFlightTimeByAcYr[]> => {
  let query = camelDb.selectFrom('stats.nonBillableTotalFlightTimeByAcYr').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getNonBillableFlightTimeByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<NonBillableFlightTimeByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.nonBillableTotalFlightTimeByAcYrMth').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

// V570: Various Aircraft Stats Queries
export const getVisitedAirfieldsByAc = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<VisitedAirfieldsByAc[]> => {
  let query = camelDb.selectFrom('stats.visitedAirfieldsByAc').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalLandingsByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<TotalLandingsByAcYr[]> => {
  let query = camelDb.selectFrom('stats.totalLandingsByAcYr').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalOilUpliftByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<TotalOilUpliftByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.totalOilUpliftByAcYrMth').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

export const getTotalFuelUpliftByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<TotalFuelUpliftByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.totalFuelUpliftByAcYrMth').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

export const getLongestShortestAvgFlightByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<LongestShortestAvgFlightByAcYr[]> => {
  let query = camelDb.selectFrom('stats.longestShortestAvgFlightByAcYr').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getMemberCountByType = async (): Promise<MemberCountByType[]> => {
  return await camelDb.selectFrom('stats.memberCountByType').selectAll().execute()
}

// V580: Pilot Flight Time Queries
export const getTotalFlightTimeByPilot = async (filters?: {
  pilot?: string
  date?: string
}): Promise<TotalFlightTimeByPilot[]> => {
  let query = camelDb.selectFrom('stats.totalFlightTimeByPilot').selectAll()

  if (filters?.pilot) {
    query = query.where('pilot', '=', filters.pilot)
  }
  if (filters?.date) {
    query = query.where('date', '=', filters.date)
  }

  return await query.execute()
}

export const getTotalFlightTimeByPilotYr = async (filters?: {
  pilot?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<TotalFlightTimeByPilotYr[]> => {
  let query = camelDb.selectFrom('stats.totalFlightTimeByPilotYr').selectAll()

  if (filters?.pilot) {
    query = query.where('pilot', '=', filters.pilot)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalFlightTimeByPilotYrMth = async (filters?: {
  pilot?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<TotalFlightTimeByPilotYrMth[]> => {
  let query = camelDb.selectFrom('stats.totalFlightTimeByPilotYrMth').selectAll()

  if (filters?.pilot) {
    query = query.where('pilot', '=', filters.pilot)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

// V550: DTO Flight Time Queries
export const getDtoFlightTimeByAc = async (filters?: {
  aircraftRegistration?: string
  date?: string
}): Promise<DtoFlightTimeByAc[]> => {
  let query = camelDb.selectFrom('stats.dtoTotalFlightTimeByAc').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  if (filters?.date) {
    query = query.where('date', '=', filters.date)
  }

  return await query.execute()
}

// V1380: AOG (Aircraft On Ground) days — maintenance bookings + outstanding defects
export const getAogDaysByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<AogDaysByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.aogDaysByAcYrMth').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    maintenanceDays: Number(row.maintenanceDays),
    unserviceableDays: Number(row.unserviceableDays),
    totalAogDays: Number(row.totalAogDays),
  }))
}

export const getAogDaysByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<AogDaysByAcYr[]> => {
  let query = camelDb.selectFrom('stats.aogDaysByAcYr').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    maintenanceDays: Number(row.maintenanceDays),
    unserviceableDays: Number(row.unserviceableDays),
    totalAogDays: Number(row.totalAogDays),
  }))
}

export const getDtoFlightTimeByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<DtoFlightTimeByAcYr[]> => {
  let query = camelDb.selectFrom('stats.dtoTotalFlightTimeByAcYr').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getDtoFlightTimeByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<DtoFlightTimeByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.dtoTotalFlightTimeByAcYrMth').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

export const getCommercialFlightTimeByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<CommercialFlightTimeByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.totalCommercialFlightTimeByAcYrMth').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

// Builds a histogram of fixed-size bins [binFrom, binTo) for the given values.
// The last bin uses an inclusive upper bound to capture the maximum value.
// Returns an empty array for empty input.
const buildHistogram = (values: number[], binSize: number): PilotStatisticsHistogramBin[] => {
  if (values.length === 0) return []
  const maxVal = Math.max(...values)
  const numBins = Math.max(1, Math.ceil(maxVal / binSize))
  const bins: PilotStatisticsHistogramBin[] = []
  for (let i = 0; i < numBins; i++) {
    const binFrom = i * binSize
    const binTo = (i + 1) * binSize
    const isLastBin = i === numBins - 1
    const pilotCount = values.filter(
      (v) => v >= binFrom && (isLastBin ? v <= binTo : v < binTo),
    ).length
    bins.push({ binFrom, binTo, pilotCount })
  }
  return bins
}

export const getPilotStatistics = async (filters: {
  from: string
  to: string
}): Promise<PilotStatistics> => {
  const rows = await sql<{
    picMemberId: string
    totalFlightMins: number
    uniqueAirports: number
  }>`
    WITH flight_data AS (
      SELECT
        pic_member_id,
        flight_mins,
        departure_airport,
        arrival_airport
      FROM flight.logs
      WHERE TO_TIMESTAMP(takeoff_time_epoch)::date >= ${filters.from}::date
        AND TO_TIMESTAMP(takeoff_time_epoch)::date <= ${filters.to}::date
    ),
    pic_times AS (
      SELECT pic_member_id, SUM(flight_mins) AS total_flight_mins
      FROM flight_data
      GROUP BY pic_member_id
    ),
    pic_airports AS (
      SELECT pic_member_id, COUNT(DISTINCT airport) AS unique_airports
      FROM (
        SELECT pic_member_id, departure_airport AS airport FROM flight_data
        WHERE departure_airport IS NOT NULL
          AND LENGTH(TRIM(departure_airport)) >= 2
          AND departure_airport ~ '^[A-Z]'
        UNION
        SELECT pic_member_id, arrival_airport AS airport FROM flight_data
        WHERE arrival_airport IS NOT NULL
          AND LENGTH(TRIM(arrival_airport)) >= 2
          AND arrival_airport ~ '^[A-Z]'
      ) a
      GROUP BY pic_member_id
    )
    SELECT
      t.pic_member_id,
      t.total_flight_mins::float AS total_flight_mins,
      COALESCE(a.unique_airports, 0)::int AS unique_airports
    FROM pic_times t
    LEFT JOIN pic_airports a ON t.pic_member_id = a.pic_member_id
  `.execute(camelDb)

  const picData = rows.rows.map((r) => ({
    totalHours: Number(r.totalFlightMins) / 60,
    uniqueAirports: Number(r.uniqueAirports),
  }))

  const uniquePicCount = picData.length
  const hoursValues = picData.map((r) => r.totalHours)
  const airportValues = picData.map((r) => r.uniqueAirports)

  return {
    uniquePicCount,
    hoursHistogram: buildHistogram(hoursValues, 2),
    airportsHistogram: buildHistogram(airportValues, 2),
  }
}

// My Statistics — personal stats for a single member.
//
// Scoped on picMemberId rather than billable_member_id: this view answers
// "what have I flown", so a flight someone else paid for still counts as mine,
// and a flight billed to me but flown by someone else does not.
export const getMyStatistics = async (filters: {
  memberId: string
  dateFrom?: string
  dateTo?: string
  aircraftRegistration?: string
}): Promise<MyStatistics> => {
  // Shared predicate for every aggregate below. Starts with WHERE so callers can
  // append further AND conditions.
  const where = sql`
    WHERE pic_member_id = ${filters.memberId}
    ${
      filters.dateFrom
        ? sql`AND takeoff_time_epoch >= EXTRACT(EPOCH FROM ${filters.dateFrom}::date)::bigint`
        : sql``
    }
    ${
      filters.dateTo
        ? sql`AND takeoff_time_epoch < EXTRACT(EPOCH FROM (${filters.dateTo}::date + INTERVAL '1 day'))::bigint`
        : sql``
    }
    ${
      filters.aircraftRegistration
        ? sql`AND aircraft_registration = ${filters.aircraftRegistration}`
        : sql``
    }
  `

  const [totalsResult, airportsResult, dailyResult] = await Promise.all([
    sql<{
      flightCount: number
      totalFlightMins: number
      totalBlockMins: number
      totalLandings: number
    }>`
      SELECT
        COUNT(*)::int AS flight_count,
        COALESCE(SUM(flight_mins), 0)::int AS total_flight_mins,
        COALESCE(SUM(block_mins), 0)::int AS total_block_mins,
        COALESCE(SUM(number_of_landings), 0)::int AS total_landings
      FROM flight.logs
      ${where}
    `.execute(camelDb),

    // Same airport-code sanity filter as getPilotStatistics so the two agree.
    sql<{ uniqueAirports: number }>`
      SELECT COUNT(DISTINCT airport)::int AS unique_airports
      FROM (
        SELECT departure_airport AS airport
        FROM flight.logs
        ${where}
          AND departure_airport IS NOT NULL
          AND LENGTH(TRIM(departure_airport)) >= 2
          AND departure_airport ~ '^[A-Z]'
        UNION
        SELECT arrival_airport AS airport
        FROM flight.logs
        ${where}
          AND arrival_airport IS NOT NULL
          AND LENGTH(TRIM(arrival_airport)) >= 2
          AND arrival_airport ~ '^[A-Z]'
      ) a
    `.execute(camelDb),

    sql<{ date: string; flightMins: number }>`
      SELECT
        TO_CHAR(TO_TIMESTAMP(takeoff_time_epoch)::date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(flight_mins), 0)::int AS flight_mins
      FROM flight.logs
      ${where}
      GROUP BY 1
      ORDER BY 1
    `.execute(camelDb),
  ])

  const totalsRow = totalsResult.rows[0]
  const daily = dailyResult.rows.map((r) => ({
    date: r.date,
    flightMins: Number(r.flightMins),
  }))

  // Roll the daily series up to months rather than issuing a fourth query.
  const monthlyMins = new Map<string, number>()
  for (const day of daily) {
    const key = day.date.slice(0, 7)
    monthlyMins.set(key, (monthlyMins.get(key) ?? 0) + day.flightMins)
  }
  const monthly = Array.from(monthlyMins.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, flightMins]) => ({
      yr: Number(key.slice(0, 4)),
      mth: Number(key.slice(5, 7)),
      flightMins,
    }))

  return {
    totals: {
      flightCount: Number(totalsRow?.flightCount ?? 0),
      totalFlightMins: Number(totalsRow?.totalFlightMins ?? 0),
      totalBlockMins: Number(totalsRow?.totalBlockMins ?? 0),
      totalLandings: Number(totalsRow?.totalLandings ?? 0),
      uniqueAirports: Number(airportsResult.rows[0]?.uniqueAirports ?? 0),
    },
    daily,
    monthly,
  }
}

// V1010: Reservation Efficiency Queries
export const getReservationEfficiencyByYr = async (filters?: {
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<ReservationEfficiencyByYr[]> => {
  let query = camelDb.selectFrom('stats.reservationEfficiencyByYr').selectAll()
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getReservationEfficiencyByYrMth = async (filters?: {
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<ReservationEfficiencyByYrMth[]> => {
  let query = camelDb.selectFrom('stats.reservationEfficiencyByYrMth').selectAll()
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getReservationEfficiencyByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<ReservationEfficiencyByAcYr[]> => {
  let query = camelDb.selectFrom('stats.reservationEfficiencyByAcYr').selectAll()
  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getReservationEfficiencyByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<ReservationEfficiencyByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.reservationEfficiencyByAcYrMth').selectAll()
  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getReservationEfficiencyByMemberYr = async (filters?: {
  member?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<ReservationEfficiencyByMemberYr[]> => {
  let query = camelDb.selectFrom('stats.reservationEfficiencyByMemberYr').selectAll()
  if (filters?.member) {
    query = query.where('member', '=', filters.member)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getReservationEfficiencyByMemberYrMth = async (filters?: {
  member?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<ReservationEfficiencyByMemberYrMth[]> => {
  let query = camelDb.selectFrom('stats.reservationEfficiencyByMemberYrMth').selectAll()
  if (filters?.member) {
    query = query.where('member', '=', filters.member)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getAirfieldEfficiencyByYr = async (filters?: {
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<AirfieldEfficiencyByYr[]> => {
  let query = camelDb.selectFrom('stats.airfieldEfficiencyByYr').selectAll()
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getAirfieldEfficiencyByYrMth = async (filters?: {
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<AirfieldEfficiencyByYrMth[]> => {
  let query = camelDb.selectFrom('stats.airfieldEfficiencyByYrMth').selectAll()
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getAirfieldEfficiencyByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<AirfieldEfficiencyByAcYr[]> => {
  let query = camelDb.selectFrom('stats.airfieldEfficiencyByAcYr').selectAll()
  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

// Occupancy (persons-on-board) distribution, restricted to aircraft with >2 seats
export const getPobDistributionByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<PobDistributionByAcYr[]> => {
  let query = camelDb.selectFrom('stats.pobDistributionByAcYr').selectAll()

  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    yr: Number(row.yr),
    flightCount: Number(row.flightCount),
    crossCountryFlightCount: Number(row.crossCountryFlightCount),
    totalFlightMins: Number(row.totalFlightMins),
  })) as PobDistributionByAcYr[]
}

// V1680: Safety performance — occurrences per 100 flight hours, per aircraft per year
export const getOccurrencesPerHundredHrsByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<OccurrencesPerHundredHrsByAcYr[]> => {
  // This one view cannot be addressed through the query builder. The identifier
  // transformer turns `occurrencesPer100hByAcYr` into `occurrences_per100h_by_ac_yr`,
  // but the view is `occurrences_per_100h_by_ac_yr` — a digit is not a word boundary
  // going camel -> snake, though it is going snake -> camel. `schema.camel.d.ts` says
  // the name is fine because kysely-codegen only ever does the second direction, so
  // this compiles and then fails at runtime. Raw SQL text is never transformed, so
  // spelling the view out is the fix; the *result* keys still come back camelCase,
  // which is why the mapping below reads row.occurrencesPer100h.
  const { rows: results } = await sql<{
    aircraftRegistration: string | null
    yr: number | null
    occurrenceCount: number | null
    totalFlightMins: number | null
    occurrencesPer100h: number | null
  }>`
    SELECT * FROM stats.occurrences_per_100h_by_ac_yr
    WHERE TRUE
    ${
      filters?.aircraftRegistration
        ? sql`AND aircraft_registration = ${filters.aircraftRegistration}`
        : sql``
    }
    ${
      // Mirrors applyYearFilter: an exact yr wins outright and the range is ignored.
      filters?.yr
        ? sql`AND yr = ${filters.yr}`
        : sql`
          ${filters?.yrFrom ? sql`AND yr >= ${filters.yrFrom}` : sql``}
          ${filters?.yrTo ? sql`AND yr <= ${filters.yrTo}` : sql``}
        `
    }
  `.execute(camelDb)

  return results.map((row) => ({
    ...row,
    yr: row.yr != null ? Number(row.yr) : null,
    occurrenceCount: row.occurrenceCount != null ? Number(row.occurrenceCount) : null,
    totalFlightMins: row.totalFlightMins != null ? Number(row.totalFlightMins) : null,
    occurrencesPer100h: row.occurrencesPer100h != null ? Number(row.occurrencesPer100h) : null,
  }))
}

export const getAirfieldEfficiencyByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<AirfieldEfficiencyByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.airfieldEfficiencyByAcYrMth').selectAll()
  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

// V1760: School Flight Reservation Efficiency Queries
export const getSchoolFlightEfficiencyByYr = async (filters?: {
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<SchoolFlightEfficiencyByYr[]> => {
  let query = camelDb.selectFrom('stats.schoolFlightEfficiencyByYr').selectAll()
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getSchoolFlightEfficiencyByYrMth = async (filters?: {
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<SchoolFlightEfficiencyByYrMth[]> => {
  let query = camelDb.selectFrom('stats.schoolFlightEfficiencyByYrMth').selectAll()
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getSchoolFlightEfficiencyByAcYr = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<SchoolFlightEfficiencyByAcYr[]> => {
  let query = camelDb.selectFrom('stats.schoolFlightEfficiencyByAcYr').selectAll()
  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getSchoolFlightEfficiencyByAcYrMth = async (filters?: {
  aircraftRegistration?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<SchoolFlightEfficiencyByAcYrMth[]> => {
  let query = camelDb.selectFrom('stats.schoolFlightEfficiencyByAcYrMth').selectAll()
  if (filters?.aircraftRegistration) {
    query = query.where('aircraftRegistration', '=', filters.aircraftRegistration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getSchoolFlightEfficiencyByInstructorYr = async (filters?: {
  instructor?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
}): Promise<SchoolFlightEfficiencyByInstructorYr[]> => {
  let query = camelDb.selectFrom('stats.schoolFlightEfficiencyByInstructorYr').selectAll()
  if (filters?.instructor) {
    query = query.where('instructor', '=', filters.instructor)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getSchoolFlightEfficiencyByInstructorYrMth = async (filters?: {
  instructor?: string
  yr?: number
  yrFrom?: number
  yrTo?: number
  mth?: number
}): Promise<SchoolFlightEfficiencyByInstructorYrMth[]> => {
  let query = camelDb.selectFrom('stats.schoolFlightEfficiencyByInstructorYrMth').selectAll()
  if (filters?.instructor) {
    query = query.where('instructor', '=', filters.instructor)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}
