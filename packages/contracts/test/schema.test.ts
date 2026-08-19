import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  AuditableSchema,
  BigintAsString,
  BooleanSchema,
  DateRangeSchema,
  LimitOffsetSchema,
  LocalisedSchema,
  nullableTrimmedString,
  OptionalLimitOffsetSchema,
  optionalTrimmedString,
  PaginationSchema,
  UpsertSchema,
  withDateRangeCheck,
} from '../src/schema.ts'

const audit = {
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'someone',
  updatedAt: '2026-01-02T00:00:00.000Z',
  updatedBy: 'someone-else',
}

describe('UpsertSchema', () => {
  const Entity = AuditableSchema.extend({ name: z.string() })

  it('drops the audit quadruple from the accepted shape', () => {
    expect(UpsertSchema(Entity).parse({ name: 'thing' })).toEqual({ name: 'thing' })
  })

  // AuditableSchema is .strict() and .omit() preserves that, so audit fields are
  // rejected rather than quietly ignored — a client cannot believe it set one.
  // The flip side, worth knowing before you write a form: posting a fetched
  // entity straight back is a 400, not a no-op.
  it('rejects audit fields outright rather than stripping them', () => {
    const result = UpsertSchema(Entity).safeParse({ name: 'thing', ...audit })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      code: 'unrecognized_keys',
      keys: ['createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    })
  })

  it('still validates the fields it keeps', () => {
    expect(() => UpsertSchema(Entity).parse({ name: 42 })).toThrow()
  })
})

describe('BooleanSchema', () => {
  it.each([
    ['true', true],
    ['false', false],
    [undefined, false],
    [null, false],
  ])('maps the query-string value %s to %s', (input, expected) => {
    expect(BooleanSchema.parse(input)).toBe(expected)
  })

  it('rejects anything that is not the literal string true or false', () => {
    expect(() => BooleanSchema.parse('yes')).toThrow()
    expect(() => BooleanSchema.parse('1')).toThrow()
  })
})

describe('BigintAsString', () => {
  it('accepts a digit string, which is how epochs cross the wire', () => {
    expect(BigintAsString.parse('1784109600')).toBe('1784109600')
  })

  it('rejects values that would silently lose precision as a number', () => {
    expect(() => BigintAsString.parse('12.5')).toThrow()
    expect(() => BigintAsString.parse('-1')).toThrow()
    expect(() => BigintAsString.parse('1e10')).toThrow()
  })
})

describe('LocalisedSchema', () => {
  it('requires all three languages, so a half-translated field cannot be saved', () => {
    expect(LocalisedSchema.parse({ en: 'a', fi: 'b', sv: 'c' })).toEqual({
      en: 'a',
      fi: 'b',
      sv: 'c',
    })
    expect(() => LocalisedSchema.parse({ en: 'a', fi: 'b' })).toThrow()
  })
})

describe('DateRangeSchema', () => {
  it('accepts a real calendar date', () => {
    expect(DateRangeSchema.parse({ startDate: '2026-01-01', endDate: '2026-01-31' })).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })
  })

  it('rejects a well-formed but non-existent date', () => {
    expect(() =>
      DateRangeSchema.parse({ startDate: '2024-02-30', endDate: '2024-03-01' }),
    ).toThrow()
  })

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() =>
      DateRangeSchema.parse({ startDate: '01/01/2026', endDate: '2026-01-31' }),
    ).toThrow()
  })
})

describe('withDateRangeCheck', () => {
  const Filters = withDateRangeCheck(DateRangeSchema)

  it('accepts a past range in the right order', () => {
    expect(() => Filters.parse({ startDate: '2026-01-01', endDate: '2026-01-31' })).not.toThrow()
  })

  it('rejects an end date in the future', () => {
    const result = Filters.safeParse({ startDate: '2026-01-01', endDate: '2099-01-01' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['endDate'],
      message: 'End date cannot be in the future.',
    })
  })

  it('rejects a start date after the end date', () => {
    const result = Filters.safeParse({ startDate: '2026-01-31', endDate: '2026-01-01' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['startDate'],
      message: 'Start date cannot be after end date.',
    })
  })

  // The single superRefine short-circuits deliberately, matching the per-route
  // if/return code it replaced — which never reported both problems at once.
  it('reports only the future-end-date problem when both checks would fail', () => {
    const result = Filters.safeParse({ startDate: '2099-06-01', endDate: '2099-01-01' })

    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0].path).toEqual(['endDate'])
  })
})

// Bounds matter here beyond tidiness: before these helpers existed each domain
// declared its own pagination, some of it unbounded, which let a caller ask for
// an arbitrarily large result set (issue #1115, finding 3).
describe('PaginationSchema', () => {
  const Pagination = PaginationSchema(25)

  it('defaults to the first page at the domain default size', () => {
    expect(Pagination.parse({})).toEqual({ page: 1, pageSize: 25 })
  })

  it('coerces the numbers out of query strings', () => {
    expect(Pagination.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 })
  })

  it('caps pageSize at the default maximum of 100', () => {
    expect(() => Pagination.parse({ pageSize: 101 })).toThrow()
    expect(PaginationSchema(25, 500).parse({ pageSize: 500 }).pageSize).toBe(500)
  })

  it('rejects a zero or negative page', () => {
    expect(() => Pagination.parse({ page: 0 })).toThrow()
    expect(() => Pagination.parse({ page: -1 })).toThrow()
  })
})

describe('LimitOffsetSchema', () => {
  const LimitOffset = LimitOffsetSchema(50)

  it('defaults the limit and starts at offset zero', () => {
    expect(LimitOffset.parse({})).toEqual({ limit: 50, offset: 0 })
  })

  it('caps the limit at the default maximum of 1000', () => {
    expect(() => LimitOffset.parse({ limit: 1001 })).toThrow()
    expect(LimitOffset.parse({ limit: 1000 }).limit).toBe(1000)
  })

  it('rejects a negative offset', () => {
    expect(() => LimitOffset.parse({ offset: -1 })).toThrow()
  })
})

describe('OptionalLimitOffsetSchema', () => {
  const OptionalLimitOffset = OptionalLimitOffsetSchema()

  it('leaves both undefined when the caller asks for no cap', () => {
    expect(OptionalLimitOffset.parse({})).toEqual({})
  })

  it('still caps the limit when one is given', () => {
    expect(() => OptionalLimitOffset.parse({ limit: 1001 })).toThrow()
    expect(OptionalLimitOffset.parse({ limit: 10 })).toEqual({ limit: 10 })
  })
})

describe('nullableTrimmedString', () => {
  it('trims leading and trailing whitespace from a string', () => {
    const schema = nullableTrimmedString()
    expect(schema.parse('  hello  ')).toBe('hello')
    expect(schema.parse('\t\nworld\n\t')).toBe('world')
  })

  it('converts whitespace-only strings to null', () => {
    const schema = nullableTrimmedString()
    expect(schema.parse('   ')).toBeNull()
    expect(schema.parse('\t\n')).toBeNull()
    expect(schema.parse('')).toBeNull()
  })

  it('preserves null and undefined values', () => {
    const schema = nullableTrimmedString()
    expect(schema.parse(null)).toBeNull()
    expect(schema.parse(undefined)).toBeNull()
  })

  it('respects max length constraint after trimming', () => {
    const schema = nullableTrimmedString(z.string().max(5))
    expect(schema.parse('  hi  ')).toBe('hi') // trims to 2 chars, under limit
    expect(() => schema.parse('  toolong  ')).toThrow() // trims to 7 chars, over limit
  })

  it('allows passing a pre-built zod string schema', () => {
    const schema = nullableTrimmedString(z.string().min(2).max(10))
    expect(schema.parse('  ok  ')).toBe('ok')
    expect(() => schema.parse('  a  ')).toThrow() // trimmed value 'a' is too short
  })
})

describe('optionalTrimmedString', () => {
  it('trims leading and trailing whitespace from a string', () => {
    const schema = optionalTrimmedString()
    expect(schema.parse('  hello  ')).toBe('hello')
    expect(schema.parse('\t\nworld\n\t')).toBe('world')
  })

  it('converts whitespace-only strings to undefined', () => {
    const schema = optionalTrimmedString()
    expect(schema.parse('   ')).toBeUndefined()
    expect(schema.parse('\t\n')).toBeUndefined()
    expect(schema.parse('')).toBeUndefined()
  })

  it('preserves null and undefined values as undefined', () => {
    const schema = optionalTrimmedString()
    expect(schema.parse(null)).toBeUndefined()
    expect(schema.parse(undefined)).toBeUndefined()
  })

  it('respects max length constraint after trimming', () => {
    const schema = optionalTrimmedString(z.string().max(5))
    expect(schema.parse('  hi  ')).toBe('hi') // trims to 2 chars, under limit
    expect(() => schema.parse('  toolong  ')).toThrow() // trims to 7 chars, over limit
  })

  it('allows passing a pre-built zod string schema', () => {
    const schema = optionalTrimmedString(z.string().min(2).max(10))
    expect(schema.parse('  ok  ')).toBe('ok')
    expect(() => schema.parse('  a  ')).toThrow() // trimmed value 'a' is too short
  })
})
