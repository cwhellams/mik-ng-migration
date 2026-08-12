import { Router } from 'express'
import type { Request, Response } from 'express'
import axios from 'axios'

import {
  RouteDistanceRequestSchema,
  type AddressSearchResponse,
  type RouteDistanceResponse,
} from '@mik/contracts/mileage-geo'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problem } from '../response.ts'
import logger from '../../lib/logger.ts'
import { fetchOsrmDistanceKm } from '../../services/mileageRouting.ts'

export const router = Router()

// Public OSM-based instance — no client-side map/tracking script involved, all
// calls happen server-to-server. Env-overridable so a self-hosted instance can be
// swapped in later without a code change.
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org'
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT ?? 'mik-ng/1.0'

interface NominatimSearchResult {
  display_name: string
  lat: string
  lon: string
}

function handleAxiosError(error: unknown, context: string) {
  logger.error(`Error fetching ${context}:`, error)
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return problem({
        status: 504,
        title: 'Mileage Routing Timeout',
        detail: 'Address/routing lookup timed out. Please try again.',
      })
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      return problem({
        status: 503,
        title: 'Mileage Routing Unavailable',
        detail: 'Unable to reach the address/routing service. Please try again later.',
      })
    }
    if (error.response) {
      const status = error.response.status
      return problem({
        status: status >= 500 ? 503 : 502,
        title: 'Mileage Routing Error',
        detail:
          status >= 500
            ? 'Address/routing service is experiencing issues. Please try again later.'
            : `Address/routing service returned error: ${status}`,
      })
    }
  }
  return problem({
    status: 500,
    title: 'Mileage Routing Error',
    detail: 'Failed to fetch address/routing data. Please try again later.',
  })
}

router.use(validateUser(MIKPermissions.MEMBER))

// Address autocomplete search, proxied to Nominatim so no third-party script/cookie
// ever reaches the browser.
router.get('/address-search', async (req: Request, res: Response<AddressSearchResponse>) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 3) {
    return res.status(200).json({ results: [] })
  }
  try {
    const response = await axios.get<NominatimSearchResult[]>(`${NOMINATIM_BASE_URL}/search`, {
      params: { format: 'json', q, limit: 5 },
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      timeout: 5000,
    })
    return res.status(200).json({
      results: response.data.map((r) => ({
        label: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
      })),
    })
  } catch (error) {
    return handleAxiosError(error, 'address search')
  }
})

// Server-computed distance for a one-way leg: direct start->end, and (when waypoints
// are given) the actual start->waypoints->end distance, so the frontend can compare
// the two instead of trusting a hand-typed number.
router.post('/route-distance', async (req: Request, res: Response<RouteDistanceResponse>) => {
  const parsed = RouteDistanceRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return problem({ status: 400, title: 'Invalid Request', detail: parsed.error.message })
  }
  const { start, end, waypoints } = parsed.data
  try {
    // The two OSRM lookups are independent — run them concurrently rather than
    // paying two round trips back-to-back.
    const [directDistanceKm, routedDistanceKm] = await Promise.all([
      fetchOsrmDistanceKm([start, end]),
      waypoints.length > 0
        ? fetchOsrmDistanceKm([start, ...waypoints, end])
        : Promise.resolve(null),
    ])
    const distanceKm = routedDistanceKm ?? directDistanceKm
    return res.status(200).json({
      distanceKm: +distanceKm.toFixed(2),
      directDistanceKm: +directDistanceKm.toFixed(2),
    })
  } catch (error) {
    return handleAxiosError(error, 'route distance')
  }
})
