import dayjs from 'dayjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getTimeExample, getTimezoneDisplay } from './timezoneUtils'

// Tests run with TZ=Europe/Helsinki (see vitest.config.ts): UTC+3 in summer,
// UTC+2 in winter.
const SUMMER_NOON = '2025-06-02T09:15:00Z' // 12:15 in Helsinki
const WINTER_DAY = dayjs('2025-01-15T00:00:00')

afterEach(() => vi.useRealTimers())

const freezeAt = (iso: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

describe('getTimeExample', () => {
  it('shows the current UTC time when the form is in UTC mode', () => {
    freezeAt(SUMMER_NOON)

    expect(getTimeExample(true, null)).toBe('09:15')
  })

  it('shows the current local time when the form is in local mode', () => {
    freezeAt(SUMMER_NOON)

    expect(getTimeExample(false, null)).toBe('12:15')
  })

  it('ignores the flight date entirely in UTC mode', () => {
    freezeAt(SUMMER_NOON)

    expect(getTimeExample(true, WINTER_DAY)).toBe('09:15')
  })

  it('shifts the local example to the offset in effect on the flight date', () => {
    freezeAt(SUMMER_NOON)

    // 09:15 UTC is 12:15 in Helsinki today (UTC+3, summer), but 11:15 on a
    // winter flight date (UTC+2) — which is the offset getTimezoneDisplay
    // labels the field with.
    expect(getTimeExample(false, WINTER_DAY)).toBe('11:15')
    expect(getTimezoneDisplay(false, WINTER_DAY)).toBe('UTC+2')
  })

  it('leaves the example alone for a flight date on the same offset', () => {
    freezeAt(SUMMER_NOON)

    expect(getTimeExample(false, dayjs('2025-07-20T00:00:00'))).toBe('12:15')
  })
})

describe('getTimezoneDisplay', () => {
  it('reads UTC when the form is in UTC mode', () => {
    expect(getTimezoneDisplay(true, null)).toBe('UTC')
    expect(getTimezoneDisplay(true, WINTER_DAY)).toBe('UTC')
  })

  it('reads the offset of the selected flight date, following DST', () => {
    expect(getTimezoneDisplay(false, dayjs('2025-06-02T12:00:00'))).toBe('UTC+3')
    expect(getTimezoneDisplay(false, WINTER_DAY)).toBe('UTC+2')
  })

  it('falls back to today when no flight date is selected', () => {
    freezeAt(SUMMER_NOON)

    expect(getTimezoneDisplay(false, null)).toBe('UTC+3')
  })

  it('renders a negative offset without a plus sign', () => {
    // Finland is always ahead of UTC, so force a western zone to cover the branch.
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(300)

    expect(getTimezoneDisplay(false, null)).toBe('UTC-5')
  })
})
