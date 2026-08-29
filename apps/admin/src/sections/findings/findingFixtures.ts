import type {
  FindingSearchHit,
  FindingSearchResponse,
  RelatedFinding,
  SearchableFinding,
  TrendingFindingCluster,
} from '@mik/contracts/findings'

/**
 * Findings fixtures, shared by the three suites in this directory rather than
 * by the app-wide `test/fixtures` — a defect/remark row means nothing outside
 * this feature, which is where the repo puts app-specific fixtures.
 */

export const aFinding = (overrides: Partial<SearchableFinding> = {}): SearchableFinding => ({
  findingId: 'f-1',
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
  ...overrides,
})

export const aHit = (overrides: Partial<FindingSearchHit> = {}): FindingSearchHit => ({
  ...aFinding(),
  similarCount: 0,
  ...overrides,
})

export const aRelatedFinding = (overrides: Partial<RelatedFinding> = {}): RelatedFinding => ({
  ...aFinding(),
  similarity: 0.42,
  ...overrides,
})

export const aSearchResponse = (
  entries: FindingSearchHit[],
  overrides: Partial<FindingSearchResponse> = {},
): FindingSearchResponse => ({
  entries,
  total: entries.length,
  page: 1,
  pageSize: 25,
  ...overrides,
})

export const aCluster = (
  overrides: Partial<TrendingFindingCluster> = {},
): TrendingFindingCluster => {
  const latest = aFinding({
    findingId: 'f-2',
    description: 'Right tank fuel quantity increasing',
    createdAt: '2026-08-20T09:00:00.000Z',
  })
  const others = [aRelatedFinding()]

  return {
    aircraftRegistration: latest.aircraftRegistration,
    latest,
    others,
    size: others.length + 1,
    firstReportedAt: others[others.length - 1].createdAt,
    ...overrides,
  }
}
