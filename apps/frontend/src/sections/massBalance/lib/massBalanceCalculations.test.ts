import { describe, expect, it } from 'vitest'
import type { AircraftSpecs } from '../components/specsParser'
import { isPointInFlightEnvelope } from '../components/specsParser'
import {
  aggregateFrontSeats,
  calculateFuelBurn,
  calculateMassBalance,
  getWeightBalanceStatus,
  type CalculationResults,
} from './massBalanceCalculations'

// Fixtures mirror apps/frontend/public/specs/oh-stl.json and oh-ihq.json exactly.
const OH_STL: AircraftSpecs = {
  registration: 'OH-STL',
  aircraftType: 'Diamond DA 40 NG Star',
  dataOrigin: 'Numbers: OH-STL weighing report (07.04.2016) and NG AFM Rev3',
  fuelConversion: { litre2Kilo: 0.84 },
  weightLimits: { maxTakeoff: 1280, maxLanding: 1280, basicEmptyWeight: 909.4 },
  cgLimits: { forward: 244.0, aft: 255.0 },
  warningThresholds: { nearLimitPercent: 0.98 },
  flightEnvelopePoints: [
    { weight: 940, momentArm: 240.0 },
    { weight: 1080, momentArm: 240.0 },
    { weight: 1280, momentArm: 246.0 },
    { weight: 1280, momentArm: 253.0 },
    { weight: 940, momentArm: 253.0 },
    { weight: 940, momentArm: 240.0 },
  ],
  loadPoints: {
    basicEmptyWeight: { unit: 'kg', value: 909.4, momentArm: 243.0, editable: false },
    pilot: {
      unit: 'kg',
      defaultValue: 80,
      minValue: 0,
      maxValue: 250,
      momentArm: 230.0,
      step: 1,
      editable: true,
    },
    copilot: {
      unit: 'kg',
      defaultValue: 0,
      minValue: 0,
      maxValue: 250,
      momentArm: 230.0,
      step: 1,
      editable: true,
    },
    rearSeat: {
      unit: 'kg',
      defaultValue: 0,
      minValue: 0,
      maxValue: 250,
      momentArm: 325.0,
      step: 1,
      editable: true,
    },
    baggage: {
      unit: 'kg',
      defaultValue: 10,
      minValue: 0,
      maxValue: 30,
      momentArm: 365.0,
      step: 1,
      editable: true,
    },
    fuel: {
      unit: 'ltr',
      defaultValue: 104,
      minValue: 0,
      maxValue: 148,
      momentArm: 263.0,
      step: 1,
      editable: true,
    },
    taxiFuel: {
      unit: 'ltr',
      defaultValue: 5,
      minValue: 0,
      maxValue: 20,
      momentArm: 263.0,
      step: 0.5,
      editable: true,
    },
    fuelFlow: {
      unit: 'ltr/h',
      defaultValue: 23.2,
      minValue: 5,
      maxValue: 50,
      step: 0.1,
      editable: true,
    },
    flightTime: {
      unit: 'min',
      defaultValue: 60,
      minValue: 1,
      maxValue: 300,
      step: 1,
      editable: true,
    },
    endurance: {
      unit: 'min',
      defaultValue: 60,
      minValue: 1,
      maxValue: 800,
      step: 1,
      editable: false,
    },
  },
  seatingConfiguration: { hasRearSeats: true, maxSeats: 4 },
}

const OH_IHQ: AircraftSpecs = {
  registration: 'OH-IHQ',
  aircraftType: 'Diamond DV20',
  dataOrigin: 'AeroTecno Weighing Report 23.5.2025 with LED correction 27.7.25',
  fuelConversion: { litre2Kilo: 0.72 },
  weightLimits: {
    maxTakeoff: 730,
    maxLanding: 730,
    basicEmptyWeight: 513.4,
    minTakeoff: 560,
    minLanding: 560,
  },
  cgLimits: { forward: 25.0, aft: 39.0 },
  warningThresholds: { nearLimitPercent: 0.98 },
  loadPoints: {
    basicEmptyWeight: { unit: 'kg', value: 513.4, momentArm: 33.1, editable: false },
    pilot: {
      unit: 'kg',
      defaultValue: 80,
      minValue: 0,
      maxValue: 110,
      momentArm: 14.3,
      step: 1,
      editable: true,
    },
    copilot: {
      unit: 'kg',
      defaultValue: 0,
      minValue: 0,
      maxValue: 110,
      momentArm: 14.3,
      step: 1,
      editable: true,
    },
    baggage: {
      unit: 'kg',
      defaultValue: 10,
      minValue: 0,
      maxValue: 20,
      momentArm: 82.4,
      step: 1,
      editable: true,
    },
    fuel: {
      unit: 'ltr',
      defaultValue: 55,
      minValue: 0,
      maxValue: 79,
      momentArm: 82.4,
      step: 1,
      editable: true,
    },
    taxiFuel: {
      unit: 'ltr',
      defaultValue: 3,
      minValue: 0,
      maxValue: 10,
      momentArm: 82.4,
      step: 0.5,
      editable: true,
    },
    fuelFlow: {
      unit: 'ltr/h',
      defaultValue: 17,
      minValue: 5,
      maxValue: 30,
      step: 1,
      editable: true,
    },
    flightTime: {
      unit: 'min',
      defaultValue: 60,
      minValue: 1,
      maxValue: 300,
      step: 5,
      editable: true,
    },
  },
  seatingConfiguration: { hasRearSeats: false, maxSeats: 2 },
}

describe('aggregateFrontSeats', () => {
  it('returns the pilot arm when only the pilot has weight', () => {
    const result = aggregateFrontSeats({ weight: 80, arm: 230 }, { weight: 0, arm: 230 })
    expect(result).toEqual({ weight: 80, arm: 230 })
  })

  it('computes the weighted-average arm when pilot and copilot sit at different stations', () => {
    const result = aggregateFrontSeats({ weight: 80, arm: 100 }, { weight: 70, arm: 200 })
    expect(result.weight).toBe(150)
    expect(result.arm).toBeCloseTo(146.6667, 4)
  })

  it('falls back to the pilot arm when both seats are empty (avoids divide-by-zero)', () => {
    const result = aggregateFrontSeats({ weight: 0, arm: 230 }, { weight: 0, arm: 230 })
    expect(result).toEqual({ weight: 0, arm: 230 })
  })
})

describe('calculateFuelBurn', () => {
  it('adds taxi fuel to flight-time fuel burn', () => {
    expect(calculateFuelBurn(5, 23.2, 60)).toEqual({
      taxiFuelLitres: 5,
      flightFuelLitres: 23.2,
      totalFuelLitres: 28.2,
    })
  })

  it('pro-rates flight fuel burn by flight time', () => {
    expect(calculateFuelBurn(0, 20, 30)).toEqual({
      taxiFuelLitres: 0,
      flightFuelLitres: 10,
      totalFuelLitres: 10,
    })
  })
})

describe('calculateMassBalance — OH-STL', () => {
  it('matches the reference weight & balance spreadsheet for a full-fuel 5-hour flight', () => {
    // Reference values from the club's weighing-report-derived W&B spreadsheet
    // (row 42: landing moment 274275.48, landing weight 1130.0).
    const result = calculateMassBalance(OH_STL, {
      pilot: { weight: 95, arm: 230 },
      copilot: { weight: 85, arm: 230 },
      rearSeats: { weight: 0, arm: 325 },
      baggage: { weight: 12, arm: 365 },
      fuel: { litres: 148, weight: 124.32, arm: 263 },
      taxiFuel: 10,
      fuelFlow: 20.8,
      flightTime: 300,
    })

    expect(result.rampWeight).toBeCloseTo(1225.72, 2)
    expect(result.takeoffWeight).toBeCloseTo(1217.32, 2)
    expect(result.takeoffMoment).toBeCloseTo(297251.16, 2)
    expect(result.landingWeight).toBeCloseTo(1129.96, 2)
    expect(result.landingMoment).toBeCloseTo(274275.48, 2)
    expect(result.landingCG).toBeCloseTo(242.73, 2)

    // The spreadsheet reports this exact loading as in balance.
    expect(isPointInFlightEnvelope(OH_STL, result.landingWeight, result.landingCG)).toBe(true)
  })

  it('regression: landing moment no longer double-subtracts taxi fuel', () => {
    // Before the fix, landing moment was derived as
    // `takeoffMoment - totalFuelBurn * litre2Kilo * fuel.arm`. Since takeoffMoment
    // already had the taxi fuel's moment removed once (ramp -> takeoff), and
    // totalFuelBurn includes taxi fuel again, that formula removed the taxi
    // fuel's moment twice while only removing its weight once — pulling the
    // computed landing CG artificially forward and reporting an in-balance
    // aircraft as out of balance.
    const inputs = {
      pilot: { weight: 95, arm: 230 },
      copilot: { weight: 85, arm: 230 },
      rearSeats: { weight: 0, arm: 325 },
      baggage: { weight: 12, arm: 365 },
      fuel: { litres: 148, weight: 124.32, arm: 263 },
      taxiFuel: 10,
      fuelFlow: 20.8,
      flightTime: 300,
    }
    const result = calculateMassBalance(OH_STL, inputs)

    const fuelBurn = calculateFuelBurn(inputs.taxiFuel, inputs.fuelFlow, inputs.flightTime)
    const totalFuelBurnWeight = fuelBurn.totalFuelLitres * OH_STL.fuelConversion.litre2Kilo
    const buggyLandingMoment = result.takeoffMoment - totalFuelBurnWeight * inputs.fuel.arm
    const buggyLandingCG = buggyLandingMoment / result.landingWeight

    // The old, buggy CG would have been reported forward of the envelope...
    expect(isPointInFlightEnvelope(OH_STL, result.landingWeight, buggyLandingCG)).toBe(false)
    // ...while the fixed CG is correctly within it.
    expect(isPointInFlightEnvelope(OH_STL, result.landingWeight, result.landingCG)).toBe(true)
    expect(result.landingMoment).not.toBeCloseTo(buggyLandingMoment, 2)
  })

  it('is valid 1kg under max takeoff/landing weight with CG safely inside the envelope', () => {
    const result = calculateMassBalance(OH_STL, {
      pilot: { weight: 80, arm: 230 },
      copilot: { weight: 0, arm: 230 },
      rearSeats: { weight: 0, arm: 325 },
      baggage: { weight: 30, arm: 365 },
      fuel: { litres: 259.6 / 0.84, weight: 259.6, arm: 263 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffWeight).toBeCloseTo(1279, 5)
    expect(result.landingWeight).toBeCloseTo(1279, 5)
    expect(result.takeoffCG).toBeCloseTo(249.11, 1)
    expect(result.isValid).toBe(true)
    expect(result.warnings).not.toContain('takeoffWeightExceeded')
    expect(result.warnings).not.toContain('landingWeightExceeded')
    expect(result.warnings).not.toContain('takeoffCGOutOfLimits')
    expect(result.warnings).not.toContain('landingCGOutOfLimits')
  })

  it('flags both takeoff and landing weight when 1kg over the maximum', () => {
    const result = calculateMassBalance(OH_STL, {
      pilot: { weight: 80, arm: 230 },
      copilot: { weight: 0, arm: 230 },
      rearSeats: { weight: 0, arm: 325 },
      baggage: { weight: 30, arm: 365 },
      fuel: { litres: 261.6 / 0.84, weight: 261.6, arm: 263 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffWeight).toBeCloseTo(1281, 5)
    expect(result.landingWeight).toBeCloseTo(1281, 5)
    expect(result.isValid).toBe(false)
    expect(result.warnings).toContain('takeoffWeightExceeded')
    expect(result.warnings).toContain('landingWeightExceeded')
  })

  it('flags CG when the load is too far forward for the flight envelope at that weight', () => {
    // The envelope narrows as weight climbs from 1080kg to 1280kg (forward
    // limit moves from 240cm to 246cm), so a load that would pass a naive
    // min/max CG check can still fall outside the real envelope.
    const result = calculateMassBalance(OH_STL, {
      pilot: { weight: 250, arm: 230 },
      copilot: { weight: 0, arm: 230 },
      rearSeats: { weight: 0, arm: 325 },
      baggage: { weight: 0, arm: 365 },
      fuel: { litres: 40.6 / 0.84, weight: 40.6, arm: 263 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffWeight).toBeCloseTo(1200, 5)
    expect(result.takeoffCG).toBeLessThan(243.6) // forward limit at 1200kg
    expect(result.isValid).toBe(false)
    expect(result.warnings).toContain('takeoffCGOutOfLimits')
    expect(result.warnings).toContain('landingCGOutOfLimits')
    expect(result.warnings).not.toContain('takeoffWeightExceeded')
  })

  it('flags CG when the load is too far aft', () => {
    const result = calculateMassBalance(OH_STL, {
      pilot: { weight: 0, arm: 230 },
      copilot: { weight: 0, arm: 230 },
      rearSeats: { weight: 250, arm: 325 },
      baggage: { weight: 30, arm: 365 },
      fuel: { litres: 0, weight: 0, arm: 263 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffCG).toBeGreaterThan(253) // aft limit across the 1080-1280kg band
    expect(result.isValid).toBe(false)
    expect(result.warnings).toContain('takeoffCGOutOfLimits')
    expect(result.warnings).not.toContain('takeoffWeightExceeded')
  })
})

describe('calculateMassBalance — OH-IHQ', () => {
  it('is valid exactly at max takeoff/landing weight (rectangular envelope, inclusive boundary)', () => {
    const result = calculateMassBalance(OH_IHQ, {
      pilot: { weight: 90, arm: 14.3 },
      copilot: { weight: 85, arm: 14.3 },
      rearSeats: { weight: 0, arm: 0 },
      baggage: { weight: 20, arm: 82.4 },
      fuel: { litres: 30, weight: 21.6, arm: 82.4 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffWeight).toBeCloseTo(730, 5)
    expect(result.landingWeight).toBeCloseTo(730, 5)
    expect(result.takeoffCG).toBeCloseTo(31.4, 1)
    expect(result.isValid).toBe(true)
  })

  it('flags weight when just over the maximum', () => {
    const result = calculateMassBalance(OH_IHQ, {
      pilot: { weight: 90, arm: 14.3 },
      copilot: { weight: 85, arm: 14.3 },
      rearSeats: { weight: 0, arm: 0 },
      baggage: { weight: 20, arm: 82.4 },
      fuel: { litres: 31, weight: 22.32, arm: 82.4 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffWeight).toBeGreaterThan(730)
    expect(result.isValid).toBe(false)
    expect(result.warnings).toContain('takeoffWeightExceeded')
    expect(result.warnings).toContain('landingWeightExceeded')
  })

  it('flags CG when loaded too far aft (empty front seats, full baggage and fuel)', () => {
    const result = calculateMassBalance(OH_IHQ, {
      pilot: { weight: 0, arm: 14.3 },
      copilot: { weight: 0, arm: 14.3 },
      rearSeats: { weight: 0, arm: 0 },
      baggage: { weight: 20, arm: 82.4 },
      fuel: { litres: 79, weight: 56.88, arm: 82.4 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffWeight).toBeGreaterThanOrEqual(OH_IHQ.weightLimits.minTakeoff!)
    expect(result.takeoffCG).toBeGreaterThan(OH_IHQ.cgLimits.aft)
    expect(result.isValid).toBe(false)
    expect(result.warnings).toContain('takeoffCGOutOfLimits')
    expect(result.warnings).not.toContain('takeoffWeightExceeded')
  })

  it('flags an empty aircraft as outside the envelope for being under the minimum weight', () => {
    const result = calculateMassBalance(OH_IHQ, {
      pilot: { weight: 0, arm: 14.3 },
      copilot: { weight: 0, arm: 14.3 },
      rearSeats: { weight: 0, arm: 0 },
      baggage: { weight: 0, arm: 82.4 },
      fuel: { litres: 0, weight: 0, arm: 82.4 },
      taxiFuel: 0,
      fuelFlow: 0,
      flightTime: 0,
    })

    expect(result.takeoffWeight).toBeLessThan(OH_IHQ.weightLimits.minTakeoff!)
    expect(result.isValid).toBe(false)
  })
})

describe('getWeightBalanceStatus', () => {
  const baseResults: CalculationResults = {
    zeroFuelWeight: 0,
    zeroFuelMoment: 0,
    zeroFuelCG: 0,
    rampWeight: 0,
    rampMoment: 0,
    takeoffWeight: 0,
    takeoffMoment: 0,
    takeoffCG: 0,
    landingWeight: 0,
    landingMoment: 0,
    landingCG: 0,
    taxiFuelLitres: 0,
    flightFuelLitres: 0,
    totalFuelBurnLitres: 0,
    totalFuelBurnWeight: 0,
    endurance: 0,
    isValid: true,
    warnings: [],
  }

  it('is unknown when results or the aircraft are not yet loaded', () => {
    expect(getWeightBalanceStatus(null, OH_STL)).toBe('unknown')
    expect(getWeightBalanceStatus(baseResults, null)).toBe('unknown')
  })

  it('is over when takeoff weight exceeds the maximum', () => {
    const results = {
      ...baseResults,
      takeoffWeight: 1300,
      landingWeight: 1000,
      takeoffCG: 250,
      landingCG: 250,
    }
    expect(getWeightBalanceStatus(results, OH_STL)).toBe('over')
  })

  it('is over when landing weight exceeds the maximum', () => {
    const results = {
      ...baseResults,
      takeoffWeight: 1000,
      landingWeight: 1300,
      takeoffCG: 250,
      landingCG: 250,
    }
    expect(getWeightBalanceStatus(results, OH_STL)).toBe('over')
  })

  it('is over when CG falls outside the flight envelope', () => {
    const results = {
      ...baseResults,
      takeoffWeight: 1000,
      landingWeight: 1000,
      takeoffCG: 200,
      landingCG: 200,
    }
    expect(getWeightBalanceStatus(results, OH_STL)).toBe('over')
  })

  it('is near when within the warning threshold of a limit', () => {
    const results = {
      ...baseResults,
      takeoffWeight: 1267.2, // 99% of maxTakeoff, threshold is 98%
      landingWeight: 1200,
      takeoffCG: 248,
      landingCG: 248,
    }
    expect(getWeightBalanceStatus(results, OH_STL)).toBe('near')
  })

  it('is within when comfortably inside all limits', () => {
    const results = {
      ...baseResults,
      takeoffWeight: 1000,
      landingWeight: 1000,
      takeoffCG: 248,
      landingCG: 248,
    }
    expect(getWeightBalanceStatus(results, OH_STL)).toBe('within')
  })
})
