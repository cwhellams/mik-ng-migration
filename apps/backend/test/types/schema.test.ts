import { DateRangeSchema, withDateRangeCheck } from '@mik/contracts/schema'

describe('withDateRangeCheck', () => {
  const schema = withDateRangeCheck(DateRangeSchema)
  const future = '2999-01-01'

  it('passes a valid range through unchanged', () => {
    const result = schema.safeParse({ startDate: '2025-01-01', endDate: '2025-01-31' })

    expect(result.success).toBe(true)
  })

  it('reports only the end-date-in-the-future issue on its own', () => {
    const result = schema.safeParse({ startDate: '2025-01-01', endDate: future })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0].message).toBe('End date cannot be in the future.')
    expect(result.error?.issues[0].path).toEqual(['endDate'])
  })

  it('reports only the start-after-end issue on its own', () => {
    const result = schema.safeParse({ startDate: '2025-02-01', endDate: '2025-01-01' })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0].message).toBe('Start date cannot be after end date.')
    expect(result.error?.issues[0].path).toEqual(['startDate'])
  })

  // A startDate after a future endDate would trip both checks — this short-circuits to
  // just the first, matching the deleted per-route if/return code it replaced (#1148
  // review): a client always sees at most one date-range error per request.
  it('short-circuits to a single issue when both checks would otherwise fail', () => {
    const result = schema.safeParse({ startDate: future, endDate: future })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0].message).toBe('End date cannot be in the future.')
  })
})
