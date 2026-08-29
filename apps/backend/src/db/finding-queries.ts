import { HELSINKI_TIMEZONE } from '@mik/contracts/date'
import type { DefectStatus } from '@mik/contracts/defects'
import {
  TRENDING_MIN_CLUSTER_SIZE,
  type Finding,
  type FindingKind,
  type FindingSearchFilters,
  type FindingSearchHit,
  type FindingSearchResponse,
  type RelatedFinding,
  type SearchableFindingKind,
  type TechnicalNotesQuery,
  type TrendingFindingCluster,
  type TrendingFindingsQuery,
} from '@mik/contracts/findings'
import { sql } from 'kysely'

import { db } from './connection.ts'

/**
 * Queries behind the defect/remark search and monitoring tool (#1230).
 *
 * Everything here is raw `sql`, which is unusual in this codebase, and it is
 * deliberate: the feature's whole premise is one feed over two (for the
 * technical-notes panel, three) tables with different shapes, and Kysely's
 * typed builder has no comfortable way to express a UNION of unrelated tables.
 * The rule from DATA_LAYER.md still applies inside these templates — the
 * column names are snake_case, verbatim, and only the *result keys* come back
 * camelCased by the plugin.
 */

/**
 * The trigram score above which two descriptions are called related.
 *
 * `similarity()` compares trigram *sets*, so word order barely matters and
 * shared vocabulary dominates -- which suits descriptions of the same symptom
 * written by two different pilots. Measured on wordings of the kind actually
 * logged here:
 *
 *   0.82  "Fuel increasing in right tank"  ~ "Right tank fuel level increasing"
 *   0.52  "Left brake soft"                ~ "Right brake soft"
 *   0.44  "Left brake soft"                ~ "Left brake feels spongy"
 *   0.38  "Fuel appears to be increasing in the right tank during the flight"
 *           ~ "Right tank fuel quantity increasing again, left tank steady"
 *   0.37  "Oikean tankin polttoaine lisääntyy" ~ "Polttoainemäärä kasvaa oikeassa tankissa"
 *   0.06  "Fuel increasing in right tank"  ~ "Nose wheel shimmy on landing"
 *
 * 0.3 is pg_trgm's own default `similarity_threshold`, and the gap in the
 * measurements above is wide enough that the exact figure inside it barely
 * matters: real restatements of one symptom land in the high 0.3s and above,
 * unrelated pairs in the low 0.0s. It is deliberately set at the loose end of
 * that gap, because this drives a hint a human then reads -- a near miss costs
 * a glance, a miss costs the pattern. The left/right brake pair at 0.52 is the
 * shape of false positive that gets through, and both members of it are still
 * brake defects on one aircraft.
 */
export const SIMILARITY_THRESHOLD = 0.3

/**
 * How far back "trending" looks when the caller names no `fromDate`. A pattern
 * the fleet closed out three years ago is history, not a trend, and the
 * clustering is a self-join over the window, so leaving it unbounded would
 * grow quadratically with the logbook.
 */
export const TRENDING_DEFAULT_WINDOW_DAYS = 365

/** How many related findings one lookup will hand back. */
const RELATED_LIMIT = 10

/**
 * Defects and remarks flattened onto one shape. `f.` is the alias every caller
 * below joins against, so the filters can be written once.
 *
 * A defect carries its own aircraft and logbook page; a remark has neither
 * column and resolves both through the flight it was written on, which is the
 * same join `getRemarksByAircraft` uses. The casts are what makes the two
 * branches union-compatible — `NULL` alone has no type, and `status` is an
 * enum on one side and absent on the other.
 */
const searchableFindings = sql`
  SELECT d.defect_id::text       AS finding_id,
         'DEFECT'::text          AS kind,
         d.aircraft_registration::text AS aircraft_registration,
         d.ajlb_seq_no::int      AS ajlb_seq_no,
         d.flight_id::text       AS flight_id,
         d.description           AS description,
         d.status::text          AS status,
         NULL::text              AS performed_by,
         d.recorded_on           AS recorded_on,
         d.created_at            AS created_at,
         d.created_by            AS created_by
    FROM flight.defect d
   UNION ALL
  SELECT r.remark_id::text,
         'REMARK'::text,
         l.aircraft_registration::text,
         l.ajlb_seq_no::int,
         r.flight_id::text,
         r.description,
         NULL::text,
         NULL::text,
         NULL::date,
         r.created_at,
         r.created_by
    FROM flight.remark r
   INNER JOIN flight.logs l ON l.flight_id = r.flight_id
`

/** The same, plus the maintenance notes that answer the defects. */
const technicalNotes = sql`
  ${searchableFindings}
   UNION ALL
  SELECT n.note_id::text,
         'MAINTENANCE_NOTE'::text,
         n.aircraft_registration::text,
         n.ajlb_seq_no::int,
         NULL::text,
         n.description,
         NULL::text,
         n.performed_by,
         n.recorded_on,
         n.created_at,
         n.created_by
    FROM flight.maintenance_note n
`

/**
 * A row of either source above. The kind is a type parameter so the queries
 * that read `searchableFindings` say so -- everything they return is a defect
 * or a remark, and `SearchableFinding` is what the contract calls that. Only
 * the technical-notes feed uses the wider default.
 */
type FindingRow<K extends FindingKind = FindingKind> = {
  findingId: string
  kind: K
  aircraftRegistration: string
  ajlbSeqNo: number | null
  flightId: string | null
  description: string
  status: DefectStatus | null
  performedBy: string | null
  recordedOn: string | null
  createdAt: Date | string
  createdBy: string
}

const mapRow = <K extends FindingKind>(row: FindingRow<K>): Finding & { kind: K } => ({
  findingId: row.findingId,
  kind: row.kind,
  aircraftRegistration: row.aircraftRegistration,
  ajlbSeqNo: row.ajlbSeqNo,
  flightId: row.flightId,
  description: row.description,
  status: row.status,
  performedBy: row.performedBy,
  recordedOn: row.recordedOn,
  createdAt: new Date(row.createdAt).toISOString(),
  createdBy: row.createdBy,
})

/**
 * A free-text fragment as an ILIKE pattern. The user's own `%` and `_` are
 * escaped rather than honoured: someone searching for "100%" means the string,
 * not a wildcard, and a bare `%` would otherwise match every row.
 */
const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

/**
 * Start of the Helsinki day named by `date`, as an instant. Written in SQL
 * rather than with dayjs so the conversion is DST-correct on the same rows the
 * comparison runs against.
 */
const dayStart = (date: string) => sql`(${date}::date AT TIME ZONE ${HELSINKI_TIMEZONE})`

/** Start of the Helsinki day *after* `date`, so `toDate` is an inclusive bound. */
const dayAfter = (date: string) =>
  sql`((${date}::date + INTERVAL '1 day') AT TIME ZONE ${HELSINKI_TIMEZONE})`

type DateWindow = { fromDate?: string; toDate?: string }

/**
 * The filter predicate shared by search and trending. Starts with `WHERE TRUE`
 * so every clause below it can be appended unconditionally, which keeps the
 * conditional fragments free of "is this the first one" bookkeeping.
 */
const findingsWhere = (
  filters: DateWindow & { aircraftRegistration?: string; kind?: string; q?: string },
) => sql`
  WHERE TRUE
  ${
    filters.aircraftRegistration
      ? sql`AND f.aircraft_registration = ${filters.aircraftRegistration}`
      : sql``
  }
  ${filters.kind ? sql`AND f.kind = ${filters.kind}` : sql``}
  ${filters.fromDate ? sql`AND f.created_at >= ${dayStart(filters.fromDate)}` : sql``}
  ${filters.toDate ? sql`AND f.created_at < ${dayAfter(filters.toDate)}` : sql``}
  ${filters.q ? sql`AND f.description ILIKE ${likePattern(filters.q)}` : sql``}
`

/**
 * The fleet-wide search. One page of defects and remarks, newest first, each
 * with a count of the *other* findings on the same aircraft that describe
 * something similar.
 *
 * The similarity subquery deliberately runs over the page rather than over the
 * whole result set: it is a cross product against every finding for that
 * aircraft, and there is no reason to pay for it on rows nobody is about to
 * see. `COUNT(*) OVER ()` supplies the unpaged total from the same scan, so
 * the endpoint stays one round trip.
 */
export async function searchFindings(
  filters: FindingSearchFilters,
): Promise<FindingSearchResponse> {
  const offset = (filters.page - 1) * filters.pageSize

  const { rows } = await sql<
    FindingRow<SearchableFindingKind> & { similarCount: number; totalRows: number }
  >`
    WITH findings AS (${searchableFindings}),
    page AS (
      SELECT f.*, (COUNT(*) OVER ())::int AS total_rows
        FROM findings f
        ${findingsWhere(filters)}
       ORDER BY f.created_at DESC, f.finding_id
       LIMIT ${filters.pageSize} OFFSET ${offset}
    )
    SELECT p.*,
           (SELECT COUNT(*)
              FROM findings o
             WHERE o.aircraft_registration = p.aircraft_registration
               AND NOT (o.finding_id = p.finding_id AND o.kind = p.kind)
               AND public.similarity(o.description, p.description) >= ${SIMILARITY_THRESHOLD}
           )::int AS similar_count
      FROM page p
     ORDER BY p.created_at DESC, p.finding_id
  `.execute(db)

  const entries: FindingSearchHit[] = rows.map((row) => ({
    ...mapRow(row),
    similarCount: row.similarCount,
  }))

  return {
    entries,
    // No rows means no window function ran, so the total has to come from here
    // rather than from a row that does not exist.
    total: rows[0]?.totalRows ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

/**
 * "This might be related": the findings on the same aircraft whose description
 * resembles the given one, best match first.
 *
 * Scoped to one aircraft on purpose. The same phrase on a different tail
 * number is a different aeroplane's problem, and treating it as a pattern
 * would bury the ones that are.
 */
export async function findRelatedFindings(
  kind: SearchableFindingKind,
  findingId: string,
): Promise<RelatedFinding[]> {
  const { rows } = await sql<FindingRow<SearchableFindingKind> & { similarity: number }>`
    WITH findings AS (${searchableFindings}),
    target AS (
      SELECT * FROM findings f WHERE f.kind = ${kind} AND f.finding_id = ${findingId}
    )
    SELECT o.*, public.similarity(o.description, t.description)::float8 AS similarity
      FROM findings o
     CROSS JOIN target t
     WHERE o.aircraft_registration = t.aircraft_registration
       AND NOT (o.finding_id = t.finding_id AND o.kind = t.kind)
       AND public.similarity(o.description, t.description) >= ${SIMILARITY_THRESHOLD}
     ORDER BY similarity DESC, o.created_at DESC
     LIMIT ${RELATED_LIMIT}
  `.execute(db)

  return rows.map((row) => ({ ...mapRow(row), similarity: row.similarity }))
}

/** Whether a finding exists at all, so "no related findings" and "no such finding" differ. */
export async function findingExists(
  kind: SearchableFindingKind,
  findingId: string,
): Promise<boolean> {
  const { rows } = await sql<{ exists: boolean }>`
    WITH findings AS (${searchableFindings})
    SELECT EXISTS (
      SELECT 1 FROM findings f WHERE f.kind = ${kind} AND f.finding_id = ${findingId}
    ) AS exists
  `.execute(db)

  return rows[0]?.exists ?? false
}

const defaultTrendingFrom = (): string => {
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - TRENDING_DEFAULT_WINDOW_DAYS)
  return from.toISOString().slice(0, 10)
}

type PairRow = {
  aKind: SearchableFindingKind
  aId: string
  bKind: SearchableFindingKind
  bId: string
  score: number
}

/** `kind:id`, the key clusters are built on — ids are unique per kind, not across them. */
const keyOf = (kind: FindingKind, findingId: string): string => `${kind}:${findingId}`

/**
 * The monitoring half of the tool: groups of findings on one aircraft that all
 * describe the same thing.
 *
 * The pairing is done in SQL (a self-join on similarity) and the *grouping* in
 * TypeScript, because "related" is not transitive — A resembles B and B
 * resembles C without A resembling C — and Postgres has no transitive-closure
 * operator that would not cost more than this. Union-find over the pairs gives
 * the same answer the eye does: everything reachable through a chain of
 * resemblance is one pattern.
 */
export async function findTrendingFindings(
  query: TrendingFindingsQuery,
): Promise<TrendingFindingCluster[]> {
  const fromDate = query.fromDate ?? defaultTrendingFrom()
  const window = { ...query, fromDate }

  const [scoped, pairs] = await Promise.all([
    sql<FindingRow<SearchableFindingKind>>`
      WITH findings AS (${searchableFindings})
      SELECT f.* FROM findings f ${findingsWhere(window)}
    `.execute(db),
    sql<PairRow>`
      WITH findings AS (${searchableFindings}),
      scoped AS (SELECT f.* FROM findings f ${findingsWhere(window)})
      SELECT a.kind AS a_kind, a.finding_id AS a_id,
             b.kind AS b_kind, b.finding_id AS b_id,
             public.similarity(a.description, b.description)::float8 AS score
        FROM scoped a
       INNER JOIN scoped b
          ON b.aircraft_registration = a.aircraft_registration
         -- Each unordered pair once. Ordering on the id alone would drop a
         -- pair whose two members were created in the same millisecond.
         AND (a.created_at, a.finding_id) < (b.created_at, b.finding_id)
       WHERE public.similarity(a.description, b.description) >= ${SIMILARITY_THRESHOLD}
    `.execute(db),
  ])

  const findings = new Map(scoped.rows.map((row) => [keyOf(row.kind, row.findingId), mapRow(row)]))

  /**
   * Each finding's best score against anything it was paired with. Reporting
   * the score against the cluster's newest member instead would print 0.00 for
   * a chained member -- one that reached the cluster through a third report
   * and never scored against the newest at all -- which reads as "not similar"
   * on the very row the cluster exists to show. The best link is always at or
   * above the threshold, and is the honest answer to "why is this here".
   */
  const bestScores = new Map<string, number>()
  const recordScore = (key: string, score: number) => {
    bestScores.set(key, Math.max(bestScores.get(key) ?? 0, score))
  }
  for (const pair of pairs.rows) {
    recordScore(keyOf(pair.aKind, pair.aId), pair.score)
    recordScore(keyOf(pair.bKind, pair.bId), pair.score)
  }

  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let root = key
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  for (const key of findings.keys()) parent.set(key, key)
  for (const pair of pairs.rows) {
    const a = find(keyOf(pair.aKind, pair.aId))
    const b = find(keyOf(pair.bKind, pair.bId))
    if (a !== b) parent.set(a, b)
  }

  const groups = new Map<string, string[]>()
  for (const key of findings.keys()) {
    const root = find(key)
    groups.set(root, [...(groups.get(root) ?? []), key])
  }

  const clusters: TrendingFindingCluster[] = []
  for (const members of groups.values()) {
    if (members.length < TRENDING_MIN_CLUSTER_SIZE) continue

    const sorted = members
      .map((key) => findings.get(key)!)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const [latest, ...others] = sorted

    clusters.push({
      aircraftRegistration: latest.aircraftRegistration,
      latest,
      others: others.map((finding) => ({
        ...finding,
        similarity: bestScores.get(keyOf(finding.kind, finding.findingId)) ?? 0,
      })),
      size: sorted.length,
      firstReportedAt: sorted[sorted.length - 1].createdAt,
    })
  }

  // Biggest pattern first, then the one that flared up most recently.
  return clusters.sort(
    (a, b) => b.size - a.size || b.latest.createdAt.localeCompare(a.latest.createdAt),
  )
}

/**
 * One aircraft's recent technical history — defects, remarks and the
 * maintenance notes that answered them, newest first. What a captain wanted to
 * see "at a glance" before flying it.
 */
export async function getTechnicalNotes(query: TechnicalNotesQuery): Promise<Finding[]> {
  const { rows } = await sql<FindingRow>`
    WITH entries AS (${technicalNotes})
    SELECT e.* FROM entries e
     WHERE e.aircraft_registration = ${query.aircraftRegistration}
     ORDER BY e.created_at DESC, e.finding_id
     LIMIT ${query.limit}
  `.execute(db)

  return rows.map(mapRow)
}
