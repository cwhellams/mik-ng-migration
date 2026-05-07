import { Router } from 'express'
import type { Request, Response } from 'express'
import axios from 'axios'

import { type WeatherResponse } from './models.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'

export const router = Router()

const WEATHER_API_BASE_URL =
  process.env.WEATHER_API_BASE_URL ??
  'https://78sy389733.execute-api.eu-west-1.amazonaws.com/dev/0-atis-state'
const WEATHER_AUDIO_BASE_URL = process.env.WEATHER_AUDIO_BASE_URL ?? 'https://info.efnu.fi/mp3'

router.use(validateUser(MIKPermissions.MEMBER))
// Get weather data for a specific site (default: efnu)
router.get(
  '/',

  async (req: Request, res: Response<WeatherResponse>) => {
    try {
      const site = (req.query.site as string) || 'efnu'

      logger.info(`Fetching weather data for site: ${site}`)

      const response = await axios.get<WeatherResponse>(WEATHER_API_BASE_URL, {
        params: { site },
        timeout: 5000, // 5 second timeout
      })

      if (response.data.result !== 'ok') {
        logger.error(`Weather API returned non-ok result: ${response.data.result}`)
        return problem({
          status: 502,
          detail: 'Weather service returned an error',
        })
      }

      // Strip 'mp3/' prefix from mp3 field in all states and normalize visibility
      const modifiedData = {
        ...response.data,
        states: response.data.states.map(state => {
          const report = state.report

          // Calculate visibility in km if only vis_m is present
          let vis_km = report.vis_km
          let vis_km_full = report.vis_km_full

          if (!vis_km && report.vis_m) {
            vis_km = report.vis_m / 1000
          }

          if (!vis_km_full && report.vis_m) {
            vis_km_full = report.vis_m / 1000
          }

          return {
            ...state,
            mp3: state.mp3.replace(/^mp3\//, ''),
            report: {
              ...report,
              vis_km,
              vis_km_full,
            },
          }
        }),
      }

      res.status(200).json(modifiedData)
    } catch (error) {
      logger.error('Error fetching weather data:', error)

      if (axios.isAxiosError(error)) {
        // Timeout error
        if (error.code === 'ECONNABORTED') {
          return problem({
            status: 504,
            title: 'Weather Service Timeout',
            detail: 'Weather service request timed out. Please try again.',
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
            title: 'Weather Service Unavailable',
            detail: 'Unable to connect to weather service. Service may be temporarily down.',
          })
        }
        // HTTP response errors
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

      // Unknown errors
      return problem({
        status: 500,
        title: 'Weather Data Error',
        detail: 'Failed to fetch weather data. Please try again later.',
      })
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
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
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
