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
  PilotStatistics,
  PilotStatisticsHistogramBin,
} from '../routes/stats/models.ts'

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
  return results.map(row => ({
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

const buildHistogram = (values: number[], binSize: number): PilotStatisticsHistogramBin[] => {
  if (values.length === 0) return []
  const maxVal = Math.max(...values)
  const numBins = Math.max(1, Math.ceil(maxVal / binSize))
  const bins: PilotStatisticsHistogramBin[] = []
  for (let i = 0; i < numBins; i++) {
    const binFrom = i * binSize
    const binTo = (i + 1) * binSize
    const pilotCount = values.filter(v => v >= binFrom && v < binTo).length
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

  const picData = rows.rows.map(r => ({
    totalHours: Number(r.total_flight_mins) / 60,
    uniqueAirports: Number(r.unique_airports),
  }))

  const uniquePicCount = picData.length
  const hoursValues = picData.map(r => r.totalHours)
  const airportValues = picData.map(r => r.uniqueAirports)

  return {
    uniquePicCount,
    hoursHistogram: buildHistogram(hoursValues, 10),
    airportsHistogram: buildHistogram(airportValues, 5),
  }
}
