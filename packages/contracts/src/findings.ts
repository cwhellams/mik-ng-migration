import { z } from 'zod'

import { DefectStatusSchema } from './defects.ts'
import { PaginationSchema } from './schema.ts'

/**
 * Fleet-wide search over what a plane captain calls "findings" (#1230): the
 * defects and remarks recorded against any aircraft, in one feed, plus the
 * maintenance notes that answer them.
 *
 * The three live in different tables with genuinely different shapes -- a
 * defect has a lifecycle and sits on a logbook page, a remark is a
 * for-your-information note tied to one flight, a maintenance note records
 * work performed -- so the backend flattens them onto this one row rather than
 * making every caller union three response types. Fields that only one kind
 * has are nullable and documented as such below.
 *
 * Deliberately *not* here: `flight.occurrences`. Safety reports are a separate
 * system with its own confidentiality rules, and keeping them out was the
 * first answer on the issue.
 */
export const FindingKindSchema = z.enum(['DEFECT', 'REMARK', 'MAINTENANCE_NOTE'])
export type FindingKind = z.infer<typeof FindingKindSchema>

/**
 * What the search itself ranges over. Maintenance notes are excluded: the
 * search answers "what has gone wrong with the fleet", and a note is the
 * answer to a defect rather than a finding of its own. They appear in the
 * per-aircraft technical-notes feed below, which is a different question.
 */
export const SearchableFindingKindSchema = z.enum(['DEFECT', 'REMARK'])
export type SearchableFindingKind = z.infer<typeof SearchableFindingKindSchema>

export const FindingSchema = z.object({
  /** `defectId`, `remarkId` or `noteId`, depending on `kind`. */
  findingId: z.string(),
  kind: FindingKindSchema,
  aircraftRegistration: z.string(),
  /** A remark's is resolved through its flight; every other kind stores its own. */
  ajlbSeqNo: z.number().int().nullable(),
  /** Set for remarks and for in-flight defects; null for the rest. */
  flightId: z.string().nullable(),
  description: z.string(),
  /** Defects only -- a remark has no lifecycle and a maintenance note is the end of one. */
  status: DefectStatusSchema.nullable(),
  /** Maintenance notes only: who did the work, as it reads in the logbook. */
  performedBy: z.string().nullable(),
  /** The logbook date. Null for remarks, which are dated by their flight alone. */
  recordedOn: z.string().date().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
})

export type Finding = z.infer<typeof FindingSchema>

/**
 * A finding the search and the similarity matching range over. Narrower than
 * `Finding` in exactly one field: the kind can only be one of the two, which
 * is what lets a caller pass a hit straight back to the related-findings
 * endpoint without asserting it is not a maintenance note.
 */
export const SearchableFindingSchema = FindingSchema.extend({
  kind: SearchableFindingKindSchema,
})

export type SearchableFinding = z.infer<typeof SearchableFindingSchema>

/**
 * A search hit, plus how many *other* findings on the same aircraft describe
 * something similar enough to be worth a second look. Zero for almost every
 * row; the whole point of the number is the row where it isn't.
 */
export const FindingSearchHitSchema = SearchableFindingSchema.extend({
  similarCount: z.number().int().min(0),
})

export type FindingSearchHit = z.infer<typeof FindingSearchHitSchema>

/**
 * `GET /v1/findings`'s query. Dates filter on `createdAt` -- when the finding
 * was *reported* -- rather than on the flight or logbook date behind it, which
 * is the second answer on the issue. Both bounds are inclusive whole days in
 * the club's timezone, resolved by the backend so this stays clock-free.
 */
export const FindingSearchFiltersSchema = z
  .object({
    aircraftRegistration: z.string().min(1).optional(),
    kind: SearchableFindingKindSchema.optional(),
    fromDate: z.string().date().optional(),
    toDate: z.string().date().optional(),
    /** Free-text fragment matched against the description, case-insensitively. */
    q: z.string().trim().min(1).optional(),
  })
  .merge(PaginationSchema(25))

export type FindingSearchFilters = z.infer<typeof FindingSearchFiltersSchema>

export const FindingSearchResponseSchema = z.object({
  entries: z.array(FindingSearchHitSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type FindingSearchResponse = z.infer<typeof FindingSearchResponseSchema>

/** A finding that resembles another one, with the score that said so. */
export const RelatedFindingSchema = SearchableFindingSchema.extend({
  /**
   * Trigram similarity, 0..1. From `related`, against the finding asked about;
   * from `trending`, against whichever other member of the cluster it
   * resembles most -- see `findTrendingFindings`, which explains why the
   * cluster reports the best link rather than the distance to its newest row.
   */
  similarity: z.number().min(0).max(1),
})

export type RelatedFinding = z.infer<typeof RelatedFindingSchema>

export const RelatedFindingsResponseSchema = z.object({
  findings: z.array(RelatedFindingSchema),
})

export type RelatedFindingsResponse = z.infer<typeof RelatedFindingsResponseSchema>

/** `GET /v1/findings/related`'s query: which finding to look for company for. */
export const RelatedFindingsQuerySchema = z.object({
  kind: SearchableFindingKindSchema,
  findingId: z.string().min(1),
})

export type RelatedFindingsQuery = z.infer<typeof RelatedFindingsQuerySchema>

/**
 * One cluster of findings on a single aircraft that all describe the same
 * thing -- the issue's own example, two remarks about fuel increasing in the
 * right tank, is exactly this. A cluster is only reported once it has at least
 * `TRENDING_MIN_CLUSTER_SIZE` members, per the fifth answer on the issue:
 * flag at two, not at three.
 */
export const TrendingFindingClusterSchema = z.object({
  aircraftRegistration: z.string(),
  /** The most recent member, which is what the cluster is labelled by. */
  latest: SearchableFindingSchema,
  /** Everything else in the cluster, newest first. */
  others: z.array(RelatedFindingSchema),
  /** `others.length + 1`, i.e. how many reports the pattern rests on. */
  size: z.number().int().min(2),
  /** The oldest member's `createdAt`, so the UI can say "over the last N weeks". */
  firstReportedAt: z.string().datetime(),
})

export type TrendingFindingCluster = z.infer<typeof TrendingFindingClusterSchema>

export const TrendingFindingsResponseSchema = z.object({
  clusters: z.array(TrendingFindingClusterSchema),
})

export type TrendingFindingsResponse = z.infer<typeof TrendingFindingsResponseSchema>

/** Two reports of the same thing are a pattern -- issue #1230, answer 5. */
export const TRENDING_MIN_CLUSTER_SIZE = 2

export const TrendingFindingsQuerySchema = z.object({
  aircraftRegistration: z.string().min(1).optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
})

export type TrendingFindingsQuery = z.infer<typeof TrendingFindingsQuerySchema>

/**
 * `GET /v1/findings/technical-notes`'s query -- one aircraft's recent
 * technical history, defects and remarks and maintenance notes together, for
 * the "Recent technical notes" panel on the member app's aircraft page. The
 * club member asking for it wanted the whole of an aircraft's technical status
 * "at a glance", which is why this one does include maintenance notes.
 */
export const TechnicalNotesQuerySchema = z.object({
  aircraftRegistration: z.string().min(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type TechnicalNotesQuery = z.infer<typeof TechnicalNotesQuerySchema>

export const TechnicalNotesResponseSchema = z.object({
  entries: z.array(FindingSchema),
})

export type TechnicalNotesResponse = z.infer<typeof TechnicalNotesResponseSchema>
