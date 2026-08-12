import { db } from './connection.ts'
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
  filters?: { yr?: number; yr_from?: number; yr_to?: number },
): SelectQueryBuilder<DB, TB, O> => {
  if (!filters) return query

  if (filters.yr) {
    return query.where('yr' as any, '=', filters.yr)
  }

  if (filters.yr_from) {
    query = query.where('yr' as any, '>=', filters.yr_from)
  }
  if (filters.yr_to) {
    query = query.where('yr' as any, '<=', filters.yr_to)
  }

  return query
}

export const getTotalFlightTimeByAcDt = async (filters?: {
  aircraft_registration?: string
  date_from?: string
  date_to?: string
}): Promise<TotalFlightTimeByAcCalendar[]> => {
  let query = db.selectFrom('stats.total_flight_time_by_ac_dt').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }

  if (filters?.date_from) {
    query = query.where('date', '>=', filters.date_from)
  }

  if (filters?.date_to) {
    query = query.where('date', '<=', filters.date_to)
  }

  return await query.execute()
}

// V540: Total Flight Time Queries
export const getTotalFlightTimeByAc = async (filters?: {
  aircraft_registration?: string
  date?: string
  date_from?: string
  date_to?: string
}): Promise<TotalFlightTimeByAc[]> => {
  let query = db.selectFrom('stats.total_flight_time_by_ac_ft').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  if (filters?.date) {
    query = query.where('date', '=', filters.date)
  }

  if (filters?.date_from) {
    query = query.where('date', '>=', filters.date_from)
  }

  if (filters?.date_to) {
    query = query.where('date', '<=', filters.date_to)
  }

  return await query.execute()
}

export const getTotalFlightTimeByAcYrFt = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<TotalFlightTimeByAcYrFt[]> => {
  let query = db.selectFrom('stats.total_flight_time_by_ac_yr_ft').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalFlightTimeByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<TotalFlightTimeByAcYr[]> => {
  let query = db
    .selectFrom('stats.total_flight_time_by_ac_yr')
    .select(['aircraft_registration', 'total_flight_mins', 'yr'])

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    total_flight_mins: row.total_flight_mins ? Number(row.total_flight_mins) : null,
  }))
}

export const getTotalFlightTimeByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<TotalFlightTimeByAcYrMth[]> => {
  let query = db.selectFrom('stats.total_flight_time_by_ac_yr_mth_ft').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

// V560: Non-Billable Flight Time Queries
export const getNonBillableFlightTimeByAc = async (filters?: {
  aircraft_registration?: string
  date?: string
}): Promise<NonBillableFlightTimeByAc[]> => {
  let query = db.selectFrom('stats.non_billable_total_flight_time_by_ac').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  if (filters?.date) {
    query = query.where('date', '=', filters.date)
  }

  return await query.execute()
}

export const getNonBillableFlightTimeByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<NonBillableFlightTimeByAcYr[]> => {
  let query = db.selectFrom('stats.non_billable_total_flight_time_by_ac_yr').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getNonBillableFlightTimeByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<NonBillableFlightTimeByAcYrMth[]> => {
  let query = db.selectFrom('stats.non_billable_total_flight_time_by_ac_yr_mth').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

// V570: Various Aircraft Stats Queries
export const getVisitedAirfieldsByAc = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<VisitedAirfieldsByAc[]> => {
  let query = db.selectFrom('stats.visited_airfields_by_ac').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalLandingsByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<TotalLandingsByAcYr[]> => {
  let query = db.selectFrom('stats.total_landings_by_ac_yr').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalOilUpliftByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<TotalOilUpliftByAcYrMth[]> => {
  let query = db.selectFrom('stats.total_oil_uplift_by_ac_yr_mth').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

export const getTotalFuelUpliftByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<TotalFuelUpliftByAcYrMth[]> => {
  let query = db.selectFrom('stats.total_fuel_uplift_by_ac_yr_mth').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

export const getLongestShortestAvgFlightByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<LongestShortestAvgFlightByAcYr[]> => {
  let query = db.selectFrom('stats.longest_shortest_avg_flight_by_ac_yr').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getMemberCountByType = async (): Promise<MemberCountByType[]> => {
  return await db.selectFrom('stats.member_count_by_type').selectAll().execute()
}

// V580: Pilot Flight Time Queries
export const getTotalFlightTimeByPilot = async (filters?: {
  pilot?: string
  date?: string
}): Promise<TotalFlightTimeByPilot[]> => {
  let query = db.selectFrom('stats.total_flight_time_by_pilot').selectAll()

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
  yr_from?: number
  yr_to?: number
}): Promise<TotalFlightTimeByPilotYr[]> => {
  let query = db.selectFrom('stats.total_flight_time_by_pilot_yr').selectAll()

  if (filters?.pilot) {
    query = query.where('pilot', '=', filters.pilot)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getTotalFlightTimeByPilotYrMth = async (filters?: {
  pilot?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<TotalFlightTimeByPilotYrMth[]> => {
  let query = db.selectFrom('stats.total_flight_time_by_pilot_yr_mth').selectAll()

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
  aircraft_registration?: string
  date?: string
}): Promise<DtoFlightTimeByAc[]> => {
  let query = db.selectFrom('stats.dto_total_flight_time_by_ac').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  if (filters?.date) {
    query = query.where('date', '=', filters.date)
  }

  return await query.execute()
}

// V1380: AOG (Aircraft On Ground) days — maintenance bookings + outstanding defects
export const getAogDaysByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<AogDaysByAcYrMth[]> => {
  let query = db.selectFrom('stats.aog_days_by_ac_yr_mth').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    maintenance_days: Number(row.maintenance_days),
    unserviceable_days: Number(row.unserviceable_days),
    total_aog_days: Number(row.total_aog_days),
  }))
}

export const getAogDaysByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<AogDaysByAcYr[]> => {
  let query = db.selectFrom('stats.aog_days_by_ac_yr').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    maintenance_days: Number(row.maintenance_days),
    unserviceable_days: Number(row.unserviceable_days),
    total_aog_days: Number(row.total_aog_days),
  }))
}

export const getDtoFlightTimeByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<DtoFlightTimeByAcYr[]> => {
  let query = db.selectFrom('stats.dto_total_flight_time_by_ac_yr').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  return await query.execute()
}

export const getDtoFlightTimeByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<DtoFlightTimeByAcYrMth[]> => {
  let query = db.selectFrom('stats.dto_total_flight_time_by_ac_yr_mth').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }

  return await query.execute()
}

export const getCommercialFlightTimeByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<CommercialFlightTimeByAcYrMth[]> => {
  let query = db.selectFrom('stats.total_commercial_flight_time_by_ac_yr_mth').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
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
    pic_member_id: string
    total_flight_mins: number
    unique_airports: number
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
  `.execute(db)

  const picData = rows.rows.map((r) => ({
    totalHours: Number(r.total_flight_mins) / 60,
    uniqueAirports: Number(r.unique_airports),
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
// Scoped on pic_member_id rather than billable_member_id: this view answers
// "what have I flown", so a flight someone else paid for still counts as mine,
// and a flight billed to me but flown by someone else does not.
export const getMyStatistics = async (filters: {
  memberId: string
  date_from?: string
  date_to?: string
  aircraft_registration?: string
}): Promise<MyStatistics> => {
  // Shared predicate for every aggregate below. Starts with WHERE so callers can
  // append further AND conditions.
  const where = sql`
    WHERE pic_member_id = ${filters.memberId}
    ${
      filters.date_from
        ? sql`AND takeoff_time_epoch >= EXTRACT(EPOCH FROM ${filters.date_from}::date)::bigint`
        : sql``
    }
    ${
      filters.date_to
        ? sql`AND takeoff_time_epoch < EXTRACT(EPOCH FROM (${filters.date_to}::date + INTERVAL '1 day'))::bigint`
        : sql``
    }
    ${
      filters.aircraft_registration
        ? sql`AND aircraft_registration = ${filters.aircraft_registration}`
        : sql``
    }
  `

  const [totalsResult, airportsResult, dailyResult] = await Promise.all([
    sql<{
      flight_count: number
      total_flight_mins: number
      total_block_mins: number
      total_landings: number
    }>`
      SELECT
        COUNT(*)::int AS flight_count,
        COALESCE(SUM(flight_mins), 0)::int AS total_flight_mins,
        COALESCE(SUM(block_mins), 0)::int AS total_block_mins,
        COALESCE(SUM(number_of_landings), 0)::int AS total_landings
      FROM flight.logs
      ${where}
    `.execute(db),

    // Same airport-code sanity filter as getPilotStatistics so the two agree.
    sql<{ unique_airports: number }>`
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
    `.execute(db),

    sql<{ date: string; flight_mins: number }>`
      SELECT
        TO_CHAR(TO_TIMESTAMP(takeoff_time_epoch)::date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(flight_mins), 0)::int AS flight_mins
      FROM flight.logs
      ${where}
      GROUP BY 1
      ORDER BY 1
    `.execute(db),
  ])

  const totalsRow = totalsResult.rows[0]
  const daily = dailyResult.rows.map((r) => ({
    date: r.date,
    flightMins: Number(r.flight_mins),
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
      flightCount: Number(totalsRow?.flight_count ?? 0),
      totalFlightMins: Number(totalsRow?.total_flight_mins ?? 0),
      totalBlockMins: Number(totalsRow?.total_block_mins ?? 0),
      totalLandings: Number(totalsRow?.total_landings ?? 0),
      uniqueAirports: Number(airportsResult.rows[0]?.unique_airports ?? 0),
    },
    daily,
    monthly,
  }
}

// V1010: Reservation Efficiency Queries
export const getReservationEfficiencyByYr = async (filters?: {
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<ReservationEfficiencyByYr[]> => {
  let query = db.selectFrom('stats.reservation_efficiency_by_yr').selectAll()
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getReservationEfficiencyByYrMth = async (filters?: {
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<ReservationEfficiencyByYrMth[]> => {
  let query = db.selectFrom('stats.reservation_efficiency_by_yr_mth').selectAll()
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getReservationEfficiencyByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<ReservationEfficiencyByAcYr[]> => {
  let query = db.selectFrom('stats.reservation_efficiency_by_ac_yr').selectAll()
  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getReservationEfficiencyByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<ReservationEfficiencyByAcYrMth[]> => {
  let query = db.selectFrom('stats.reservation_efficiency_by_ac_yr_mth').selectAll()
  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
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
  yr_from?: number
  yr_to?: number
}): Promise<ReservationEfficiencyByMemberYr[]> => {
  let query = db.selectFrom('stats.reservation_efficiency_by_member_yr').selectAll()
  if (filters?.member) {
    query = query.where('member', '=', filters.member)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getReservationEfficiencyByMemberYrMth = async (filters?: {
  member?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<ReservationEfficiencyByMemberYrMth[]> => {
  let query = db.selectFrom('stats.reservation_efficiency_by_member_yr_mth').selectAll()
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
  yr_from?: number
  yr_to?: number
}): Promise<AirfieldEfficiencyByYr[]> => {
  let query = db.selectFrom('stats.airfield_efficiency_by_yr').selectAll()
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getAirfieldEfficiencyByYrMth = async (filters?: {
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<AirfieldEfficiencyByYrMth[]> => {
  let query = db.selectFrom('stats.airfield_efficiency_by_yr_mth').selectAll()
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getAirfieldEfficiencyByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<AirfieldEfficiencyByAcYr[]> => {
  let query = db.selectFrom('stats.airfield_efficiency_by_ac_yr').selectAll()
  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

// Occupancy (persons-on-board) distribution, restricted to aircraft with >2 seats
export const getPobDistributionByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<PobDistributionByAcYr[]> => {
  let query = db.selectFrom('stats.pob_distribution_by_ac_yr').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    yr: Number(row.yr),
    flight_count: Number(row.flight_count),
    cross_country_flight_count: Number(row.cross_country_flight_count),
    total_flight_mins: Number(row.total_flight_mins),
  })) as PobDistributionByAcYr[]
}

// V1680: Safety performance — occurrences per 100 flight hours, per aircraft per year
export const getOccurrencesPerHundredHrsByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<OccurrencesPerHundredHrsByAcYr[]> => {
  let query = db.selectFrom('stats.occurrences_per_100h_by_ac_yr').selectAll()

  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)

  const results = await query.execute()
  return results.map((row) => ({
    ...row,
    yr: row.yr != null ? Number(row.yr) : null,
    occurrence_count: row.occurrence_count != null ? Number(row.occurrence_count) : null,
    total_flight_mins: row.total_flight_mins != null ? Number(row.total_flight_mins) : null,
    occurrences_per_100h:
      row.occurrences_per_100h != null ? Number(row.occurrences_per_100h) : null,
  }))
}

export const getAirfieldEfficiencyByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<AirfieldEfficiencyByAcYrMth[]> => {
  let query = db.selectFrom('stats.airfield_efficiency_by_ac_yr_mth').selectAll()
  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
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
  yr_from?: number
  yr_to?: number
}): Promise<SchoolFlightEfficiencyByYr[]> => {
  let query = db.selectFrom('stats.school_flight_efficiency_by_yr').selectAll()
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getSchoolFlightEfficiencyByYrMth = async (filters?: {
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<SchoolFlightEfficiencyByYrMth[]> => {
  let query = db.selectFrom('stats.school_flight_efficiency_by_yr_mth').selectAll()
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}

export const getSchoolFlightEfficiencyByAcYr = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
}): Promise<SchoolFlightEfficiencyByAcYr[]> => {
  let query = db.selectFrom('stats.school_flight_efficiency_by_ac_yr').selectAll()
  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getSchoolFlightEfficiencyByAcYrMth = async (filters?: {
  aircraft_registration?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<SchoolFlightEfficiencyByAcYrMth[]> => {
  let query = db.selectFrom('stats.school_flight_efficiency_by_ac_yr_mth').selectAll()
  if (filters?.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
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
  yr_from?: number
  yr_to?: number
}): Promise<SchoolFlightEfficiencyByInstructorYr[]> => {
  let query = db.selectFrom('stats.school_flight_efficiency_by_instructor_yr').selectAll()
  if (filters?.instructor) {
    query = query.where('instructor', '=', filters.instructor)
  }
  query = applyYearFilter(query, filters)
  return await query.execute()
}

export const getSchoolFlightEfficiencyByInstructorYrMth = async (filters?: {
  instructor?: string
  yr?: number
  yr_from?: number
  yr_to?: number
  mth?: number
}): Promise<SchoolFlightEfficiencyByInstructorYrMth[]> => {
  let query = db.selectFrom('stats.school_flight_efficiency_by_instructor_yr_mth').selectAll()
  if (filters?.instructor) {
    query = query.where('instructor', '=', filters.instructor)
  }
  query = applyYearFilter(query, filters)
  if (filters?.mth) {
    query = query.where('mth', '=', filters.mth)
  }
  return await query.execute()
}
