import { describe, expect, it } from 'vitest'

import {
  dayjs,
  formatDateInTz,
  formatTimeInTz,
  getEffectiveMedicalExpiry,
  getOffsetLabelInTz,
  HELSINKI_TIMEZONE,
  timezoneName,
  toHelsinki,
} from './date'

// Tests run with TZ=Europe/Helsinki (see vitest.config.ts), so "local" is
// UTC+2 in winter and UTC+3 in summer. Both are exercised below — under TZ=UTC
// the local/UTC distinction would collapse and prove nothing.
const SUMMER = '2025-06-02T09:00:00Z' // EEST, UTC+3
const WINTER = '2025-01-15T09:00:00Z' // EET, UTC+2

describe('dayjs', () => {
  it('re-exports dayjs with the utc, timezone and isoWeek plugins applied', () => {
    expect(typeof dayjs().utc).toBe('function')
    expect(typeof dayjs().tz).toBe('function')
    expect(typeof dayjs().isoWeek).toBe('function')
  })

  it('starts the week on Monday in every supported locale', () => {
    // Sunday 2025-06-01 belongs to the week starting Monday 2025-05-26.
    for (const locale of ['en', 'fi', 'sv']) {
      expect(dayjs('2025-06-01').locale(locale).startOf('week').format('YYYY-MM-DD')).toBe(
        '2025-05-26',
      )
    }
  })
})

describe('timezoneName', () => {
  it('maps the app’s timezone modes to IANA names', () => {
    expect(timezoneName('utc')).toBe('UTC')
    expect(timezoneName('helsinki')).toBe(HELSINKI_TIMEZONE)
  })

  it('returns undefined for local, letting the platform default apply', () => {
    expect(timezoneName('local')).toBeUndefined()
  })
})

describe('formatDateInTz', () => {
  it('renders a dash for a missing timestamp', () => {
    expect(formatDateInTz(null, 'utc', 'YYYY-MM-DD')).toBe('-')
    expect(formatDateInTz(undefined, 'utc', 'YYYY-MM-DD')).toBe('-')
    expect(formatDateInTz('', 'utc', 'YYYY-MM-DD')).toBe('-')
  })

  it('renders UTC without shifting into the machine timezone', () => {
    expect(formatDateInTz(SUMMER, 'utc', 'YYYY-MM-DD HH:mm')).toBe('2025-06-02 09:00')
  })

  it('renders local time in the machine timezone', () => {
    expect(formatDateInTz(SUMMER, 'local', 'YYYY-MM-DD HH:mm')).toBe('2025-06-02 12:00')
    expect(formatDateInTz(WINTER, 'local', 'YYYY-MM-DD HH:mm')).toBe('2025-01-15 11:00')
  })

  it('can shift the calendar day, not just the clock', () => {
    // 23:30 UTC is already the next day in Helsinki.
    expect(formatDateInTz('2025-06-02T23:30:00Z', 'utc', 'YYYY-MM-DD')).toBe('2025-06-02')
    expect(formatDateInTz('2025-06-02T23:30:00Z', 'local', 'YYYY-MM-DD')).toBe('2025-06-03')
  })

  it('accepts Date and Dayjs values as well as strings', () => {
    expect(formatDateInTz(new Date(SUMMER), 'utc', 'HH:mm')).toBe('09:00')
    expect(formatDateInTz(dayjs(SUMMER), 'utc', 'HH:mm')).toBe('09:00')
  })
})

describe('formatTimeInTz', () => {
  it('renders 24-hour times in the requested zone', () => {
    expect(formatTimeInTz(SUMMER, 'utc')).toBe('09:00')
    expect(formatTimeInTz(SUMMER, 'local')).toBe('12:00')
    expect(formatTimeInTz(SUMMER, 'helsinki')).toBe('12:00')
  })

  it('follows Finnish DST — the same UTC clock time is an hour earlier in winter', () => {
    expect(formatTimeInTz(WINTER, 'helsinki')).toBe('11:00')
  })

  it('adds seconds only when asked', () => {
    expect(formatTimeInTz('2025-06-02T09:07:05Z', 'utc')).toBe('09:07')
    expect(formatTimeInTz('2025-06-02T09:07:05Z', 'utc', { showSeconds: true })).toBe('09:07:05')
  })

  it('accepts epoch milliseconds', () => {
    expect(formatTimeInTz(Date.parse(SUMMER), 'utc')).toBe('09:00')
  })
})

describe('toHelsinki', () => {
  it('converts a UTC timestamp into Helsinki wall-clock time', () => {
    expect(toHelsinki(SUMMER).format('YYYY-MM-DD HH:mm')).toBe('2025-06-02 12:00')
    expect(toHelsinki(WINTER).format('YYYY-MM-DD HH:mm')).toBe('2025-01-15 11:00')
  })

  it('keeps the same instant in time', () => {
    expect(toHelsinki(SUMMER).valueOf()).toBe(Date.parse(SUMMER))
  })
})

describe('getOffsetLabelInTz', () => {
  it('labels UTC as UTC rather than GMT', () => {
    // The doc comment promises a bare "UTC", but Intl's shortOffset for UTC is
    // "GMT+0", so the zero offset survives the GMT→UTC replacement.
    expect(getOffsetLabelInTz(SUMMER, 'utc')).toBe('UTC+0')
    expect(getOffsetLabelInTz(SUMMER, 'utc')).not.toContain('GMT')
  })

  it('labels the Helsinki offset, following DST', () => {
    expect(getOffsetLabelInTz(SUMMER, 'helsinki')).toBe('UTC+3')
    expect(getOffsetLabelInTz(WINTER, 'helsinki')).toBe('UTC+2')
  })

  it('defaults to local time', () => {
    expect(getOffsetLabelInTz(SUMMER)).toBe('UTC+3')
    expect(getOffsetLabelInTz(WINTER)).toBe('UTC+2')
  })

  it('falls back to now when given no timestamp', () => {
    expect(getOffsetLabelInTz(undefined, 'utc')).toBe('UTC+0')
  })
})

describe('getEffectiveMedicalExpiry', () => {
  const iso = (value: ReturnType<typeof getEffectiveMedicalExpiry>) =>
    value?.format('YYYY-MM-DD') ?? null

  it('returns null when the member holds no medical at all', () => {
    expect(getEffectiveMedicalExpiry(null, null, null)).toBeNull()
    expect(getEffectiveMedicalExpiry(undefined, undefined, undefined, undefined)).toBeNull()
  })

  it('returns the only certificate when just one is set', () => {
    expect(iso(getEffectiveMedicalExpiry(null, '2026-06-01', null))).toBe('2026-06-01')
  })

  it('returns the latest expiry — any valid certificate keeps the member current', () => {
    expect(iso(getEffectiveMedicalExpiry('2025-01-01', '2027-03-15', '2026-06-01'))).toBe(
      '2027-03-15',
    )
  })

  it('includes the legacy medicalExpiry column in the comparison', () => {
    expect(iso(getEffectiveMedicalExpiry('2025-01-01', null, null, '2028-12-31'))).toBe(
      '2028-12-31',
    )
  })

  it('ignores empty strings and unparseable dates', () => {
    expect(iso(getEffectiveMedicalExpiry('', 'not-a-date', '2026-06-01'))).toBe('2026-06-01')
    expect(getEffectiveMedicalExpiry('', 'not-a-date', null)).toBeNull()
  })
})
