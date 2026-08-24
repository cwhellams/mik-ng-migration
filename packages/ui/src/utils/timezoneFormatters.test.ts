import { describe, expect, it } from 'vitest'

import { timezoneFormatters } from './timezoneFormatters'

/**
 * The suite runs under TZ=Europe/Helsinki (see vitest.config.ts), so 'local'
 * means Helsinki here — +02:00 in winter, +03:00 in summer. Both are exercised
 * on purpose: a formatter that hard-coded an offset would pass one and fail the
 * other.
 */
const WINTER = '2025-01-15T10:30:00.000Z'
const SUMMER = '2025-07-15T10:30:00.000Z'

describe('timezoneFormatters', () => {
  describe('in UTC', () => {
    const tz = timezoneFormatters('utc')

    it('labels itself Z', () => {
      expect(tz.timezoneLetter).toBe('Z')
      expect(tz.timezone).toBe('utc')
    })

    it('leaves the instant alone', () => {
      expect(tz.formatDateTime(WINTER)).toBe('15.01.2025 10:30')
      expect(tz.formatDateTime(SUMMER)).toBe('15.07.2025 10:30')
    })

    it('adds seconds only when asked', () => {
      expect(tz.formatDateTime(WINTER, { showSeconds: true })).toBe('15.01.2025 10:30:00')
    })

    it('formats ISO date and date-time', () => {
      expect(tz.formatISODate(WINTER)).toBe('2025-01-15')
      expect(tz.formatISODateTime(WINTER)).toBe('2025-01-15 10:30')
    })

    it('honours a custom template', () => {
      expect(tz.formatDateCustom(WINTER, 'YYYY/MM')).toBe('2025/01')
    })
  })

  describe('in local time', () => {
    const tz = timezoneFormatters('local')

    it('labels itself L', () => {
      expect(tz.timezoneLetter).toBe('L')
    })

    it('shifts by the offset in force on the day, not a fixed one', () => {
      expect(tz.formatDateTime(WINTER)).toBe('15.01.2025 12:30')
      expect(tz.formatDateTime(SUMMER)).toBe('15.07.2025 13:30')
    })
  })

  it('treats a bare YYYY-MM-DD as a calendar date in both zones', () => {
    // The one case that must not shift. A date with no time is a calendar day —
    // a licence expiry, not an instant — and converting it to UTC would move it
    // to the previous day for anyone east of Greenwich.
    for (const preference of ['utc', 'local'] as const) {
      const tz = timezoneFormatters(preference)
      expect(tz.formatDate('2025-01-15'), preference).toBe('15.01.2025')
      expect(tz.formatISODate('2025-01-15'), preference).toBe('2025-01-15')
    }
  })

  it('renders a dash for an absent timestamp rather than "Invalid Date"', () => {
    // A placeholder, not an empty string: a blank table cell reads as a
    // rendering bug, a dash reads as "we don't have this".
    const tz = timezoneFormatters('utc')

    expect(tz.formatDate(null)).toBe('-')
    expect(tz.formatDate(undefined)).toBe('-')
    expect(tz.formatDateTime(null)).toBe('-')
  })
})
