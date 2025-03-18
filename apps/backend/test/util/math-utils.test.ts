import { getRandomInt } from '../../src/util/math-utils.ts'

describe('getRandomInt', () => {
  test('returns a number within the given range', () => {
    const min = 1
    const max = 10
    const result = getRandomInt(min, max)

    expect(result).toBeGreaterThanOrEqual(min)
    expect(result).toBeLessThanOrEqual(max)
  })

  test('returns only integers', () => {
    const min = 5
    const max = 15
    const result = getRandomInt(min, max)

    expect(Number.isInteger(result)).toBe(true)
  })

  test('returns min when min and max are the same', () => {
    const min = 7
    const max = 7
    const result = getRandomInt(min, max)

    expect(result).toBe(min)
  })

  test('handles negative numbers correctly', () => {
    const min = -10
    const max = -1
    const result = getRandomInt(min, max)

    expect(result).toBeGreaterThanOrEqual(min)
    expect(result).toBeLessThanOrEqual(max)
  })
})
