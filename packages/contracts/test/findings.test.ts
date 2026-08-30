import { describe, expect, it } from 'vitest'

import dayjs from 'dayjs'
import {
  FindingSearchFiltersSchema,
  FindingSearchHitSchema,
  RelatedFindingsQuerySchema,
  TechnicalNotesQuerySchema,
  TrendingFindingsQuerySchema,
  TRENDING_MAX_WINDOW_DAYS,
  TRENDING_MIN_CLUSTER_SIZE,
} from '../src/findings.ts'

/**
 * These schemas parse `req.query`, where every value arrives as a string, so
 * what is under test is mostly coercion and the defaults a caller relies on
 * without sending them.
 */
describe('FindingSearchFiltersSchema', () => {
  it('defaults to the first page when the caller sends no pagination', () => {
    const filters = FindingSearchFiltersSchema.parse({})

    expect(filters.page).toBe(1)
    expect(filters.pageSize).toBe(25)
  })

  it('coerces the pagination a query string delivers as text', () => {
    const filters = FindingSearchFiltersSchema.parse({ page: '3', pageSize: '10' })

    expect(filters.page).toBe(3)
    expect(filters.pageSize).toBe(10)
  })

  it('refuses a page size beyond the cap', () => {
    // Otherwise a caller can ask for the whole fleet's history in one request,
    // and the search's per-row similarity subquery runs on all of it.
    expect(() => FindingSearchFiltersSchema.parse({ pageSize: '5000' })).toThrow()
  })

  it('trims the free-text fragment and rejects one that is only whitespace', () => {
    expect(FindingSearchFiltersSchema.parse({ q: '  fuel  ' }).q).toBe('fuel')
    expect(() => FindingSearchFiltersSchema.parse({ q: '   ' })).toThrow()
  })

  it('accepts a calendar date and rejects anything else', () => {
    expect(FindingSearchFiltersSchema.parse({ fromDate: '2026-01-31' }).fromDate).toBe('2026-01-31')
    expect(() => FindingSearchFiltersSchema.parse({ fromDate: '31.01.2026' })).toThrow()
  })

  it('rejects a range that ends before it starts', () => {
    // Unchecked this is not a validation failure at all: the SQL predicate
    // matches nothing and the screen says "no defects or remarks match these
    // filters", which reads as an answer about the fleet rather than about
    // the question. `withDateRangeCheck` in ./schema.ts does the same for the
    // report filters, but it requires both bounds; here either may be absent.
    expect(() =>
      FindingSearchFiltersSchema.parse({ fromDate: '2026-08-10', toDate: '2026-08-01' }),
    ).toThrow()
  })

  it('accepts a range of a single day, and one open at either end', () => {
    expect(
      FindingSearchFiltersSchema.parse({ fromDate: '2026-08-10', toDate: '2026-08-10' }).fromDate,
    ).toBe('2026-08-10')
    expect(FindingSearchFiltersSchema.parse({ fromDate: '2026-08-10' }).toDate).toBeUndefined()
    expect(FindingSearchFiltersSchema.parse({ toDate: '2026-08-01' }).fromDate).toBeUndefined()
  })

  it('only searches the two kinds that are findings in their own right', () => {
    // A maintenance note is the answer to a defect, not a report of one. It
    // shows up in the per-aircraft technical-notes feed instead.
    expect(FindingSearchFiltersSchema.parse({ kind: 'DEFECT' }).kind).toBe('DEFECT')
    expect(FindingSearchFiltersSchema.parse({ kind: 'REMARK' }).kind).toBe('REMARK')
    expect(() => FindingSearchFiltersSchema.parse({ kind: 'MAINTENANCE_NOTE' })).toThrow()
    expect(() => FindingSearchFiltersSchema.parse({ kind: 'OCCURRENCE' })).toThrow()
  })
})

describe('FindingSearchHitSchema', () => {
  const hit = {
    findingId: 'a1',
    kind: 'REMARK',
    aircraftRegistration: 'OH-STL',
    ajlbSeqNo: 3,
    flightId: 'flt-1',
    description: 'Fuel increasing in the right tank',
    status: null,
    performedBy: null,
    recordedOn: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    createdBy: 'Matti1',
    similarCount: 1,
  }

  it('accepts a remark, which has no status, page date or performer of its own', () => {
    expect(FindingSearchHitSchema.parse(hit).similarCount).toBe(1)
  })

  it('accepts a defect, which has all three', () => {
    const defect = FindingSearchHitSchema.parse({
      ...hit,
      kind: 'DEFECT',
      status: 'MOVED_TO_HIL',
      recordedOn: '2026-08-01',
      flightId: null,
    })

    expect(defect.status).toBe('MOVED_TO_HIL')
    expect(defect.recordedOn).toBe('2026-08-01')
  })

  it('rejects a status that is not one a defect can be in', () => {
    expect(() => FindingSearchHitSchema.parse({ ...hit, status: 'CLOSED' })).toThrow()
  })
})

describe('RelatedFindingsQuerySchema', () => {
  it('demands both the kind and the id', () => {
    expect(RelatedFindingsQuerySchema.parse({ kind: 'DEFECT', findingId: 'd-1' })).toEqual({
      kind: 'DEFECT',
      findingId: 'd-1',
    })
    expect(() => RelatedFindingsQuerySchema.parse({ findingId: 'd-1' })).toThrow()
    expect(() => RelatedFindingsQuerySchema.parse({ kind: 'DEFECT', findingId: '' })).toThrow()
  })
})

describe('TrendingFindingsQuerySchema', () => {
  it('takes no filters at all, so the fleet-wide view needs no arguments', () => {
    expect(TrendingFindingsQuerySchema.parse({})).toEqual({})
  })

  it('rejects an inverted range, like the search filters', () => {
    expect(() =>
      TrendingFindingsQuerySchema.parse({ fromDate: '2026-08-10', toDate: '2026-08-01' }),
    ).toThrow()
  })

  it('refuses a window wider than the cap', () => {
    // Clustering is a self-join within one aircraft, so its cost grows with
    // the square of what the window holds -- and the caller picks the window.
    const start = dayjs()
      .subtract(TRENDING_MAX_WINDOW_DAYS + 1, 'day')
      .format('YYYY-MM-DD')

    expect(() => TrendingFindingsQuerySchema.parse({ fromDate: start })).toThrow()
  })

  it('accepts a window at the cap', () => {
    const start = dayjs()
      .subtract(TRENDING_MAX_WINDOW_DAYS - 1, 'day')
      .format('YYYY-MM-DD')

    expect(TrendingFindingsQuerySchema.parse({ fromDate: start }).fromDate).toBe(start)
  })

  it('measures the window against toDate when one is given, not against today', () => {
    // A three-year window ending three years ago is the same amount of work as
    // one ending today.
    expect(() =>
      TrendingFindingsQuerySchema.parse({ fromDate: '2016-01-01', toDate: '2016-06-01' }),
    ).not.toThrow()
  })
})

describe('TechnicalNotesQuerySchema', () => {
  it('requires the aircraft and defaults the depth of the feed', () => {
    const query = TechnicalNotesQuerySchema.parse({ aircraftRegistration: 'OH-STL' })

    expect(query.limit).toBe(20)
    expect(() => TechnicalNotesQuerySchema.parse({})).toThrow()
  })

  it('caps how much history one request can pull', () => {
    expect(() =>
      TechnicalNotesQuerySchema.parse({ aircraftRegistration: 'OH-STL', limit: '1000' }),
    ).toThrow()
  })
})

describe('TRENDING_MIN_CLUSTER_SIZE', () => {
  it('is two, which is what the issue asked for', () => {
    // "System should offer 'this might be related' when there has been 2
    // remarks of fuel increasing in right tank" -- #1230, confirmed as "flag
    // at 2 total" in answer 5. Written down here so raising it is a decision
    // rather than a tweak.
    expect(TRENDING_MIN_CLUSTER_SIZE).toBe(2)
  })
})
