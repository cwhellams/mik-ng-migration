import { describe, expect, it } from 'vitest'

import { renderHookWithProviders } from '../test/renderWithProviders'
import { dayjs } from '@mik/ui/utils/date'
import { useTimezone } from './useTimezone'

// Tests run with TZ=Europe/Helsinki (see vitest.config.ts): UTC+3 in summer.
const SUMMER = '2025-06-02T09:00:00Z' // 12:00 in Helsinki
const WINTER = '2025-01-15T09:00:00Z' // 11:00 in Helsinki

const renderTimezone = (timezone: 'utc' | 'local' = 'utc') =>
  renderHookWithProviders(() => useTimezone(), { timezone }).result

describe('useTimezone in UTC mode', () => {
  it('describes itself as UTC', () => {
    const { current } = renderTimezone('utc')

    expect(current.timezone).toBe('utc')
    expect(current.timezoneLetter).toBe('Z')
    expect(current.timezoneName).toBe('UTC')
  })

  it('formats dates and times in UTC', () => {
    const { current } = renderTimezone('utc')

    expect(current.formatDate(SUMMER)).toBe('02.06.2025')
    expect(current.formatDateTime(SUMMER)).toBe('02.06.2025 09:00')
    expect(current.formatTime(SUMMER)).toBe('09:00')
    expect(current.formatISODateTime(SUMMER)).toBe('2025-06-02 09:00')
  })

  it('reports a zero offset as a bare UTC', () => {
    const { current } = renderTimezone('utc')

    expect(current.timezoneOffset(SUMMER)).toBe('UTC')
  })
})

describe('useTimezone in local mode', () => {
  it('describes itself as local', () => {
    const { current } = renderTimezone('local')

    expect(current.timezone).toBe('local')
    expect(current.timezoneLetter).toBe('L')
    // 'local' maps to no IANA name, letting the platform default apply.
    expect(current.timezoneName).toBeUndefined()
  })

  it('formats dates and times in the machine timezone', () => {
    const { current } = renderTimezone('local')

    expect(current.formatDateTime(SUMMER)).toBe('02.06.2025 12:00')
    expect(current.formatTime(SUMMER)).toBe('12:00')
  })

  it('follows DST', () => {
    const { current } = renderTimezone('local')

    expect(current.formatDateTime(WINTER)).toBe('15.01.2025 11:00')
    expect(current.timezoneOffset(SUMMER)).toBe('UTC+3')
    expect(current.timezoneOffset(WINTER)).toBe('UTC+2')
  })

  it('can roll a timestamp onto the next calendar day', () => {
    const { current } = renderTimezone('local')

    expect(current.formatDate('2025-06-02T23:30:00Z')).toBe('03.06.2025')
  })
})

describe('useTimezone date-only handling', () => {
  it('renders a plain YYYY-MM-DD unshifted, whatever the timezone mode', () => {
    // A date-of-birth or licence expiry has no time component, so converting it
    // would move it a day in one direction or the other.
    for (const timezone of ['utc', 'local'] as const) {
      const { current } = renderTimezone(timezone)

      expect(current.formatDate('2025-06-02')).toBe('02.06.2025')
      expect(current.formatISODate('2025-06-02')).toBe('2025-06-02')
    }
  })

  it('still converts a full timestamp', () => {
    const { current } = renderTimezone('local')

    expect(current.formatISODate('2025-06-02T23:30:00Z')).toBe('2025-06-03')
  })
})

describe('useTimezone formatting options', () => {
  it('adds seconds on request', () => {
    const { current } = renderTimezone('utc')

    expect(current.formatDateTime('2025-06-02T09:07:05Z', { showSeconds: true })).toBe(
      '02.06.2025 09:07:05',
    )
    expect(current.formatTime('2025-06-02T09:07:05Z', true)).toBe('09:07:05')
  })

  it('accepts an arbitrary dayjs template', () => {
    const { current } = renderTimezone('utc')

    expect(current.formatDateCustom(SUMMER, 'ddd D MMM')).toBe('Mon 2 Jun')
  })

  it('accepts Date and Dayjs values', () => {
    const { current } = renderTimezone('utc')

    expect(current.formatDate(new Date(SUMMER))).toBe('02.06.2025')
    expect(current.formatDate(dayjs(SUMMER))).toBe('02.06.2025')
  })

  it('renders a dash for a missing timestamp', () => {
    const { current } = renderTimezone('utc')

    expect(current.formatDate(null)).toBe('-')
    expect(current.formatDateTime(undefined)).toBe('-')
    expect(current.formatISODate(null)).toBe('-')
  })

  it('exposes a setter so the user can switch mode', () => {
    const { current } = renderTimezone('utc')

    expect(current.setTimezone).toBeInstanceOf(Function)
  })
})
