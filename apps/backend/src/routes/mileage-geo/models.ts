import { z } from 'zod'

export const LatLonSchema = z.object({
  lat: z.number(),
  lon: z.number(),
})
export type LatLon = z.infer<typeof LatLonSchema>

export const AddressSearchResultSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
})
export type AddressSearchResult = z.infer<typeof AddressSearchResultSchema>

export const AddressSearchResponseSchema = z.object({
  results: z.array(AddressSearchResultSchema),
})
export type AddressSearchResponse = z.infer<typeof AddressSearchResponseSchema>

export const RouteDistanceRequestSchema = z.object({
  start: LatLonSchema,
  end: LatLonSchema,
  waypoints: z.array(LatLonSchema).default([]),
})
export type RouteDistanceRequest = z.infer<typeof RouteDistanceRequestSchema>

export const RouteDistanceResponseSchema = z.object({
  distanceKm: z.number(),
  directDistanceKm: z.number(),
})
export type RouteDistanceResponse = z.infer<typeof RouteDistanceResponseSchema>
