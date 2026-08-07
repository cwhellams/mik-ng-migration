import { isValidHetu } from '../../src/util/hetu.ts'

describe('isValidHetu', () => {
  it('accepts valid identity codes across century markers', () => {
    expect(isValidHetu('010101-123N')).toBe(true)
    expect(isValidHetu('010101A123N')).toBe(true)
    expect(isValidHetu('131052-308T')).toBe(true)
  })

  it('is case- and whitespace-insensitive', () => {
    expect(isValidHetu('  010101-123n  ')).toBe(true)
  })

  it('rejects a wrong check character', () => {
    expect(isValidHetu('010101-123A')).toBe(false)
  })

  it('rejects an impossible date', () => {
    expect(isValidHetu('320101-123A')).toBe(false)
    expect(isValidHetu('311101-1234')).toBe(false)
  })

  it('rejects malformed, empty and missing values', () => {
    expect(isValidHetu('not-a-hetu')).toBe(false)
    expect(isValidHetu('010101123A')).toBe(false)
    expect(isValidHetu('')).toBe(false)
    expect(isValidHetu(null)).toBe(false)
    expect(isValidHetu(undefined)).toBe(false)
  })
})
