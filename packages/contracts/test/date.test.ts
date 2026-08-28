import { describe, expect, it } from 'vitest'

import { HELSINKI_TIMEZONE, epochToHelsinki, toHelsinki, toHelsinkiDate } from '../src/date.ts'

// The suite runs under TZ=UTC (see vitest.config.ts), so every assertion below
// fails if the conversion is dropped — which is the point. Both apps used to
// carry their own copy of this, under two different names.
describe('toHelsinki', () => {
  it('applies the winter offset (EET, UTC+2)', () => {
    expect(toHelsinki('2026-01-15T10:00:00Z').format('YYYY-MM-DD HH:mm')).toBe('2026-01-15 12:00')
  })

  it('applies the summer offset (EEST, UTC+3)', () => {
    expect(toHelsinki('2026-07-15T10:00:00Z').format('YYYY-MM-DD HH:mm')).toBe('2026-07-15 13:00')
  })

  it('rolls the date over when the offset crosses midnight', () => {
    expect(toHelsinki('2026-07-15T22:30:00Z').format('YYYY-MM-DD HH:mm')).toBe('2026-07-16 01:30')
  })

  it('accepts a Date as well as a string', () => {
    expect(toHelsinki(new Date('2026-07-15T10:00:00Z')).format('HH:mm')).toBe('13:00')
  })

  it('reports the Helsinki zone, not the process zone', () => {
    expect(HELSINKI_TIMEZONE).toBe('Europe/Helsinki')
    expect(toHelsinki('2026-07-15T10:00:00Z').utcOffset()).toBe(180)
  })
})

// How a journey log book entry's recorded_on is derived (#1254). The suite runs
// under TZ=UTC, which is also what the backend pins its database sessions to — so
// these are exactly the cases where Postgres' CURRENT_DATE would disagree.
describe('toHelsinkiDate', () => {
  it('is the Helsinki date, not the UTC one, late on a summer evening', () => {
    expect(toHelsinkiDate('2026-07-15T21:30:00Z')).toBe('2026-07-16')
  })

  it('is the Helsinki date late on a winter evening too', () => {
    expect(toHelsinkiDate('2026-01-15T22:30:00Z')).toBe('2026-01-16')
  })

  it('agrees with the UTC date during the working day', () => {
    expect(toHelsinkiDate('2026-07-15T10:00:00Z')).toBe('2026-07-15')
  })

  it('accepts a Date as well as a string', () => {
    expect(toHelsinkiDate(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-16')
  })

  it('defaults to today, formatted as a plain date', () => {
    expect(toHelsinkiDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('epochToHelsinki', () => {
  it('reads the epoch-seconds string that bookings and flights store', () => {
    // 2026-07-15T10:00:00Z
    expect(epochToHelsinki('1784109600').format('YYYY-MM-DD HH:mm')).toBe('2026-07-15 13:00')
  })

  it('agrees with toHelsinki for the same instant', () => {
    const epoch = '1784109600'
    expect(epochToHelsinki(epoch).toISOString()).toBe(
      toHelsinki(new Date(Number(epoch) * 1000)).toISOString(),
    )
  })
})
