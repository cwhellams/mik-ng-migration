import { z } from 'zod'

// Cloud information tuple: [type, height in hundreds of feet, cloudType]
// Example: ["SCT", 8, ""] means Scattered clouds at 800 feet
export const CloudSchema = z.tuple([
  z.string(), // Cloud coverage type: SCT, BKN, OVC, FEW, etc.
  z.number(), // Height in hundreds of feet
  z.string(), // Cloud type (often empty string)
])

export const WeatherReportSchema = z.object({
  dewpoint: z.number(),
  datetime_unix: z.number(),
  clouds: z.array(CloudSchema).optional(),
  wind_rose: z.array(z.array(z.number())),
  repid: z.string(),
  features: z.array(z.string()),
  wind_gust_ms: z.number().optional(),
  wind_ms: z.number(),
  temperature: z.number(),
  humidity: z.number(),
  vvis: z.number().optional(), // Vertical visibility
  wind_dir_min: z.number(),
  visibility: z.number(),
  datetime_utc: z.string(),
  qnh: z.number(),
  pressure: z.number(),
  wind_dir: z.number(),
  wind_gust_kt: z.number().optional(),
  wind_kt: z.number(),
  wind_dir_max: z.number(),
  atistime: z.string(),
  wind_dir_diff: z.number(),
  vvis_ft: z.number().optional(), // Vertical visibility in feet
  time: z.number(),
  vis_m: z.number().optional(), // Visibility in meters
  vis_km: z.number().optional(), // Visibility in kilometers
  vis_km_full: z.number().optional(), // Full visibility in kilometers
})

export const WeatherStateSchema = z.object({
  atisTx: z.string(),
  message: z.array(z.string()),
  report: WeatherReportSchema,
  timestamp: z.number(),
  expires: z.number(),
  mp3: z.string(),
})

export const WeatherResponseSchema = z.object({
  result: z.string(),
  site: z.string(),
  states: z.array(WeatherStateSchema),
})

export type WeatherReport = z.infer<typeof WeatherReportSchema>
export type WeatherState = z.infer<typeof WeatherStateSchema>
export type WeatherResponse = z.infer<typeof WeatherResponseSchema>
export type CloudInfo = z.infer<typeof CloudSchema>
