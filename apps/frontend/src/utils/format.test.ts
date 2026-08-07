import { describe, expect, it } from 'vitest'

import {
  eurFormatter,
  formatDecimalHours,
  formatFinnishPhoneNumber,
  formatHHMM,
  formatPhoneNumber,
} from './format'

/** fi-FI output uses non-breaking spaces; normalise so assertions stay readable. */
const normalise = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ')

describe('formatHHMM', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [60, '01:00'],
    [90, '01:30'],
    [605, '10:05'],
    [1440, '24:00'],
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatHHMM(minutes)).toBe(expected)
  })

  it('keeps the sign outside the padded digits for negative balances', () => {
    expect(formatHHMM(-90)).toBe('-01:30')
    expect(formatHHMM(-5)).toBe('-00:05')
  })

  it('does not roll over past 24 hours — hours keep counting up', () => {
    expect(formatHHMM(1500)).toBe('25:00')
  })
})

describe('formatDecimalHours', () => {
  it.each([
    [0, '0,00'],
    [45, '0,75'],
    [60, '1,00'],
    [90, '1,50'],
    [605, '10,08'],
  ])('formats %i minutes as %s hours', (minutes, expected) => {
    expect(formatDecimalHours(minutes)).toBe(expected)
  })

  it('uses a Finnish decimal comma', () => {
    expect(formatDecimalHours(90)).toContain(',')
    expect(formatDecimalHours(90)).not.toContain('.')
  })

  it('keeps the sign outside the absolute value', () => {
    expect(formatDecimalHours(-90)).toBe('-1,50')
  })

  it('rounds to two decimals', () => {
    // 50 min = 0.8333… h
    expect(formatDecimalHours(50)).toBe('0,83')
  })
})

describe('eurFormatter', () => {
  it('formats amounts in Finnish currency style', () => {
    expect(normalise(eurFormatter.format(1234.5))).toBe('1 234,50 €')
    expect(normalise(eurFormatter.format(0))).toBe('0,00 €')
  })

  it('always shows two decimals', () => {
    expect(normalise(eurFormatter.format(7))).toBe('7,00 €')
  })
})

describe('formatPhoneNumber', () => {
  it('formats a stored international number using its country template', () => {
    expect(formatPhoneNumber('+358401234567')).toBe('+358 40 1234 567')
  })

  it('is idempotent — a number that is already spaced formats the same way', () => {
    expect(formatPhoneNumber('+358 40 123 4567')).toBe('+358 40 1234 567')
  })

  it('strips characters that are neither digits nor a leading plus', () => {
    expect(formatPhoneNumber('+358 (40) 123-4567')).toBe('+358 40 1234 567')
  })

  it('assumes Finland for legacy numbers stored without a dial code', () => {
    expect(formatPhoneNumber('0401234567')).toBe('040 1234 567')
    expect(formatPhoneNumber('401234567')).toBe('40 1234 567')
  })

  it('prefers the stored country when a dial code is shared between countries', () => {
    // +44 is shared by the UK, Guernsey, Isle of Man and Jersey, which have
    // different national formats. Without a country the larger one is guessed.
    expect(formatPhoneNumber('+447911123456', 'GB')).toBe('+44 7911 123456')
    expect(formatPhoneNumber('+447911123456', 'JE')).toBe('+44 791 112 345 6')
    expect(formatPhoneNumber('+447911123456')).toBe('+44 7911 123456')
  })

  it('ignores a stored country that contradicts the dial code', () => {
    expect(formatPhoneNumber('+358401234567', 'GB')).toBe('+358 40 1234 567')
  })

  it('returns an unrecognised dial code unchanged', () => {
    expect(formatPhoneNumber('+999123')).toBe('+999123')
  })

  it('returns an empty string for an empty number', () => {
    expect(formatPhoneNumber('')).toBe('')
  })
})

describe('formatFinnishPhoneNumber', () => {
  it('is the country-less form of formatPhoneNumber', () => {
    expect(formatFinnishPhoneNumber('0401234567')).toBe(formatPhoneNumber('0401234567'))
    expect(formatFinnishPhoneNumber('+358401234567')).toBe('+358 40 1234 567')
  })
})
