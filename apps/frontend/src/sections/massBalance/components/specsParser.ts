/**
 * Parser for aircraft JSON specification files
 * Handles loading and validation of aircraft weight & balance specifications
 */

/**
 * Configuration for individual load points (weight stations) in the aircraft
 */
export interface LoadPointConfig {
  name: string
  translationFi: string
  unit: string
  defaultValue?: number
  value?: number
  minValue?: number
  maxValue?: number
  momentArm: number
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
 * Validates if a weight and CG point is within the aircraft's flight envelope
 * Uses point-in-polygon algorithm for complex envelopes, falls back to simple rectangle for basic limits
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

    if (yi > weight !== yj > weight && cg < ((xj - xi) * (weight - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}
