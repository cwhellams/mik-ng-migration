export interface WeatherReport {
  wind_dir_min: number
  dewpoint: number
  visibility: number
  datetime_unix: number
  datetime_utc: string
  qnh: number
  pressure: number
  wind_dir: number
  clouds: Array<{
    type?: string
    height?: number
  }>
  wind_rose: number[][]
  repid: string
  wind_kt: number
  vis_km_full: number
  wind_dir_max: number
  features: string[]
  wind_ms: number
  atistime: string
  temperature: number
  vis_km: number
  humidity: number
  wind_dir_diff: number
  time: number
}

export interface WeatherState {
  atisTx: string
  message: string[]
  expires: number
  mp3: string
  report: WeatherReport
  timestamp: number
}

export interface WeatherResponse {
  result: string
  site: string
  states: WeatherState[]
}
