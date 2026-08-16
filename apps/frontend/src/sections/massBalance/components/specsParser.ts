/**
 * Parser for aircraft JSON specification files
 * Handles loading and validation of aircraft weight & balance specifications
 */

/**
 * Configuration for individual load points (weight stations) in the aircraft
 */
export interface LoadPointConfig {
  unit: string
  defaultValue?: number
  value?: number
  minValue?: number
  maxValue?: number
  /** Absent for fuel-planning inputs (fuelFlow, flightTime, endurance) that aren't physical stations. */
  momentArm?: number
  step?: number
  editable: boolean
}

/**
 * Point definition for aircraft flight envelope (weight vs CG position)
 */
export interface FlightEnvelopePoint {
  weight: number
  momentArm: number
}

/**
 * Complete aircraft specifications for weight & balance calculations
 */
export interface AircraftSpecs {
  registration: string
  aircraftType: string
  dataOrigin: string
  fuelConversion: {
    litre2Kilo: number
  }
  weightLimits: {
    maxTakeoff: number
    maxLanding: number
    basicEmptyWeight: number
    minTakeoff?: number
    minLanding?: number
  }
  cgLimits: {
    forward: number
    aft: number
  }
  warningThresholds: {
    nearLimitPercent: number
  }
  flightEnvelopePoints?: FlightEnvelopePoint[]
  loadPoints: {
    basicEmptyWeight: LoadPointConfig
    pilot: LoadPointConfig
    copilot: LoadPointConfig
    rearSeat?: LoadPointConfig
    baggage: LoadPointConfig
    fuel: LoadPointConfig
    taxiFuel: LoadPointConfig
    fuelFlow: LoadPointConfig
    flightTime: LoadPointConfig
    endurance?: LoadPointConfig
  }
  seatingConfiguration: {
    hasRearSeats: boolean
    maxSeats: number
  }
}

/**
 * Unit conversion constants for weight & balance calculations
 */
export const CONVERSIONS = {
  KG_TO_LBS: 2.20462262,
  LTR_TO_USG: 0.26417205,
  M_TO_INCHES: 39.3700787,
}

/**
 * Loads aircraft specifications from JSON file
 * @param registration - Aircraft registration (e.g., 'OH-IHQ', 'OH-STL')
 * @returns Promise<AircraftSpecs> - Parsed aircraft specifications
 * @throws Error if specification file cannot be loaded or parsed
 */
export async function loadAircraftSpecs(registration: string): Promise<AircraftSpecs> {
  try {
    const response = await fetch(`/specs/${registration.toLowerCase()}.json`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to load specs for ${registration}`)
    }
    const specs: AircraftSpecs = await response.json()

    // Basic validation of required fields
    if (!specs.registration || !specs.aircraftType || !specs.weightLimits || !specs.loadPoints) {
      throw new Error(`Invalid specification format for ${registration}`)
    }

    return specs
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load aircraft specifications for ${registration}: ${error.message}`,
      )
    }
    throw new Error(`Unknown error loading aircraft specifications for ${registration}`)
  }
}

/**
 * Tolerance for "this loading sits on that envelope edge", as a perpendicular
 * distance in the kg/cm space the envelope is plotted in. Envelope vertices are
 * published to a tenth of a unit and loadings are summed from figures of the
 * same precision, so anything this close is on the line rather than near it.
 */
const EDGE_TOLERANCE = 1e-6

/**
 * True when (px, py) lies on the segment (x1, y1)–(x2, y2), within
 * EDGE_TOLERANCE.
 */
const isPointOnSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean => {
  // Outside the segment's bounding box it cannot be on the segment — this is
  // what keeps the collinearity test below from matching the whole infinite line.
  if (
    px < Math.min(x1, x2) - EDGE_TOLERANCE ||
    px > Math.max(x1, x2) + EDGE_TOLERANCE ||
    py < Math.min(y1, y2) - EDGE_TOLERANCE ||
    py > Math.max(y1, y2) + EDGE_TOLERANCE
  ) {
    return false
  }

  const length = Math.hypot(x2 - x1, y2 - y1)
  // A repeated vertex is a zero-length segment; compare against the point itself.
  if (length === 0) return Math.hypot(px - x1, py - y1) <= EDGE_TOLERANCE

  // |cross product| / |segment| is the perpendicular distance to the line.
  const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
  return Math.abs(cross) / length <= EDGE_TOLERANCE
}

/**
 * Validates if a weight and CG point is within the aircraft's flight envelope
 * Uses point-in-polygon algorithm for complex envelopes, falls back to simple rectangle for basic limits
 *
 * The envelope is closed: a loading sitting exactly on the boundary — most
 * obviously one at exactly maximum take-off weight — is within limits, matching
 * the rectangle fallback's inclusive comparisons.
 *
 * @param aircraft - Aircraft specifications containing flight envelope data
 * @param weight - Aircraft weight in kg
 * @param cg - Center of gravity position in cm
 * @returns boolean - true if point is within flight envelope, false otherwise
 */
export const isPointInFlightEnvelope = (
  aircraft: AircraftSpecs,
  weight: number,
  cg: number,
): boolean => {
  if (!aircraft.flightEnvelopePoints || aircraft.flightEnvelopePoints.length === 0) {
    // Fallback to basic rectangle check using CG limits
    const minWeightLimit =
      aircraft.weightLimits.minTakeoff || aircraft.weightLimits.basicEmptyWeight
    return (
      weight >= minWeightLimit &&
      weight <= aircraft.weightLimits.maxTakeoff &&
      cg >= aircraft.cgLimits.forward &&
      cg <= aircraft.cgLimits.aft
    )
  }

  // Use ray casting algorithm for polygon (point-in-polygon)
  const vertices = aircraft.flightEnvelopePoints
  let inside = false

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].momentArm,
      yi = vertices[i].weight
    const xj = vertices[j].momentArm,
      yj = vertices[j].weight

    // Ray casting cannot answer for a point on the boundary: its strict `>`
    // comparisons never register a crossing for a point on a horizontal edge,
    // so a loading at exactly MTOW came back as outside the envelope. Boundary
    // cases are settled here instead, before the crossing count.
    if (isPointOnSegment(cg, weight, xi, yi, xj, yj)) return true

    if (yi > weight !== yj > weight && cg < ((xj - xi) * (weight - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}
