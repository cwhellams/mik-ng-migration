import { z } from 'zod'

// V540: Total Flight Time Views
export const TotalFlightTimeByAcSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  date: z.string(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const TotalFlightTimeByAcCalendarSchema = z.object({
  aircraft_registration: z.string(),
  date: z.string(),
  total_flight_mins: z.number(),
})

export const TotalFlightTimeByAcYrFtSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  yr: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const TotalFlightTimeByAcYrSchema = z.object({
  aircraft_registration: z.string().nullable(),
  yr: z.number().nullable(),
  total_flight_mins: z.number().nullable(),
})

export const TotalFlightTimeByAcYrMthSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  yr: z.number(),
  mth: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

// V550: DTO Flight Time Views
export const DtoFlightTimeByAcSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  date: z.string(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const DtoFlightTimeByAcYrSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  yr: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const CommercialFlightTimeByAcYrMthSchema = z.object({
  aircraft_registration: z.string(),
  yr: z.number(),
  mth: z.number(),
  total_commercial_flight_mins: z.number(),
})

export const DtoFlightTimeByAcYrMthSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  yr: z.number(),
  mth: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

// V560: Non-Billable Flight Time Views
export const NonBillableFlightTimeByAcSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  date: z.string(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const NonBillableFlightTimeByAcYrSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  yr: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const NonBillableFlightTimeByAcYrMthSchema = z.object({
  aircraft_registration: z.string(),
  flight_type: z.string(),
  yr: z.number(),
  mth: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

// V570: Various Aircraft Stats Views
export const VisitedAirfieldsByAcSchema = z.object({
  aircraft_registration: z.string(),
  yr: z.number(),
  airfield: z.string(),
  total_visits: z.number(),
})

export const TotalLandingsByAcYrSchema = z.object({
  aircraft_registration: z.string(),
  yr: z.number(),
  total_landings: z.number(),
})

export const TotalOilUpliftByAcYrMthSchema = z.object({
  aircraft_registration: z.string(),
  yr: z.number(),
  mth: z.number(),
  total_oil_uplift: z.number(),
})

export const TotalFuelUpliftByAcYrMthSchema = z.object({
  aircraft_registration: z.string(),
  yr: z.number(),
  mth: z.number(),
  total_fuel_uplift: z.number(),
})

export const LongestShortestAvgFlightByAcYrSchema = z.object({
  aircraft_registration: z.string(),
  yr: z.number(),
  longest_flight: z.number(),
  shortest_flight: z.number(),
  average_flight: z.number(),
  median_flight: z.number(),
})

export const MemberCountByTypeSchema = z.object({
  member_type: z.string(),
  member_count: z.number(),
})

// V580: Pilot Flight Time Views
export const TotalFlightTimeByPilotSchema = z.object({
  pilot: z.string(),
  date: z.string(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const TotalFlightTimeByPilotYrSchema = z.object({
  pilot: z.string(),
  yr: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

export const TotalFlightTimeByPilotYrMthSchema = z.object({
  pilot: z.string(),
  yr: z.number(),
  mth: z.number(),
  total_flight_mins: z.number(),
  total_nf_mins: z.number(),
  total_ifr_mins: z.number(),
})

// Type exports
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
