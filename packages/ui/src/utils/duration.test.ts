import dayjs from 'dayjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  calculateNext,
  durationToDayjs,
  formatDuration,
  getDurationInMinutes,
  splitTime,
} from './duration'

afterEach(() => vi.useRealTimers())

const freezeAt = (iso: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

describe('getDurationInMinutes', () => {
  it('measures whole minutes between two timestamps', () => {
    expect(getDurationInMinutes('2025-06-02T09:00:00Z', '2025-06-02T10:40:00Z')).toBe(100)
  })

  it('truncates a partial minute', () => {
    expect(getDurationInMinutes('2025-06-02T09:00:00Z', '2025-06-02T09:01:59Z')).toBe(1)
  })

  it('is negative when the end precedes the start', () => {
    expect(getDurationInMinutes('2025-06-02T10:00:00Z', '2025-06-02T09:30:00Z')).toBe(-30)
  })

  it('measures against now when no end is given — an in-progress flight', () => {
    freezeAt('2025-06-02T10:00:00Z')

    expect(getDurationInMinutes('2025-06-02T09:15:00Z')).toBe(45)
  })
})

describe('formatDuration', () => {
  it.each([
    [45, '45min'],
    [60, '1h 0min'],
    [90, '1h 30min'],
    [605, '10h 5min'],
  ])('formats %i minutes as "%s"', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected)
  })

  it('drops a zero minute component when asked to hide zeros', () => {
    expect(formatDuration(120, true)).toBe('2h')
    expect(formatDuration(90, true)).toBe('1h 30min')
  })

  it('still shows sub-hour durations when hiding zeros', () => {
    expect(formatDuration(45, true)).toBe('45min')
  })

  it('renders a dash for a flight with no measurable duration', () => {
    expect(formatDuration(0)).toBe('--')
    expect(formatDuration(-30)).toBe('--')
  })

  it('renders a dash for zero even when hiding zeros would leave nothing', () => {
    expect(formatDuration(0, true)).toBe('--')
  })
})

describe('durationToDayjs', () => {
  it('places the duration on today’s date as a wall-clock time', () => {
    freezeAt('2025-06-02T09:00:00Z')

    const value = durationToDayjs(95)

    expect(value.hour()).toBe(1)
    expect(value.minute()).toBe(35)
    expect(value.format('YYYY-MM-DD')).toBe(dayjs().format('YYYY-MM-DD'))
  })

  it('wraps durations of 24 hours or more, since it can only express a clock time', () => {
    freezeAt('2025-06-02T09:00:00Z')

    // 25h becomes 01:00 — the caller is expected to keep durations under a day.
    expect(durationToDayjs(25 * 60).hour()).toBe(1)
  })
})

describe('calculateNext', () => {
  // Local wall-clock times: the function only ever reads hour() and minute().
  const previous = dayjs('2025-06-02T09:00:00')
  const at = (hour: number, minute: number) =>
    dayjs('2025-01-01T00:00:00').hour(hour).minute(minute)

  it('keeps a later time on the same day', () => {
    expect(calculateNext(previous, at(10, 30)).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2025-06-02 10:30:00',
    )
  })

  it('rolls an earlier time onto the next day — a flight crossing midnight', () => {
    expect(calculateNext(previous, at(1, 15)).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2025-06-03 01:15:00',
    )
  })

  it('rolls forward when the times match but the previous one carries seconds', () => {
    const withSeconds = dayjs('2025-06-02T09:00:30')

    // Truncating to :00 would put it half a minute in the past, so it moves a day on.
    expect(calculateNext(withSeconds, at(9, 0)).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2025-06-03 09:00:00',
    )
  })

  it('takes only the hour and minute from the second argument', () => {
    // Date and seconds of the incoming time are ignored entirely.
    expect(
      calculateNext(previous, dayjs('1999-12-31T10:30:45')).format('YYYY-MM-DD HH:mm:ss'),
    ).toBe('2025-06-02 10:30:00')
  })
})

describe('splitTime', () => {
  it('splits a HH:mm string into numbers', () => {
    expect(splitTime('09:30')).toEqual({ hours: 9, minutes: 30 })
    expect(splitTime('23:59')).toEqual({ hours: 23, minutes: 59 })
  })

  it('accepts unpadded values', () => {
    expect(splitTime('9:5')).toEqual({ hours: 9, minutes: 5 })
  })

  it('yields NaN for input that is not a time — callers must guard', () => {
    expect(splitTime('not-a-time')).toEqual({ hours: NaN, minutes: NaN })
  })

  it('reads an empty string as midnight-ish rather than NaN hours', () => {
    // Number('') is 0, so an empty input silently becomes hour 0 with NaN
    // minutes instead of being rejected outright.
    expect(splitTime('')).toEqual({ hours: 0, minutes: NaN })
  })
})
