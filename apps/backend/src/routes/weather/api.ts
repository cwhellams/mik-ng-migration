import { Router } from 'express'
import type { Request, Response } from 'express'
import axios from 'axios'

import { type WeatherResponse } from '@mik/contracts/weather'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'

export const router = Router()

const WEATHER_API_BASE_URL =
  process.env.WEATHER_API_BASE_URL ??
  'https://78sy389733.execute-api.eu-west-1.amazonaws.com/dev/0-atis-state'
const WEATHER_AUDIO_BASE_URL = process.env.WEATHER_AUDIO_BASE_URL ?? 'https://info.efnu.fi/mp3'
const METAR_CENTRAL_BASE_URL = 'https://metarcentral.com/api/weather'

// EFNU uses a custom ATIS API; all other ICAO sites use METAR Central
const EFNU_SITE = 'efnu'

interface MetarCentralCloud {
  type: string | null
  altitude: number
  coverage: string
}

interface MetarCentralDecoded {
  clouds: MetarCentralCloud[]
  weather: string[]
  dewpoint: number
  pressure: number
  wind_gust: number | null
  visibility: string | null
  wind_speed: number
  temperature: number
  flight_rules: string
  wind_direction: number | null
}

interface MetarCentralResponse {
  icao: string
  metar: {
    raw: string
    decoded: MetarCentralDecoded
    observation_time: string
  }
  flight_rules: string
}

function parseVisibility(visStr: string | null): { vis_m?: number; vis_km: number } {
  if (!visStr) return { vis_km: 10 }
  const kmMatch = visStr.match(/^([\d.]+)\+?\s*km$/i)
  if (kmMatch) return { vis_km: parseFloat(kmMatch[1]) }
  const mMatch = visStr.match(/^(\d+)\s*m$/i)
  if (mMatch) {
    const vis_m = parseInt(mMatch[1])
    return { vis_m, vis_km: vis_m / 1000 }
  }
  return { vis_km: 10 }
}

function calcHumidity(temp: number, dewpoint: number): number {
  const magnus = (t: number) => Math.exp((17.625 * t) / (243.04 + t))
  return Math.min(100, Math.round((100 * magnus(dewpoint)) / magnus(temp)))
}

function buildWindRose(windDir: number, windKt: number): number[][] {
  const bins = 16
  const rose: number[][] = Array.from({ length: bins }, () => [0, 0, 0])
  if (windKt > 0) {
    const idx = Math.round(windDir / (360 / bins)) % bins
    rose[idx] = [windKt, windKt, 100]
  }
  return rose
}

function mapMetarToWeatherResponse(data: MetarCentralResponse): WeatherResponse {
  const decoded = data.metar.decoded
  const obsTime = new Date(data.metar.observation_time)
  if (isNaN(obsTime.getTime())) {
    throw new Error(`Invalid observation_time from METAR Central: ${data.metar.observation_time}`)
  }
  const datetime_unix = Math.floor(obsTime.getTime() / 1000)

  const { vis_m, vis_km } = parseVisibility(decoded.visibility)

  const clouds =
    decoded.clouds.length > 0
      ? decoded.clouds.map((c): [string, number, string] => [
          c.coverage,
          Math.round(c.altitude / 100),
          c.type ?? '',
        ])
      : undefined

  const windDir = decoded.wind_direction ?? 0
  const windKt = decoded.wind_speed ?? 0

  const features: string[] = [...decoded.weather, decoded.flight_rules].filter(Boolean)

  const report = {
    dewpoint: decoded.dewpoint,
    datetime_unix,
    clouds,
    wind_rose: buildWindRose(windDir, windKt),
    repid: '',
    features,
    wind_ms: windKt * 0.514444,
    wind_gust_ms: decoded.wind_gust != null ? decoded.wind_gust * 0.514444 : undefined,
    temperature: decoded.temperature,
    humidity: calcHumidity(decoded.temperature, decoded.dewpoint),
    wind_dir_min: 0,
    wind_dir_max: 0,
    wind_dir_diff: 0,
    visibility: vis_m ?? vis_km * 1000,
    datetime_utc: obsTime.toISOString(),
    qnh: decoded.pressure,
    pressure: decoded.pressure,
    wind_dir: windDir,
    wind_kt: windKt,
    wind_gust_kt: decoded.wind_gust ?? undefined,
    atistime: obsTime.toISOString(),
    time: datetime_unix,
    vis_m,
    vis_km,
    vis_km_full: vis_km,
  }

  return {
    result: 'ok',
    site: data.icao.toLowerCase(),
    states: [
      {
        atisTx: data.metar.raw,
        message: [data.metar.raw],
        report,
        timestamp: datetime_unix,
        expires: datetime_unix + 3600,
        mp3: '',
      },
    ],
  }
}

function handleAxiosError(error: unknown, context: string) {
  logger.error(`Error fetching ${context}:`, error)
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return problem({
        status: 504,
        title: 'Weather Service Timeout',
        detail: 'Weather service request timed out. Please try again.',
      })
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      return problem({
        status: 503,
        title: 'Weather Service Unavailable',
        detail: 'Unable to connect to weather service. Service may be temporarily down.',
      })
    }
    if (error.response) {
      const status = error.response.status
      return problem({
        status: status >= 500 ? 503 : 502,
        title: 'Weather Service Error',
        detail:
          status >= 500
            ? 'Weather service is experiencing issues. Please try again later.'
            : `Weather service returned error: ${status}`,
      })
    }
  }
  return problem({
    status: 500,
    title: 'Weather Data Error',
    detail: 'Failed to fetch weather data. Please try again later.',
  })
}

router.use(validateUser(MIKPermissions.MEMBER))
// Get weather data for a specific site (default: efnu)
// EFNU uses the custom ATIS API; other ICAO codes are fetched via METAR Central.
router.get(
  '/',

  async (req: Request, res: Response<WeatherResponse>) => {
    const site = ((req.query.site as string) || EFNU_SITE).toLowerCase()
    logger.info(`Fetching weather data for site: ${site}`)

    if (site === EFNU_SITE) {
      // --- EFNU: custom ATIS API ---
      try {
        const response = await axios.get<WeatherResponse>(WEATHER_API_BASE_URL, {
          params: { site },
          timeout: 5000,
        })

        if (response.data.result !== 'ok') {
          logger.error(`Weather API returned non-ok result: ${response.data.result}`)
          return problem({ status: 502, detail: 'Weather service returned an error' })
        }

        // Strip 'mp3/' prefix and normalize visibility
        const modifiedData = {
          ...response.data,
          states: response.data.states.map((state) => {
            const report = state.report
            let vis_km = report.vis_km
            let vis_km_full = report.vis_km_full
            if (!vis_km && report.vis_m) vis_km = report.vis_m / 1000
            if (!vis_km_full && report.vis_m) vis_km_full = report.vis_m / 1000
            return {
              ...state,
              mp3: state.mp3.replace(/^mp3\//, ''),
              report: { ...report, vis_km, vis_km_full },
            }
          }),
        }

        return res.status(200).json(modifiedData)
      } catch (error) {
        return handleAxiosError(error, `EFNU weather`)
      }
    } else {
      // --- Other ICAO sites: METAR Central ---
      try {
        const icao = site.toUpperCase()
        const response = await axios.get<MetarCentralResponse>(
          `${METAR_CENTRAL_BASE_URL}/${icao}`,
          { timeout: 5000 },
        )
        return res.status(200).json(mapMetarToWeatherResponse(response.data))
      } catch (error) {
        return handleAxiosError(error, `METAR Central (${site})`)
      }
    }
  },
)

// Proxy audio file requests
router.get(
  '/audio',

  async (req: Request, res: Response) => {
    try {
      // Extract the filename from query parameter
      const filename = req.query.filename as string
      if (!filename) {
        return problem({
          status: 400,
          detail: 'Missing filename parameter',
        })
      }
      const audioUrl = `${WEATHER_AUDIO_BASE_URL}/${filename}`

      logger.info(`Proxying audio request: ${audioUrl}`)

      const response = await axios.get(audioUrl, {
        responseType: 'stream',
        timeout: 10000, // 10 second timeout for audio
      })

      // Set appropriate headers
      res.setHeader('Content-Type', String(response.headers['content-type'] ?? 'audio/mpeg'))
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', String(response.headers['content-length']))
      }

      // Stream the audio data to the client
      response.data.pipe(res)
    } catch (error) {
      logger.error('Error proxying audio:', error)

      if (axios.isAxiosError(error)) {
        // Timeout error
        if (error.code === 'ECONNABORTED') {
          return problem({
            status: 504,
            title: 'Audio Request Timeout',
            detail: 'Audio request timed out. Please try again.',
          })
        }
        // Network/connection errors
        if (
          error.code === 'ECONNREFUSED' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'EAI_AGAIN'
        ) {
          return problem({
            status: 503,
            title: 'Audio Service Unavailable',
            detail: 'Unable to connect to audio service.',
          })
        }
        // HTTP response errors
        if (error.response) {
          return problem({
            status: error.response.status >= 500 ? 503 : 502,
            title: 'Audio Service Error',
            detail: `Audio service returned error: ${error.response.status}`,
          })
        }
      }

      return problem({
        status: 500,
        title: 'Audio Error',
        detail: 'Failed to fetch audio. Please try again later.',
      })
    }
  },
)
