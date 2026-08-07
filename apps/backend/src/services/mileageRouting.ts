import axios from 'axios'
import logger from '../lib/logger.ts'

export interface LatLon {
  lat: number
  lon: number
}

interface OsrmRouteResponse {
  code: string
  routes: { distance: number }[]
}

export async function fetchOsrmDistanceKm(points: LatLon[]): Promise<number> {
  // Public OSM-based instance — no client-side map/tracking script involved, all calls
  // happen server-to-server. Env-overridable so a self-hosted instance can be swapped
  // in later without a code change. Read per-call (not module-scope) so tests can point
  // this at a local stub after the module has already been imported.
  const osrmBaseUrl = process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org'
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';')
  const response = await axios.get<OsrmRouteResponse>(`${osrmBaseUrl}/route/v1/driving/${coords}`, {
    params: { overview: 'false' },
    timeout: 8000,
  })
  const route = response.data.routes[0]
  if (response.data.code !== 'Ok' || !route) {
    throw new Error(`OSRM returned no route (code: ${response.data.code})`)
  }
  return route.distance / 1000
}

/**
 * Server-authoritative direct (start->end, no waypoints) distance for a leg — used to
 * verify a client-submitted distanceKm isn't inflated without justification (issue #1021).
 * The client-submitted `directDistanceKm` on a leg is advisory only; this is the value
 * actually used to enforce the >20% justification-note requirement at save time.
 *
 * Returns null (caller skips the justification check for this leg) if OSRM is
 * unreachable, rather than blocking claim submission on an external dependency.
 */
export async function computeDirectDistanceKm(start: LatLon, end: LatLon): Promise<number | null> {
  try {
    return +(await fetchOsrmDistanceKm([start, end])).toFixed(2)
  } catch (error) {
    logger.error('Failed to compute authoritative direct distance for mileage leg:', error)
    return null
  }
}
