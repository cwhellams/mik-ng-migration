import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../../test/msw/server'
import {
  CONVERSIONS,
  isPointInFlightEnvelope,
  loadAircraftSpecs,
  type AircraftSpecs,
} from './specsParser'

/**
 * OH-STL, the club's Diamond DA40 NG — the numbers below are the ones actually
 * shipped in `public/specs/oh-stl.json`, trimmed to the fields these tests use.
 */
const ohStl = (overrides: Partial<AircraftSpecs> = {}): AircraftSpecs => ({
  registration: 'OH-STL',
  aircraftType: 'Diamond DA 40 NG Star',
  dataOrigin: 'OH-STL weighing report (07.04.2016) and NG AFM Rev3',
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
    pilot: { unit: 'kg', defaultValue: 80, momentArm: 230.0, editable: true },
    copilot: { unit: 'kg', defaultValue: 0, momentArm: 230.0, editable: true },
    rearSeat: { unit: 'kg', defaultValue: 0, momentArm: 325.0, editable: true },
    baggage: { unit: 'kg', defaultValue: 10, momentArm: 365.0, editable: true },
    fuel: { unit: 'ltr', defaultValue: 104, momentArm: 263.0, editable: true },
    taxiFuel: { unit: 'ltr', defaultValue: 5, momentArm: 263.0, editable: true },
    fuelFlow: { unit: 'ltr/h', defaultValue: 23.2, editable: true },
    flightTime: { unit: 'min', defaultValue: 60, editable: true },
  },
  seatingConfiguration: { hasRearSeats: true, maxSeats: 4 },
  ...overrides,
})

describe('loadAircraftSpecs', () => {
  it('loads the spec file for a registration', async () => {
    server.use(http.get('*/specs/oh-stl.json', () => HttpResponse.json(ohStl())))

    const specs = await loadAircraftSpecs('OH-STL')

    expect(specs.registration).toBe('OH-STL')
    expect(specs.weightLimits.maxTakeoff).toBe(1280)
    expect(specs.flightEnvelopePoints).toHaveLength(6)
  })

  it('lower-cases the registration to find the file', async () => {
    const requested: string[] = []
    server.use(
      http.get('*/specs/*', ({ request }) => {
        requested.push(new URL(request.url).pathname)
        return HttpResponse.json(ohStl())
      }),
    )

    await loadAircraftSpecs('OH-IHQ')

    expect(requested).toEqual(['/specs/oh-ihq.json'])
  })

  it('reports the status code when the file is missing', async () => {
    server.use(http.get('*/specs/oh-xxx.json', () => new HttpResponse(null, { status: 404 })))

    await expect(loadAircraftSpecs('OH-XXX')).rejects.toThrow(
      'Failed to load aircraft specifications for OH-XXX: HTTP 404',
    )
  })

  it.each<[string, Partial<AircraftSpecs>]>([
    ['registration', { registration: '' }],
    ['aircraftType', { aircraftType: '' }],
  ])('rejects a spec file missing its %s', async (_field, missing) => {
    server.use(http.get('*/specs/oh-stl.json', () => HttpResponse.json(ohStl(missing))))

    await expect(loadAircraftSpecs('OH-STL')).rejects.toThrow(
      'Invalid specification format for OH-STL',
    )
  })

  it('names the registration in the error when the response is not JSON', async () => {
    server.use(http.get('*/specs/oh-stl.json', () => HttpResponse.text('<!doctype html>')))

    await expect(loadAircraftSpecs('OH-STL')).rejects.toThrow(
      /Failed to load aircraft specifications for OH-STL/,
    )
  })

  it('still names the registration when something non-Error is thrown', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue('network gone')

    await expect(loadAircraftSpecs('OH-STL')).rejects.toThrow(
      'Unknown error loading aircraft specifications for OH-STL',
    )
  })
})

describe('isPointInFlightEnvelope', () => {
  describe('with a flight envelope polygon', () => {
    const specs = ohStl()

    it('accepts a normal loading well inside the envelope', () => {
      expect(isPointInFlightEnvelope(specs, 1100, 250)).toBe(true)
      expect(isPointInFlightEnvelope(specs, 1000, 245)).toBe(true)
    })

    it('rejects a CG forward of the sloping forward limit', () => {
      // Between 1080 kg and MTOW the forward limit moves aft: at 1100 kg it sits
      // at 240.6, so 241 is legal and 240 is not.
      expect(isPointInFlightEnvelope(specs, 1100, 241)).toBe(true)
      expect(isPointInFlightEnvelope(specs, 1100, 240)).toBe(false)
    })

    it('rejects a CG aft of the aft limit', () => {
      expect(isPointInFlightEnvelope(specs, 1000, 255)).toBe(false)
    })

    it('rejects a weight above maximum take-off weight', () => {
      expect(isPointInFlightEnvelope(specs, 1300, 250)).toBe(false)
    })

    it('rejects a weight below the bottom of the envelope', () => {
      expect(isPointInFlightEnvelope(specs, 900, 250)).toBe(false)
    })

    it('accepts a loading exactly at maximum take-off weight', () => {
      // On the envelope's top edge, which is a limit and therefore inclusive —
      // as it already was in the no-polygon fallback below. Ray casting alone
      // never registers a crossing for a point on a horizontal edge, so the
      // boundary is tested explicitly.
      expect(isPointInFlightEnvelope(specs, 1280, 250)).toBe(true)
    })

    it('accepts a loading on each of the other envelope edges', () => {
      expect(isPointInFlightEnvelope(specs, 1000, 240)).toBe(true) // forward, below 1080 kg
      expect(isPointInFlightEnvelope(specs, 1180, 243)).toBe(true) // forward, sloping section
      expect(isPointInFlightEnvelope(specs, 1000, 253)).toBe(true) // aft
      expect(isPointInFlightEnvelope(specs, 940, 250)).toBe(true) // bottom
    })

    it('accepts a loading on an envelope vertex', () => {
      expect(isPointInFlightEnvelope(specs, 1280, 246)).toBe(true)
      expect(isPointInFlightEnvelope(specs, 940, 240)).toBe(true)
    })

    it('still rejects a loading just outside an edge', () => {
      expect(isPointInFlightEnvelope(specs, 1280.01, 250)).toBe(false)
      expect(isPointInFlightEnvelope(specs, 1000, 253.01)).toBe(false)
      expect(isPointInFlightEnvelope(specs, 939.99, 250)).toBe(false)
    })
  })

  describe('without a flight envelope polygon', () => {
    const rectangular = ohStl({ flightEnvelopePoints: undefined })

    it('falls back to the rectangle formed by the CG and weight limits', () => {
      expect(isPointInFlightEnvelope(rectangular, 1100, 250)).toBe(true)
      expect(isPointInFlightEnvelope(rectangular, 1100, 243)).toBe(false)
      expect(isPointInFlightEnvelope(rectangular, 1100, 256)).toBe(false)
    })

    it('includes both ends of the range', () => {
      expect(isPointInFlightEnvelope(rectangular, 1280, 244)).toBe(true)
      expect(isPointInFlightEnvelope(rectangular, 909.4, 255)).toBe(true)
    })

    it('rejects a weight below the basic empty weight', () => {
      expect(isPointInFlightEnvelope(rectangular, 900, 250)).toBe(false)
    })

    it('prefers an explicit minimum take-off weight over the basic empty weight', () => {
      const withMinimum = ohStl({
        flightEnvelopePoints: [],
        weightLimits: { ...rectangular.weightLimits, minTakeoff: 950 },
      })

      expect(isPointInFlightEnvelope(withMinimum, 940, 250)).toBe(false)
      expect(isPointInFlightEnvelope(withMinimum, 950, 250)).toBe(true)
    })

    it('treats an empty envelope list the same as a missing one', () => {
      expect(isPointInFlightEnvelope(ohStl({ flightEnvelopePoints: [] }), 1100, 250)).toBe(true)
    })
  })
})

describe('CONVERSIONS', () => {
  it('carries the unit factors the imperial display modes rely on', () => {
    expect(CONVERSIONS.KG_TO_LBS).toBeCloseTo(2.20462262, 8)
    expect(CONVERSIONS.LTR_TO_USG).toBeCloseTo(0.26417205, 8)
    expect(CONVERSIONS.M_TO_INCHES).toBeCloseTo(39.3700787, 7)
  })

  it('converts the DA40’s basic empty weight to pounds', () => {
    expect(909.4 * CONVERSIONS.KG_TO_LBS).toBeCloseTo(2004.88, 2)
  })
})
