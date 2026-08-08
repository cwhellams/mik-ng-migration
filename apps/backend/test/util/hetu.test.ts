import { isValidHetu } from '../../src/util/hetu.ts'

describe('isValidHetu', () => {
  it('accepts valid identity codes across century markers', () => {
    expect(isValidHetu('010101-123N')).toBe(true)
    expect(isValidHetu('010101A123N')).toBe(true)
    expect(isValidHetu('131052-308T')).toBe(true)
    expect(isValidHetu('131052+308T')).toBe(true)
  })

  // DVV began issuing further century markers in 2023, once the originals ran
  // out for people sharing a birth date. Refusing them locked those members out
  // of mileage claims entirely.
  it('accepts the century markers added in 2023', () => {
    for (const marker of ['Y', 'X', 'W', 'V', 'U']) {
      expect(isValidHetu(`010594${marker}9021`)).toBe(true)
    }
    for (const marker of ['B', 'C', 'D', 'E', 'F']) {
      expect(isValidHetu(`131002${marker}308W`)).toBe(true)
    }
  })

  it('still rejects a separator that is not a century marker', () => {
    expect(isValidHetu('010594Z9021')).toBe(false)
    expect(isValidHetu('010594G9021')).toBe(false)
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
