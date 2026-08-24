import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  defaultUnitForCategory,
  isAirportOutsideFinland,
  makeDefaultLineItem,
  matchAircraftCostCentre,
} from './expenseHelpers'

describe('defaultUnitForCategory', () => {
  it('uses litres for fuel and kilometres for mileage', () => {
    expect(defaultUnitForCategory('fuel')).toBe('l')
    expect(defaultUnitForCategory('mileage')).toBe('km')
  })

  it('falls back to pieces for every other category', () => {
    expect(defaultUnitForCategory('parts')).toBe('pcs')
    expect(defaultUnitForCategory(undefined)).toBe('pcs')
  })
})

describe('makeDefaultLineItem', () => {
  afterEach(() => vi.useRealTimers())

  it('starts a blank, single-unit row dated today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-02T09:00:00Z'))

    expect(makeDefaultLineItem()).toEqual({
      itemId: null,
      description: '',
      date: '2025-06-02',
      quantity: 1,
      unit: 'pcs',
      unitPrice: 0,
      sortOrder: 0,
      costCentreCode: null,
      airport: null,
      paidWithClubCard: false,
    })
  })

  it('takes the unit and cost centre it is given', () => {
    const item = makeDefaultLineItem('l', 'OH-STL')

    expect(item.unit).toBe('l')
    expect(item.costCentreCode).toBe('OH-STL')
  })

  it('dates the row in UTC, not the local timezone', () => {
    // 02:30 in Helsinki on 3 June is still 23:30 UTC on 2 June — the row is
    // dated 2 June. Worth pinning: a late-evening claim entered from Finland
    // would otherwise silently land on the previous day.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-02T23:30:00Z'))

    expect(makeDefaultLineItem().date).toBe('2025-06-02')
  })
})

describe('matchAircraftCostCentre', () => {
  const costCentres = [
    { code: 'OH-STL', description: 'Diamond DA40' },
    { code: 'OH-IHQ', description: 'Cessna 172' },
    { code: 'CLUB', description: 'General club costs' },
  ]

  it('matches a fuel item code to the aircraft by its last three letters', () => {
    expect(matchAircraftCostCentre('FUEL-IHQ', costCentres)).toBe('OH-IHQ')
    expect(matchAircraftCostCentre('20STL', costCentres)).toBe('OH-STL')
  })

  it('ignores case on both sides', () => {
    expect(matchAircraftCostCentre('fuel-stl', costCentres)).toBe('OH-STL')
  })

  it('returns undefined when no cost centre shares the suffix', () => {
    expect(matchAircraftCostCentre('FUEL-XYZ', costCentres)).toBeUndefined()
  })

  it('returns undefined for an item code shorter than the three-letter suffix', () => {
    expect(matchAircraftCostCentre('AB', costCentres)).toBeUndefined()
  })

  it('can match a non-aircraft cost centre that happens to end the same way', () => {
    // The match is purely a three-character suffix comparison, so a cost centre
    // like 'CLUB' is reachable from any item code ending in 'LUB'.
    expect(matchAircraftCostCentre('FUEL-LUB', costCentres)).toBe('CLUB')
  })
})

describe('isAirportOutsideFinland', () => {
  it.each(['EFNU', 'EFHK', 'efnu'])('treats %s as Finnish', (icao) => {
    expect(isAirportOutsideFinland(icao)).toBe(false)
  })

  it.each(['ESSA', 'EETN', 'KJFK'])('treats %s as abroad', (icao) => {
    expect(isAirportOutsideFinland(icao)).toBe(true)
  })

  it('treats a missing airport as not abroad', () => {
    expect(isAirportOutsideFinland(null)).toBe(false)
    expect(isAirportOutsideFinland(undefined)).toBe(false)
    expect(isAirportOutsideFinland('')).toBe(false)
  })
})
