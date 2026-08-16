import { z } from 'zod'

// V540: Total Flight Time Views
export const TotalFlightTimeByAcSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  date: z.string(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const TotalFlightTimeByAcCalendarSchema = z.object({
  aircraftRegistration: z.string(),
  date: z.string(),
  totalFlightMins: z.number(),
})

export const TotalFlightTimeByAcYrFtSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  yr: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const TotalFlightTimeByAcYrSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
})

export const TotalFlightTimeByAcYrMthSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  yr: z.number(),
  mth: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

// V550: DTO Flight Time Views
export const DtoFlightTimeByAcSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  date: z.string(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const DtoFlightTimeByAcYrSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  yr: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const CommercialFlightTimeByAcYrMthSchema = z.object({
  aircraftRegistration: z.string(),
  yr: z.number(),
  mth: z.number(),
  totalCommercialFlightMins: z.number(),
})

export const DtoFlightTimeByAcYrMthSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  yr: z.number(),
  mth: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

// V560: Non-Billable Flight Time Views
export const NonBillableFlightTimeByAcSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  date: z.string(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const NonBillableFlightTimeByAcYrSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  yr: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const NonBillableFlightTimeByAcYrMthSchema = z.object({
  aircraftRegistration: z.string(),
  flightType: z.string(),
  yr: z.number(),
  mth: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

// V570: Various Aircraft Stats Views
export const VisitedAirfieldsByAcSchema = z.object({
  aircraftRegistration: z.string(),
  yr: z.number(),
  airfield: z.string(),
  totalVisits: z.number(),
})

export const TotalLandingsByAcYrSchema = z.object({
  aircraftRegistration: z.string(),
  yr: z.number(),
  totalLandings: z.number(),
})

export const TotalOilUpliftByAcYrMthSchema = z.object({
  aircraftRegistration: z.string(),
  yr: z.number(),
  mth: z.number(),
  totalOilUplift: z.number(),
})

export const TotalFuelUpliftByAcYrMthSchema = z.object({
  aircraftRegistration: z.string(),
  yr: z.number(),
  mth: z.number(),
  totalFuelUplift: z.number(),
})

export const LongestShortestAvgFlightByAcYrSchema = z.object({
  aircraftRegistration: z.string(),
  yr: z.number(),
  longestFlight: z.number(),
  shortestFlight: z.number(),
  averageFlight: z.number(),
  medianFlight: z.number(),
})

export const MemberCountByTypeSchema = z.object({
  memberType: z.string(),
  memberCount: z.number(),
})

// V580: Pilot Flight Time Views
export const TotalFlightTimeByPilotSchema = z.object({
  pilot: z.string(),
  date: z.string(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const TotalFlightTimeByPilotYrSchema = z.object({
  pilot: z.string(),
  yr: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

export const TotalFlightTimeByPilotYrMthSchema = z.object({
  pilot: z.string(),
  yr: z.number(),
  mth: z.number(),
  totalFlightMins: z.number(),
  totalNfMins: z.number(),
  totalIfrMins: z.number(),
})

// V1000: Reservation Efficiency Views
export const ReservationEfficiencyByYrSchema = z.object({
  yr: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const ReservationEfficiencyByYrMthSchema = z.object({
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const ReservationEfficiencyByAcYrSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const ReservationEfficiencyByAcYrMthSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const ReservationEfficiencyByMemberYrSchema = z.object({
  member: z.string().nullable(),
  yr: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const ReservationEfficiencyByMemberYrMthSchema = z.object({
  member: z.string().nullable(),
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const AirfieldEfficiencyByYrSchema = z.object({
  yr: z.number().nullable(),
  efnuEfnuMins: z.number().nullable(),
  inboundOutboundMins: z.number().nullable(),
  awayMins: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const AirfieldEfficiencyByYrMthSchema = z.object({
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  efnuEfnuMins: z.number().nullable(),
  inboundOutboundMins: z.number().nullable(),
  awayMins: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const AirfieldEfficiencyByAcYrSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  efnuEfnuMins: z.number().nullable(),
  inboundOutboundMins: z.number().nullable(),
  awayMins: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const AirfieldEfficiencyByAcYrMthSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  efnuEfnuMins: z.number().nullable(),
  inboundOutboundMins: z.number().nullable(),
  awayMins: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

// V1760: School Flight Reservation Efficiency Views
// School flight reservation efficiency = block time flown / time reserved,
// restricted to school (training) flights only.
export const SchoolFlightEfficiencyByYrSchema = z.object({
  yr: z.number().nullable(),
  totalBlockMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const SchoolFlightEfficiencyByYrMthSchema = z.object({
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  totalBlockMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const SchoolFlightEfficiencyByAcYrSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  totalBlockMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const SchoolFlightEfficiencyByAcYrMthSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  totalBlockMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const SchoolFlightEfficiencyByInstructorYrSchema = z.object({
  instructor: z.string().nullable(),
  yr: z.number().nullable(),
  totalBlockMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

export const SchoolFlightEfficiencyByInstructorYrMthSchema = z.object({
  instructor: z.string().nullable(),
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  totalBlockMins: z.number().nullable(),
  totalReservedMins: z.number().nullable(),
  efficiencyPct: z.number().nullable(),
})

// AOG (Aircraft On Ground) days — maintenance bookings + outstanding defects
export const AogDaysByAcYrMthSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  mth: z.number().nullable(),
  maintenanceDays: z.number(),
  unserviceableDays: z.number(),
  totalAogDays: z.number(),
})

export const AogDaysByAcYrSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  maintenanceDays: z.number(),
  unserviceableDays: z.number(),
  totalAogDays: z.number(),
})

// Occupancy (persons-on-board) distribution, restricted to aircraft with >2 seats
export const PobDistributionByAcYrSchema = z.object({
  aircraftRegistration: z.string(),
  yr: z.number(),
  pobBucket: z.enum(['1_2', '3', '4_PLUS']),
  flightCount: z.number(),
  crossCountryFlightCount: z.number(),
  totalFlightMins: z.number(),
})

// Safety performance: occurrences per 100 flight hours, per aircraft per year
export const OccurrencesPerHundredHrsByAcYrSchema = z.object({
  aircraftRegistration: z.string().nullable(),
  yr: z.number().nullable(),
  occurrenceCount: z.number().nullable(),
  totalFlightMins: z.number().nullable(),
  occurrencesPer100h: z.number().nullable(),
})

// Pilot Statistics
export const PilotStatisticsHistogramBinSchema = z.object({
  binFrom: z.number(),
  binTo: z.number(),
  pilotCount: z.number(),
})

export const PilotStatisticsSchema = z.object({
  uniquePicCount: z.number(),
  hoursHistogram: z.array(PilotStatisticsHistogramBinSchema),
  airportsHistogram: z.array(PilotStatisticsHistogramBinSchema),
})

// My Statistics — personal, self-scoped stats for the authenticated member.
// Scoped on pic_member_id: this is "flights I flew", not "flights billed to me".
export const MyStatisticsTotalsSchema = z.object({
  flightCount: z.number(),
  totalFlightMins: z.number(),
  totalBlockMins: z.number(),
  totalLandings: z.number(),
  uniqueAirports: z.number(),
})

export const MyStatisticsDaySchema = z.object({
  date: z.string(),
  flightMins: z.number(),
})

export const MyStatisticsMonthSchema = z.object({
  yr: z.number(),
  mth: z.number(),
  flightMins: z.number(),
})

export const MyStatisticsSchema = z.object({
  totals: MyStatisticsTotalsSchema,
  daily: z.array(MyStatisticsDaySchema),
  monthly: z.array(MyStatisticsMonthSchema),
})

export const MyStatisticsFilterSchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  aircraftRegistration: z.string().min(1).optional(),
})

// Type exports
export type MyStatisticsTotals = z.infer<typeof MyStatisticsTotalsSchema>
export type MyStatisticsDay = z.infer<typeof MyStatisticsDaySchema>
export type MyStatisticsMonth = z.infer<typeof MyStatisticsMonthSchema>
export type MyStatistics = z.infer<typeof MyStatisticsSchema>
export type MyStatisticsFilter = z.infer<typeof MyStatisticsFilterSchema>
export type PilotStatisticsHistogramBin = z.infer<typeof PilotStatisticsHistogramBinSchema>
export type PilotStatistics = z.infer<typeof PilotStatisticsSchema>
export type TotalFlightTimeByAc = z.infer<typeof TotalFlightTimeByAcSchema>
export type TotalFlightTimeByAcCalendar = z.infer<typeof TotalFlightTimeByAcCalendarSchema>
export type TotalFlightTimeByAcYr = z.infer<typeof TotalFlightTimeByAcYrSchema>
export type TotalFlightTimeByAcYrFt = z.infer<typeof TotalFlightTimeByAcYrFtSchema>
export type TotalFlightTimeByAcYrMth = z.infer<typeof TotalFlightTimeByAcYrMthSchema>
export type DtoFlightTimeByAc = z.infer<typeof DtoFlightTimeByAcSchema>
export type DtoFlightTimeByAcYr = z.infer<typeof DtoFlightTimeByAcYrSchema>
export type DtoFlightTimeByAcYrMth = z.infer<typeof DtoFlightTimeByAcYrMthSchema>
export type NonBillableFlightTimeByAc = z.infer<typeof NonBillableFlightTimeByAcSchema>
export type NonBillableFlightTimeByAcYr = z.infer<typeof NonBillableFlightTimeByAcYrSchema>
export type NonBillableFlightTimeByAcYrMth = z.infer<typeof NonBillableFlightTimeByAcYrMthSchema>
export type VisitedAirfieldsByAc = z.infer<typeof VisitedAirfieldsByAcSchema>
export type TotalLandingsByAcYr = z.infer<typeof TotalLandingsByAcYrSchema>
export type TotalOilUpliftByAcYrMth = z.infer<typeof TotalOilUpliftByAcYrMthSchema>
export type TotalFuelUpliftByAcYrMth = z.infer<typeof TotalFuelUpliftByAcYrMthSchema>
export type LongestShortestAvgFlightByAcYr = z.infer<typeof LongestShortestAvgFlightByAcYrSchema>
export type MemberCountByType = z.infer<typeof MemberCountByTypeSchema>
export type TotalFlightTimeByPilot = z.infer<typeof TotalFlightTimeByPilotSchema>
export type TotalFlightTimeByPilotYr = z.infer<typeof TotalFlightTimeByPilotYrSchema>
export type TotalFlightTimeByPilotYrMth = z.infer<typeof TotalFlightTimeByPilotYrMthSchema>
export type CommercialFlightTimeByAcYrMth = z.infer<typeof CommercialFlightTimeByAcYrMthSchema>
export type ReservationEfficiencyByYr = z.infer<typeof ReservationEfficiencyByYrSchema>
export type ReservationEfficiencyByYrMth = z.infer<typeof ReservationEfficiencyByYrMthSchema>
export type ReservationEfficiencyByAcYr = z.infer<typeof ReservationEfficiencyByAcYrSchema>
export type ReservationEfficiencyByAcYrMth = z.infer<typeof ReservationEfficiencyByAcYrMthSchema>
export type ReservationEfficiencyByMemberYr = z.infer<typeof ReservationEfficiencyByMemberYrSchema>
export type ReservationEfficiencyByMemberYrMth = z.infer<
  typeof ReservationEfficiencyByMemberYrMthSchema
>
export type AirfieldEfficiencyByYr = z.infer<typeof AirfieldEfficiencyByYrSchema>
export type AirfieldEfficiencyByYrMth = z.infer<typeof AirfieldEfficiencyByYrMthSchema>
export type AirfieldEfficiencyByAcYr = z.infer<typeof AirfieldEfficiencyByAcYrSchema>
export type AirfieldEfficiencyByAcYrMth = z.infer<typeof AirfieldEfficiencyByAcYrMthSchema>
export type AogDaysByAcYrMth = z.infer<typeof AogDaysByAcYrMthSchema>
export type AogDaysByAcYr = z.infer<typeof AogDaysByAcYrSchema>
export type PobDistributionByAcYr = z.infer<typeof PobDistributionByAcYrSchema>
export type OccurrencesPerHundredHrsByAcYr = z.infer<typeof OccurrencesPerHundredHrsByAcYrSchema>
export type SchoolFlightEfficiencyByYr = z.infer<typeof SchoolFlightEfficiencyByYrSchema>
export type SchoolFlightEfficiencyByYrMth = z.infer<typeof SchoolFlightEfficiencyByYrMthSchema>
export type SchoolFlightEfficiencyByAcYr = z.infer<typeof SchoolFlightEfficiencyByAcYrSchema>
export type SchoolFlightEfficiencyByAcYrMth = z.infer<typeof SchoolFlightEfficiencyByAcYrMthSchema>
export type SchoolFlightEfficiencyByInstructorYr = z.infer<
  typeof SchoolFlightEfficiencyByInstructorYrSchema
>
export type SchoolFlightEfficiencyByInstructorYrMth = z.infer<
  typeof SchoolFlightEfficiencyByInstructorYrMthSchema
>
