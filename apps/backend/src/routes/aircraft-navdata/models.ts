import { z } from 'zod'

// Aircraft navdata entry schema
export const NavdataSchema = z.object({
  navdataId: z.string().guid().optional(),
  aircraftRegistration: z.string().min(1).max(10),
  updaterMemberId: z.string().min(1).max(9),
  updaterName: z.string().optional(), // joined from member register
  updateDate: z.string().date(),
  cycle: z.string().min(1).max(10),
  expires: z.string().date(),
  createdAt: z.string().datetime().optional(),
  createdBy: z.string().optional(),
})

export type Navdata = z.infer<typeof NavdataSchema>

// Schema for POST requests — only mutable fields; navdataId and createdAt/createdBy set by server
export const NavdataCreateSchema = z.object({
  aircraftRegistration: z.string().min(1).max(10),
  updaterMemberId: z.string().min(1).max(9),
  updateDate: z.string().date(),
  cycle: z.string().min(1).max(10),
  expires: z.string().date(),
})

export type NavdataCreate = z.infer<typeof NavdataCreateSchema>

// Filters for navdata records
export const NavdataFiltersSchema = z.object({
  aircraftRegistration: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
})

export type NavdataFilters = z.infer<typeof NavdataFiltersSchema>

// Response types
export interface NavdataListResponse {
  records: Navdata[]
  total: number
}
