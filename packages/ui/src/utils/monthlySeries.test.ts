import { describe, expect, it } from 'vitest'

import { lastTwelveMonths, monthKey, monthlySeriesByAircraft } from './monthlySeries'

type Row = { aircraftRegistration: string; yr: number; mth: number; hours: number }

const row = (overrides: Partial<Row> = {}): Row => ({
  aircraftRegistration: 'OH-STL',
  yr: 2025,
  mth: 6,
  hours: 10,
  ...overrides,
})

/** The options both real callers pass, with one row per aircraft per month. */
const oneRowPerMonth = (now: Date) => ({
  aircraftOf: (r: Row) => r.aircraftRegistration,
  keyOf: (r: Row) => monthKey(r.yr, r.mth),
  merge: (_existing: { month: string; hours: number } | undefined, r: Row, month: string) => ({
    month,
    hours: r.hours,
  }),
  empty: (month: string) => ({ month, hours: 0 }),
  now,
})

describe('lastTwelveMonths', () => {
  it('returns twelve keys, oldest first, ending with the current month', () => {
    const months = lastTwelveMonths(new Date(2025, 5, 15))

    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2024-07')
    expect(months[11]).toBe('2025-06')
  })

  it('rolls the year over rather than producing month zero', () => {
    // The window straddling January is the edge case worth pinning: a naive
    // `mth - i` would emit '2025-00' and '2025--1'.
    const months = lastTwelveMonths(new Date(2025, 1, 10))

    expect(months[0]).toBe('2024-03')
    expect(months).toContain('2024-12')
    expect(months).toContain('2025-01')
    expect(months.every((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))).toBe(true)
  })
})

describe('monthKey', () => {
  it('zero-pads the month so keys sort chronologically as strings', () => {
    expect(monthKey(2025, 3)).toBe('2025-03')
    expect(monthKey(2025, 11)).toBe('2025-11')
    expect(['2025-11', '2025-03'].sort()).toEqual(['2025-03', '2025-11'])
  })
})

describe('monthlySeriesByAircraft', () => {
  const now = new Date(2025, 5, 15)

  it('gives every aircraft a full twelve-month series', () => {
    const result = monthlySeriesByAircraft([row()], oneRowPerMonth(now))

    expect(result).toHaveLength(1)
    expect(result[0].aircraft).toBe('OH-STL')
    expect(result[0].data).toHaveLength(12)
  })

  it('pads months with no data instead of shortening the axis', () => {
    // The whole reason this helper exists: a quiet month must read as "no
    // flying happened", not as a gap in the chart.
    const result = monthlySeriesByAircraft([row({ mth: 6, hours: 42 })], oneRowPerMonth(now))

    const june = result[0].data.find((d) => d.month === '2025-06')
    const may = result[0].data.find((d) => d.month === '2025-05')
    expect(june?.hours).toBe(42)
    expect(may?.hours).toBe(0)
  })

  it('keeps the months in chronological order', () => {
    const result = monthlySeriesByAircraft([row()], oneRowPerMonth(now))

    expect(result[0].data.map((d) => d.month)).toEqual(lastTwelveMonths(now))
  })

  it('drops rows outside the twelve-month window', () => {
    const result = monthlySeriesByAircraft(
      [row({ yr: 2020, mth: 1, hours: 999 }), row({ hours: 5 })],
      oneRowPerMonth(now),
    )

    expect(result[0].data.some((d) => d.hours === 999)).toBe(false)
  })

  it('separates aircraft', () => {
    const result = monthlySeriesByAircraft(
      [row({ aircraftRegistration: 'OH-STL' }), row({ aircraftRegistration: 'OH-XYZ' })],
      oneRowPerMonth(now),
    )

    expect(result.map((r) => r.aircraft).sort()).toEqual(['OH-STL', 'OH-XYZ'])
  })

  it('accumulates when several rows share a month', () => {
    // apps/frontend's chart has one row per flight type per month, so `merge`
    // has to fold onto the existing entry rather than replace it.
    const result = monthlySeriesByAircraft([row({ hours: 3 }), row({ hours: 4 })], {
      ...oneRowPerMonth(now),
      merge: (existing, r, month) => ({ month, hours: (existing?.hours ?? 0) + r.hours }),
    })

    expect(result[0].data.find((d) => d.month === '2025-06')?.hours).toBe(7)
  })

  it('returns nothing for no rows, rather than a row of zeroes', () => {
    expect(monthlySeriesByAircraft([], oneRowPerMonth(now))).toEqual([])
  })
})
