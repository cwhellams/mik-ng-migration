/**
 * Pure weight & balance calculation logic, kept free of React/UI/i18n concerns
 * so it can be unit tested directly against known-good reference values.
 */
import type { AircraftSpecs } from '../components/specsParser'
import { isPointInFlightEnvelope } from '../components/specsParser'
import type { WeightPosition, FuelState } from '../../../hooks/useMassBalanceState'

export interface MassBalanceInputs {
  pilot: WeightPosition
  copilot: WeightPosition
  rearSeats: WeightPosition
  baggage: WeightPosition
  fuel: FuelState
  taxiFuel: number
  fuelFlow: number
  flightTime: number
}

/** Matches the `massBalance.warnings.*` translation keys — the UI maps codes to copy. */
export type MassBalanceWarningCode =
  | 'loadExceedsMaximum'
  | 'takeoffWeightExceeded'
  | 'landingWeightExceeded'
  | 'takeoffCGOutOfLimits'
  | 'landingCGOutOfLimits'

export interface CalculationResults {
  zeroFuelWeight: number
  zeroFuelMoment: number
  zeroFuelCG: number
  rampWeight: number
  rampMoment: number
  takeoffWeight: number
  takeoffMoment: number
  takeoffCG: number
  landingWeight: number
  landingMoment: number
  landingCG: number
  taxiFuelLitres: number
  flightFuelLitres: number
  totalFuelBurnLitres: number
  totalFuelBurnWeight: number
  endurance: number
  isValid: boolean
  warnings: MassBalanceWarningCode[]
}

export type WeightBalanceStatus = 'unknown' | 'over' | 'near' | 'within'

/** Combines pilot + copilot into a single front-seat station (weighted-average arm). */
export function aggregateFrontSeats(
  pilot: WeightPosition,
  copilot: WeightPosition,
): WeightPosition {
  const weight = pilot.weight + copilot.weight
  const moment = pilot.weight * pilot.arm + copilot.weight * copilot.arm
  const arm = weight > 0 ? moment / weight : pilot.arm
  return { weight, arm }
}

/** Fuel burned on the ground (taxi) and in the air (flight time × fuel flow), in litres. */
export function calculateFuelBurn(taxiFuel: number, fuelFlow: number, flightTime: number) {
  const taxiFuelLitres = taxiFuel
  const flightFuelLitres = (flightTime / 60) * fuelFlow
  return {
    taxiFuelLitres,
    flightFuelLitres,
    totalFuelLitres: taxiFuelLitres + flightFuelLitres,
  }
}

/**
 * Full weight & balance calculation from ramp through takeoff to landing.
 *
 * Landing weight/moment are derived by subtracting the *total* fuel burned
 * (taxi + flight) from the ramp weight/moment directly — mirroring how
 * takeoff weight/moment subtract taxi fuel from ramp. Deriving landing from
 * takeoff instead (subtracting total burn a second time) would remove the
 * taxi fuel's moment twice while only removing its weight once, skewing the
 * landing CG forward.
 */
export function calculateMassBalance(
  aircraft: AircraftSpecs,
  inputs: MassBalanceInputs,
): CalculationResults {
  const { pilot, copilot, rearSeats, baggage, fuel, taxiFuel, fuelFlow, flightTime } = inputs
  const { litre2Kilo } = aircraft.fuelConversion
  const warnings: MassBalanceWarningCode[] = []

  if (pilot.weight > aircraft.loadPoints.pilot.maxValue!) {
    warnings.push('loadExceedsMaximum')
  }
  if (copilot.weight > aircraft.loadPoints.copilot.maxValue!) {
    warnings.push('loadExceedsMaximum')
  }
  if (aircraft.loadPoints.rearSeat && rearSeats.weight > aircraft.loadPoints.rearSeat.maxValue!) {
    warnings.push('loadExceedsMaximum')
  }
  if (fuel.weight > aircraft.loadPoints.fuel.maxValue! * litre2Kilo) {
    warnings.push('loadExceedsMaximum')
  }
  if (baggage.weight > aircraft.loadPoints.baggage.maxValue!) {
    warnings.push('loadExceedsMaximum')
  }

  const frontSeats = aggregateFrontSeats(pilot, copilot)

  const zeroFuelWeight =
    aircraft.weightLimits.basicEmptyWeight + frontSeats.weight + rearSeats.weight + baggage.weight
  const basicArm = aircraft.loadPoints.basicEmptyWeight.momentArm!
  const zeroFuelMoment =
    aircraft.weightLimits.basicEmptyWeight * basicArm +
    frontSeats.weight * frontSeats.arm +
    rearSeats.weight * rearSeats.arm +
    baggage.weight * baggage.arm
  const zeroFuelCG = zeroFuelWeight > 0 ? zeroFuelMoment / zeroFuelWeight : 0

  const rampWeight = zeroFuelWeight + fuel.weight
  const rampMoment = zeroFuelMoment + fuel.weight * fuel.arm

  const taxiFuelWeight = taxiFuel * litre2Kilo
  const takeoffWeight = rampWeight - taxiFuelWeight
  const takeoffMoment = rampMoment - taxiFuelWeight * fuel.arm
  const takeoffCG = takeoffWeight > 0 ? takeoffMoment / takeoffWeight : 0

  const fuelBurn = calculateFuelBurn(taxiFuel, fuelFlow, flightTime)
  const totalFuelBurnWeight = fuelBurn.totalFuelLitres * litre2Kilo

  const landingWeight = rampWeight - totalFuelBurnWeight
  const landingMoment = rampMoment - totalFuelBurnWeight * fuel.arm
  const landingCG = landingWeight > 0 ? landingMoment / landingWeight : 0

  const availableFuel = fuel.litres - taxiFuel
  const endurance = fuelFlow > 0 ? availableFuel / fuelFlow : 0

  let isValid = true
  const maxLanding = aircraft.weightLimits.maxLanding || aircraft.weightLimits.maxTakeoff

  if (takeoffWeight > aircraft.weightLimits.maxTakeoff) {
    warnings.push('takeoffWeightExceeded')
    isValid = false
  }
  if (landingWeight > maxLanding) {
    warnings.push('landingWeightExceeded')
    isValid = false
  }
  if (!isPointInFlightEnvelope(aircraft, takeoffWeight, takeoffCG)) {
    warnings.push('takeoffCGOutOfLimits')
    isValid = false
  }
  if (!isPointInFlightEnvelope(aircraft, landingWeight, landingCG)) {
    warnings.push('landingCGOutOfLimits')
    isValid = false
  }

  return {
    zeroFuelWeight,
    zeroFuelMoment,
    zeroFuelCG,
    rampWeight,
    rampMoment,
    takeoffWeight,
    takeoffMoment,
    takeoffCG,
    landingWeight,
    landingMoment,
    landingCG,
    taxiFuelLitres: fuelBurn.taxiFuelLitres,
    flightFuelLitres: fuelBurn.flightFuelLitres,
    totalFuelBurnLitres: fuelBurn.totalFuelLitres,
    totalFuelBurnWeight,
    endurance,
    isValid,
    warnings,
  }
}

/** Derives the overall W&B status badge from calculation results. */
export function getWeightBalanceStatus(
  results: CalculationResults | null,
  aircraft: AircraftSpecs | null,
): WeightBalanceStatus {
  if (!results || !aircraft) return 'unknown'

  const maxLanding = aircraft.weightLimits.maxLanding || aircraft.weightLimits.maxTakeoff

  if (results.takeoffWeight > aircraft.weightLimits.maxTakeoff) return 'over'
  if (results.landingWeight > maxLanding) return 'over'

  const takeoffInEnvelope = isPointInFlightEnvelope(
    aircraft,
    results.takeoffWeight,
    results.takeoffCG,
  )
  const landingInEnvelope = isPointInFlightEnvelope(
    aircraft,
    results.landingWeight,
    results.landingCG,
  )
  if (!takeoffInEnvelope || !landingInEnvelope) return 'over'

  const nearLimitThreshold = aircraft.warningThresholds.nearLimitPercent
  if (
    results.takeoffWeight >= aircraft.weightLimits.maxTakeoff * nearLimitThreshold ||
    results.landingWeight >= maxLanding * nearLimitThreshold
  ) {
    return 'near'
  }

  return 'within'
}
