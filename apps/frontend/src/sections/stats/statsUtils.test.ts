import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMonthlyRange, getYearRange } from './statsUtils'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const freezeAt = (iso: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

describe('getYearRange', () => {
  it('covers five calendar years including the current one by default', () => {
    freezeAt('2026-08-22T09:00:00Z')

    expect(getYearRange()).toEqual({ yrFrom: 2022, yrTo: 2026 })
  })

  it('honours VITE_STATS_YEAR_RANGE', () => {
    freezeAt('2026-08-22T09:00:00Z')
    vi.stubEnv('VITE_STATS_YEAR_RANGE', '3')

    expect(getYearRange()).toEqual({ yrFrom: 2024, yrTo: 2026 })
  })

  it('is the current year alone when the range is one', () => {
    freezeAt('2026-08-22T09:00:00Z')
    vi.stubEnv('VITE_STATS_YEAR_RANGE', '1')

    expect(getYearRange()).toEqual({ yrFrom: 2026, yrTo: 2026 })
  })

  it('falls back to five years when the env var is unset or unparseable', () => {
    freezeAt('2026-08-22T09:00:00Z')

    vi.stubEnv('VITE_STATS_YEAR_RANGE', '')
    expect(getYearRange()).toEqual({ yrFrom: 2022, yrTo: 2026 })

    vi.stubEnv('VITE_STATS_YEAR_RANGE', 'not-a-number')
    expect(getYearRange()).toEqual({ yrFrom: 2022, yrTo: 2026 })

    // `0` would ask for an empty window, so it falls back too.
    vi.stubEnv('VITE_STATS_YEAR_RANGE', '0')
    expect(getYearRange()).toEqual({ yrFrom: 2022, yrTo: 2026 })
  })

  it('reads the clock per call, so a session open over New Year moves with it', () => {
    freezeAt('2025-12-31T21:59:00Z') // 23:59 Helsinki
    expect(getYearRange()).toEqual({ yrFrom: 2021, yrTo: 2025 })

    vi.setSystemTime(new Date('2025-12-31T22:00:00Z')) // 00:00 Helsinki, 2026
    expect(getYearRange()).toEqual({ yrFrom: 2022, yrTo: 2026 })
  })
})

describe('getMonthlyRange', () => {
  it('spans the previous and current year outside December', () => {
    freezeAt('2026-08-22T09:00:00Z')

    expect(getMonthlyRange()).toEqual({ yrFrom: 2025, yrTo: 2026 })
  })

  it('is the current year alone in December, when the last 12 months fit inside it', () => {
    freezeAt('2026-12-01T09:00:00Z')

    expect(getMonthlyRange()).toEqual({ yrFrom: 2026, yrTo: 2026 })
  })

  it('still spans two years in January', () => {
    freezeAt('2026-01-01T09:00:00Z')

    expect(getMonthlyRange()).toEqual({ yrFrom: 2025, yrTo: 2026 })
  })

  it('ignores VITE_STATS_YEAR_RANGE — the window is always 12 months', () => {
    freezeAt('2026-08-22T09:00:00Z')
    vi.stubEnv('VITE_STATS_YEAR_RANGE', '10')

    expect(getMonthlyRange()).toEqual({ yrFrom: 2025, yrTo: 2026 })
  })

  it('reads local months, not UTC ones', () => {
    // 01:30 on 1 December in Helsinki (UTC+2) is still 23:30 on 30 November UTC.
    freezeAt('2026-11-30T23:30:00Z')

    expect(getMonthlyRange()).toEqual({ yrFrom: 2026, yrTo: 2026 })
  })
})
