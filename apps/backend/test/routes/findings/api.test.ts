import 'dotenv/config'
import { HELSINKI_TIMEZONE, toHelsinkiDate } from '@mik/contracts/date'
import {
  TRENDING_MAX_WINDOW_DAYS,
  type FindingSearchResponse,
  type RelatedFindingsResponse,
  type TechnicalNotesResponse,
  type TrendingFindingsResponse,
} from '@mik/contracts/findings'
import { MIKPermissions } from '@mik/contracts/members'
import cookieParser from 'cookie-parser'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import express from 'express'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/findings/api.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

dayjs.extend(utc)
dayjs.extend(timezone)

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/findings', router)
app.use(problemErrorHandler)

/**
 * Real, pre-seeded flights and logbook pages: both tables this feature reads
 * have foreign keys, so the rows have to hang off genuine ones.
 *
 * OH-P28 rather than OH-STL, which the shipped test data (V450) deliberately
 * seeds two similarity clusters on -- assertions here would then be measuring
 * that file as much as this code.
 */
const AIRCRAFT = 'OH-P28'
const AJLB_SEQ_NO = 4
const FLIGHTS = ['te1nr01a', 'rs1nr04a', 'pi1nr02a'] as const
const OTHER_AIRCRAFT_FLIGHT = 'ihq3fn1'

/**
 * Stamped into every description this suite writes, so a search can be scoped
 * to exactly the rows under test. The database it runs against is the seeded
 * development database, not an empty one.
 */
const MARK = 'FINDINGTESTMARK'

/**
 * Wordings for the similarity assertions, which deliberately carry no `MARK`:
 * the marker is 15 characters every description would then share, and trigram
 * similarity is a set comparison, so it would prop up every score in the
 * suite. These are scoped by aircraft and by id instead.
 *
 * Measured against each other and against every finding the seeded test data
 * puts on OH-P28 and OH-IHQ (worst case 0.11, well under the 0.3 threshold):
 *
 *   CARB_HEAT   ~ CARB_HEAT_AGAIN  0.66
 *   CARB_HEAT   ~ WASHER_FLUID     0.00
 *   BRAKE_SOFT  ~ BRAKE_BOTH       0.49
 *   BRAKE_BOTH  ~ BRAKE_SQUEAL     0.54
 *   BRAKE_SOFT  ~ BRAKE_SQUEAL     0.14  <- the chain's two ends
 */
const CARB_HEAT = 'Carburettor heat control sticking at full travel'
const CARB_HEAT_AGAIN = 'Carb heat control sticking, needs force at full travel'
const WASHER_FLUID = 'Windscreen washer reservoir empty'
const BRAKE_SOFT = 'Right brake pedal soft'
const BRAKE_BOTH = 'Right brake pedal soft and squealing at low speed'
const BRAKE_SQUEAL = 'Brake squealing loudly at low speed'

const adminToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'matti@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Korhonen',
  email: 'liisa@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const noAccessToken = generateAccessToken({
  memberId: 'na',
  lastName: 'Unknown',
  email: 'no-permissions@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

const createdRemarkIds: string[] = []
const createdDefectIds: string[] = []
const createdNoteIds: string[] = []

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

/**
 * The instant at which the Helsinki clock read `time` on the Helsinki day
 * `daysAgo(days)` fell on. Lets a test place a row at a named wall-clock hour
 * of a named day without depending on what time the suite happens to run.
 */
const atHelsinkiTime = (days: number, time: string): Date =>
  dayjs.tz(`${toHelsinkiDate(daysAgo(days))} ${time}`, HELSINKI_TIMEZONE).toDate()

/**
 * The Helsinki calendar date an instant falls on -- deliberately not
 * `toISOString().slice(0, 10)`, which is the *UTC* date.
 *
 * `fromDate`/`toDate` name whole days in the club's timezone, so a test that
 * inserts a row at an instant and then asks for the day that instant fell on
 * has to agree with the endpoint about which day that is. Taking the UTC date
 * instead made this suite fail for the three hours a day when the two differ:
 * a row written at 00:46 Helsinki is 21:46 UTC the day before, so `toDate`
 * came out one day early and excluded the row it was supposed to include.
 * It passed every time it was run in the morning, which is exactly the shape
 * of flake that reaches main.
 */
const isoDate = (at: Date): string => toHelsinkiDate(at)

const insertRemark = async (
  flightId: string,
  description: string,
  createdAt = new Date(),
): Promise<string> => {
  const row = await db
    .insertInto('flight.remark')
    .values({
      flightId,
      description,
      createdAt,
      createdBy: 'Liisa1',
      updatedAt: createdAt,
      updatedBy: 'Liisa1',
    })
    .returning('remarkId')
    .executeTakeFirstOrThrow()
  createdRemarkIds.push(row.remarkId)
  return row.remarkId
}

const insertDefect = async (
  description: string,
  createdAt = new Date(),
  aircraftRegistration = AIRCRAFT,
  ajlbSeqNo = AJLB_SEQ_NO,
): Promise<string> => {
  const row = await db
    .insertInto('flight.defect')
    .values({
      aircraftRegistration,
      ajlbSeqNo,
      flightId: null,
      description,
      flightMins: 999_000,
      recordedOn: isoDate(createdAt),
      rows: 1,
      status: 'ACTIVE',
      createdAt,
      createdBy: 'Matti1',
      updatedAt: createdAt,
      updatedBy: 'Matti1',
    })
    .returning('defectId')
    .executeTakeFirstOrThrow()
  createdDefectIds.push(row.defectId)
  return row.defectId
}

const insertMaintenanceNote = async (description: string, createdAt = new Date()) => {
  const row = await db
    .insertInto('flight.maintenanceNote')
    .values({
      aircraftRegistration: AIRCRAFT,
      ajlbSeqNo: AJLB_SEQ_NO,
      description,
      performedBy: 'Huolto Oy',
      flightMins: 999_000,
      recordedOn: isoDate(createdAt),
      rows: 1,
      createdAt,
      createdBy: 'Matti1',
      updatedAt: createdAt,
      updatedBy: 'Matti1',
    })
    .returning('noteId')
    .executeTakeFirstOrThrow()
  createdNoteIds.push(row.noteId)
  return row.noteId
}

const cleanup = async () => {
  if (createdRemarkIds.length) {
    await db.deleteFrom('flight.remark').where('remarkId', 'in', createdRemarkIds).execute()
    createdRemarkIds.length = 0
  }
  if (createdDefectIds.length) {
    await db.deleteFrom('flight.defect').where('defectId', 'in', createdDefectIds).execute()
    createdDefectIds.length = 0
  }
  if (createdNoteIds.length) {
    await db.deleteFrom('flight.maintenanceNote').where('noteId', 'in', createdNoteIds).execute()
    createdNoteIds.length = 0
  }
}

beforeEach(cleanup)
afterAll(cleanup)

const search = (token: string, query: Record<string, string | number>) =>
  request(app).get('/findings').set('Cookie', `accessToken=${token}`).query(query)

describe('permissions', () => {
  const adminOnly = [
    { path: '/findings', query: {} },
    { path: '/findings/trending', query: {} },
    { path: '/findings/related', query: { kind: 'REMARK', findingId: 'whatever' } },
  ]

  it.each(adminOnly)('rejects an invalid JWT on $path', async ({ path, query }) => {
    const res = await request(app).get(path).set('Cookie', 'accessToken=INVALID').query(query)

    expect(res.status).toBe(401)
  })

  it.each(adminOnly)('refuses an ordinary flight log user on $path', async ({ path, query }) => {
    // The fleet-wide view is FLIGHTLOG_ADMIN only (issue #1230, answer 6),
    // which is a step tighter than the per-aircraft defect and remark routes
    // any FLIGHTLOG_USER may already call.
    const res = await request(app).get(path).set('Cookie', `accessToken=${userToken}`).query(query)

    expect(res.status).toBe(403)
  })

  it.each(adminOnly)('refuses a member with no permissions on $path', async ({ path, query }) => {
    // The third leg of the backend's identity triad. The FLIGHTLOG_USER case
    // above already exercises "holds a permission, but not this one"; this is
    // "holds nothing at all", and the policy is that a gate is tested against
    // the whole set rather than from the inside.
    const res = await request(app)
      .get(path)
      .set('Cookie', `accessToken=${noAccessToken}`)
      .query(query)

    expect(res.status).toBe(403)
  })

  it.each(adminOnly)('allows a flight log admin on $path', async ({ path, query }) => {
    const res = await request(app).get(path).set('Cookie', `accessToken=${adminToken}`).query(query)

    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(401)
  })

  it('lets an ordinary flight log user read one aircraft’s technical notes', async () => {
    const res = await request(app)
      .get('/findings/technical-notes')
      .set('Cookie', `accessToken=${userToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(200)
  })

  it('refuses technical notes to a member with no flight log permission', async () => {
    const res = await request(app)
      .get('/findings/technical-notes')
      .set('Cookie', `accessToken=${noAccessToken}`)
      .query({ aircraftRegistration: AIRCRAFT })

    expect(res.status).toBe(403)
  })
})

describe('GET /findings', () => {
  it('returns defects and remarks in one feed, newest first', async () => {
    await insertRemark(FLIGHTS[0], `${MARK} oldest remark`, daysAgo(9))
    await insertDefect(`${MARK} middle defect`, daysAgo(5))
    await insertRemark(FLIGHTS[1], `${MARK} newest remark`, daysAgo(1))

    const res = await search(adminToken, { q: MARK })
    const body = res.body as FindingSearchResponse

    expect(res.status).toBe(200)
    expect(body.total).toBe(3)
    expect(body.entries.map((entry) => entry.kind)).toEqual(['REMARK', 'DEFECT', 'REMARK'])
    expect(body.entries.map((entry) => entry.description)).toEqual([
      `${MARK} newest remark`,
      `${MARK} middle defect`,
      `${MARK} oldest remark`,
    ])
  })

  it('resolves a remark’s aircraft and logbook page through its flight', async () => {
    // flight.remark has neither column; both come from the flight it was
    // written on, which is what makes an aircraft filter mean anything here.
    await insertRemark(FLIGHTS[0], `${MARK} resolved through the flight`)

    const body = (await search(adminToken, { q: MARK })).body as FindingSearchResponse

    expect(body.entries[0].aircraftRegistration).toBe(AIRCRAFT)
    expect(body.entries[0].ajlbSeqNo).toBe(AJLB_SEQ_NO)
    expect(body.entries[0].flightId).toBe(FLIGHTS[0])
  })

  it('filters by aircraft', async () => {
    await insertRemark(FLIGHTS[0], `${MARK} on the filtered aircraft`)
    await insertRemark(OTHER_AIRCRAFT_FLIGHT, `${MARK} on another aircraft`)

    const body = (await search(adminToken, { q: MARK, aircraftRegistration: AIRCRAFT }))
      .body as FindingSearchResponse

    expect(body.total).toBe(1)
    expect(body.entries[0].description).toBe(`${MARK} on the filtered aircraft`)
  })

  it('filters by kind', async () => {
    await insertRemark(FLIGHTS[0], `${MARK} a remark`)
    await insertDefect(`${MARK} a defect`)

    const remarks = (await search(adminToken, { q: MARK, kind: 'REMARK' }))
      .body as FindingSearchResponse
    const defects = (await search(adminToken, { q: MARK, kind: 'DEFECT' }))
      .body as FindingSearchResponse

    expect(remarks.entries.map((entry) => entry.description)).toEqual([`${MARK} a remark`])
    expect(defects.entries.map((entry) => entry.description)).toEqual([`${MARK} a defect`])
  })

  it('filters on when the finding was reported, both bounds inclusive', async () => {
    // Answer 2 on the issue: the date range is about created_at, not about the
    // flight or logbook date behind the row.
    await insertRemark(FLIGHTS[0], `${MARK} ten days ago`, daysAgo(10))
    await insertRemark(FLIGHTS[1], `${MARK} five days ago`, daysAgo(5))
    await insertRemark(FLIGHTS[2], `${MARK} one day ago`, daysAgo(1))

    const body = (
      await search(adminToken, {
        q: MARK,
        fromDate: isoDate(daysAgo(10)),
        toDate: isoDate(daysAgo(5)),
      })
    ).body as FindingSearchResponse

    expect(body.entries.map((entry) => entry.description).sort()).toEqual([
      `${MARK} five days ago`,
      `${MARK} ten days ago`,
    ])
  })

  it('bounds the range on the Helsinki day, not the UTC one', async () => {
    // Both bounds name a whole day in the club's timezone, so the row written
    // half an hour after Helsinki midnight belongs to `fromDate` and the one
    // half an hour before Helsinki midnight belongs to `toDate`.
    //
    // The `fromDate` half is a regression test. `AT TIME ZONE` takes its
    // direction from the operand's type, and the lower bound was built on a
    // bare `::date`, which Postgres routes through timestamptz and converts the
    // wrong way -- see `dayStart` in finding-queries.ts. The effective lower
    // bound was 06:00 Helsinki, so a defect reported at 00:30 on the first day
    // of the range was missing from the results and nothing said so.
    const day = 6
    await insertRemark(FLIGHTS[0], `${MARK} just after midnight`, atHelsinkiTime(day, '00:30'))
    await insertRemark(FLIGHTS[1], `${MARK} just before midnight`, atHelsinkiTime(day, '23:30'))

    const body = (
      await search(adminToken, {
        q: MARK,
        fromDate: isoDate(daysAgo(day)),
        toDate: isoDate(daysAgo(day)),
      })
    ).body as FindingSearchResponse

    expect(body.entries.map((entry) => entry.description).sort()).toEqual([
      `${MARK} just after midnight`,
      `${MARK} just before midnight`,
    ])
  })

  it('excludes the days either side of the range', async () => {
    const day = 6
    await insertRemark(FLIGHTS[0], `${MARK} the day before`, atHelsinkiTime(day + 1, '23:30'))
    await insertRemark(FLIGHTS[1], `${MARK} in range`, atHelsinkiTime(day, '12:00'))
    await insertRemark(FLIGHTS[2], `${MARK} the day after`, atHelsinkiTime(day - 1, '00:30'))

    const body = (
      await search(adminToken, {
        q: MARK,
        fromDate: isoDate(daysAgo(day)),
        toDate: isoDate(daysAgo(day)),
      })
    ).body as FindingSearchResponse

    expect(body.entries.map((entry) => entry.description)).toEqual([`${MARK} in range`])
  })

  it('matches the free-text fragment case-insensitively, anywhere in the description', async () => {
    await insertRemark(FLIGHTS[0], `${MARK} Carburettor icing suspected on descent`)
    await insertRemark(FLIGHTS[1], `${MARK} nothing to do with the weather`)

    const body = (await search(adminToken, { q: 'carburettor' })).body as FindingSearchResponse

    expect(body.total).toBe(1)
    expect(body.entries[0].description).toContain('Carburettor')
  })

  it('treats % and _ in the search text as characters, not wildcards', async () => {
    // Unescaped, a bare '%' matches every finding in the fleet -- the opposite
    // of what someone searching for "100%" is asking for.
    await insertRemark(FLIGHTS[0], `${MARK} fuel flow down 100% on the right engine`)
    await insertRemark(FLIGHTS[1], `${MARK} no percentage here`)

    const literal = (await search(adminToken, { q: '100%' })).body as FindingSearchResponse
    const wildcardOnly = (await search(adminToken, { q: '%' })).body as FindingSearchResponse

    expect(literal.total).toBe(1)
    expect(literal.entries[0].description).toContain('100%')
    expect(wildcardOnly.entries.map((entry) => entry.description)).not.toContain(
      `${MARK} no percentage here`,
    )
  })

  it('pages the result set and reports the unpaged total', async () => {
    await insertRemark(FLIGHTS[0], `${MARK} first`, daysAgo(3))
    await insertRemark(FLIGHTS[1], `${MARK} second`, daysAgo(2))
    await insertRemark(FLIGHTS[2], `${MARK} third`, daysAgo(1))

    const first = (await search(adminToken, { q: MARK, page: 1, pageSize: 2 }))
      .body as FindingSearchResponse
    const second = (await search(adminToken, { q: MARK, page: 2, pageSize: 2 }))
      .body as FindingSearchResponse

    expect(first.total).toBe(3)
    expect(first.pageSize).toBe(2)
    expect(first.entries).toHaveLength(2)
    expect(second.page).toBe(2)
    expect(second.entries.map((entry) => entry.description)).toEqual([`${MARK} first`])
  })

  it('still reports the real total on a page past the end of the results', async () => {
    // `COUNT(*) OVER ()` rides along on the rows, so an empty page carries no
    // total. Reporting 0 stranded the admin: the screen said "no matches" and
    // hid the pager, leaving no way back to page 1 from a stale page number.
    await insertRemark(FLIGHTS[0], `${MARK} first`, daysAgo(3))
    await insertRemark(FLIGHTS[1], `${MARK} second`, daysAgo(2))

    const body = (await search(adminToken, { q: MARK, page: 4, pageSize: 2 }))
      .body as FindingSearchResponse

    expect(body.entries).toEqual([])
    expect(body.total).toBe(2)
    expect(body.page).toBe(4)
  })

  it('reports a total of zero rather than failing when nothing matches', async () => {
    const body = (await search(adminToken, { q: 'no finding says this' }))
      .body as FindingSearchResponse

    expect(body.total).toBe(0)
    expect(body.entries).toEqual([])
  })

  it('counts how many other findings on the same aircraft look similar', async () => {
    await insertRemark(FLIGHTS[0], CARB_HEAT, daysAgo(30))
    await insertRemark(FLIGHTS[1], CARB_HEAT_AGAIN, daysAgo(2))
    await insertRemark(FLIGHTS[2], WASHER_FLUID, daysAgo(1))

    const body = (await search(adminToken, { aircraftRegistration: AIRCRAFT }))
      .body as FindingSearchResponse
    const byDescription = new Map(body.entries.map((entry) => [entry.description, entry]))

    expect(byDescription.get(CARB_HEAT)?.similarCount).toBe(1)
    expect(byDescription.get(CARB_HEAT_AGAIN)?.similarCount).toBe(1)
    expect(byDescription.get(WASHER_FLUID)?.similarCount).toBe(0)
  })

  it('does not count a matching description on a different aircraft', async () => {
    // Two aeroplanes with the same symptom are two problems, not a pattern.
    await insertRemark(FLIGHTS[0], CARB_HEAT)
    await insertRemark(OTHER_AIRCRAFT_FLIGHT, CARB_HEAT)

    const body = (await search(adminToken, { q: CARB_HEAT })).body as FindingSearchResponse

    expect(body.total).toBe(2)
    expect(body.entries.map((entry) => entry.similarCount)).toEqual([0, 0])
  })

  it('rejects a malformed date', async () => {
    const res = await search(adminToken, { fromDate: 'last tuesday' })

    expect(res.status).toBe(400)
  })

  it('rejects a range that ends before it starts', async () => {
    // Unvalidated this is not an error at all -- the predicate simply matches
    // nothing, and the screen says "no defects or remarks match these
    // filters", which reads as an answer about the fleet rather than about
    // the question.
    const res = await search(adminToken, { fromDate: '2026-08-10', toDate: '2026-08-01' })

    expect(res.status).toBe(400)
  })

  it('accepts a range of one single day', async () => {
    const res = await search(adminToken, { fromDate: '2026-08-10', toDate: '2026-08-10' })

    expect(res.status).toBe(200)
  })
})

describe('GET /findings/related', () => {
  it('finds the earlier report of the same symptom, best match first', async () => {
    const first = await insertRemark(FLIGHTS[0], CARB_HEAT, daysAgo(30))
    await insertRemark(FLIGHTS[1], WASHER_FLUID, daysAgo(20))
    const latest = await insertRemark(FLIGHTS[2], CARB_HEAT_AGAIN, daysAgo(1))

    const res = await request(app)
      .get('/findings/related')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ kind: 'REMARK', findingId: latest })
    const body = res.body as RelatedFindingsResponse

    expect(res.status).toBe(200)
    expect(body.findings.map((finding) => finding.findingId)).toEqual([first])
    expect(body.findings[0].similarity).toBeGreaterThan(0.3)
  })

  it('returns nothing for a finding that resembles nothing else', async () => {
    const alone = await insertRemark(FLIGHTS[0], WASHER_FLUID)

    const body = (
      await request(app)
        .get('/findings/related')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ kind: 'REMARK', findingId: alone })
    ).body as RelatedFindingsResponse

    expect(body.findings).toEqual([])
  })

  it('reports how many related findings there are, not how many it returned', async () => {
    // The list is capped, and the search row that opens it counts every match,
    // so without a total the expansion would show ten of fifteen while the row
    // promised fifteen.
    const target = await insertRemark(FLIGHTS[0], CARB_HEAT, daysAgo(1))
    for (let index = 0; index < 12; index += 1) {
      await insertRemark(FLIGHTS[1], `${CARB_HEAT_AGAIN} (${index})`, daysAgo(index + 2))
    }

    const body = (
      await request(app)
        .get('/findings/related')
        .set('Cookie', `accessToken=${adminToken}`)
        .query({ kind: 'REMARK', findingId: target })
    ).body as RelatedFindingsResponse

    expect(body.total).toBe(12)
    expect(body.findings).toHaveLength(10)
  })

  it('404s for a finding that does not exist', async () => {
    // Otherwise a mistyped id is indistinguishable from a finding nothing
    // resembles, and reads as "nothing to worry about".
    const res = await request(app)
      .get('/findings/related')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ kind: 'REMARK', findingId: '0195c1a0-9999-4000-8000-999999999999' })

    expect(res.status).toBe(404)
  })

  it('rejects a kind it cannot search', async () => {
    const res = await request(app)
      .get('/findings/related')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ kind: 'MAINTENANCE_NOTE', findingId: 'anything' })

    expect(res.status).toBe(400)
  })
})

describe('GET /findings/trending', () => {
  const trending = (query: Record<string, string> = {}) =>
    request(app).get('/findings/trending').set('Cookie', `accessToken=${adminToken}`).query(query)

  it('flags a pattern as soon as two reports describe it', async () => {
    // The issue's own example, and answer 5: two reports are a pattern, not
    // three. This is the test that fails if the bar is ever raised to three.
    const older = await insertRemark(FLIGHTS[0], CARB_HEAT, daysAgo(30))
    const newer = await insertRemark(FLIGHTS[1], CARB_HEAT_AGAIN, daysAgo(2))

    const body = (await trending({ aircraftRegistration: AIRCRAFT }))
      .body as TrendingFindingsResponse
    const cluster = body.clusters.find((candidate) => candidate.latest.findingId === newer)

    expect(cluster).toBeDefined()
    expect(cluster?.size).toBe(2)
    expect(cluster?.others.map((other) => other.findingId)).toEqual([older])
    expect(cluster?.firstReportedAt).toBe(cluster?.others[0].createdAt)
  })

  it('does not report a lone finding as a pattern', async () => {
    const alone = await insertRemark(FLIGHTS[0], WASHER_FLUID)

    const body = (await trending({ aircraftRegistration: AIRCRAFT }))
      .body as TrendingFindingsResponse

    expect(
      body.clusters.some((cluster) =>
        [cluster.latest, ...cluster.others].some((finding) => finding.findingId === alone),
      ),
    ).toBe(false)
  })

  it('keeps two aircraft with the same symptom apart', async () => {
    const mine = [
      await insertRemark(FLIGHTS[0], CARB_HEAT, daysAgo(20)),
      await insertRemark(OTHER_AIRCRAFT_FLIGHT, CARB_HEAT, daysAgo(10)),
    ]

    // No aircraft filter: the fleet-wide view is where the two would meet if
    // similarity were not scoped per aircraft.
    const body = (await trending()).body as TrendingFindingsResponse
    const clustered = body.clusters.filter((cluster) =>
      [cluster.latest, ...cluster.others].some((finding) => mine.includes(finding.findingId)),
    )

    expect(clustered).toEqual([])
  })

  it('groups a chain of reports into one pattern across both kinds', async () => {
    // "Similar" is not transitive: BRAKE_SOFT and BRAKE_SQUEAL score 0.14
    // against each other and only reach the same cluster through BRAKE_BOTH.
    // They are still one pattern, which is what the union-find in the query
    // module is for -- and every member reports the score of its own best
    // link, so a chained member never reads as 0.00 "not similar".
    await insertRemark(FLIGHTS[0], BRAKE_SOFT, daysAgo(40))
    await insertRemark(FLIGHTS[1], BRAKE_BOTH, daysAgo(20))
    await insertDefect(BRAKE_SQUEAL, daysAgo(1))

    const body = (await trending({ aircraftRegistration: AIRCRAFT }))
      .body as TrendingFindingsResponse
    const cluster = body.clusters.find((candidate) => candidate.latest.description === BRAKE_SQUEAL)

    expect(cluster?.size).toBe(3)
    expect(cluster?.latest.kind).toBe('DEFECT')
    expect(cluster?.others.map((other) => other.description)).toEqual([BRAKE_BOTH, BRAKE_SOFT])
    for (const other of cluster?.others ?? []) {
      expect(other.similarity).toBeGreaterThan(0.3)
    }
  })

  it('refuses a window wider than the cap', async () => {
    // Clustering is a self-join inside one aircraft, so its cost grows with
    // the square of what the window holds and the caller picks the window.
    const res = await trending({ fromDate: isoDate(daysAgo(TRENDING_MAX_WINDOW_DAYS + 30)) })

    expect(res.status).toBe(400)
  })

  it('accepts a window at the cap', async () => {
    const res = await trending({ fromDate: isoDate(daysAgo(TRENDING_MAX_WINDOW_DAYS - 1)) })

    expect(res.status).toBe(200)
  })

  it('excludes findings reported outside the window', async () => {
    const mine = [
      await insertRemark(FLIGHTS[0], CARB_HEAT, daysAgo(200)),
      await insertRemark(FLIGHTS[1], CARB_HEAT_AGAIN, daysAgo(2)),
    ]

    const body = (
      await trending({ aircraftRegistration: AIRCRAFT, fromDate: isoDate(daysAgo(30)) })
    ).body as TrendingFindingsResponse

    expect(
      body.clusters.some((cluster) =>
        [cluster.latest, ...cluster.others].some((finding) => mine.includes(finding.findingId)),
      ),
    ).toBe(false)
  })
})

describe('GET /findings/technical-notes', () => {
  const notes = (query: Record<string, string | number>) =>
    request(app)
      .get('/findings/technical-notes')
      .set('Cookie', `accessToken=${userToken}`)
      .query(query)

  it('gathers defects, remarks and maintenance notes for one aircraft', async () => {
    await insertDefect(`${MARK} Oil seepage around the cowling`, daysAgo(3))
    await insertRemark(FLIGHTS[0], `${MARK} Cabin door seal whistles`, daysAgo(2))
    await insertMaintenanceNote(`${MARK} 50 h inspection carried out`, daysAgo(1))

    const res = await notes({ aircraftRegistration: AIRCRAFT, limit: 100 })
    const body = res.body as TechnicalNotesResponse
    const mine = body.entries.filter((entry) => entry.description.startsWith(MARK))

    expect(res.status).toBe(200)
    expect(mine.map((entry) => entry.kind)).toEqual(['MAINTENANCE_NOTE', 'REMARK', 'DEFECT'])
    expect(mine[0].performedBy).toBe('Huolto Oy')
    expect(mine[2].status).toBe('ACTIVE')
  })

  it('leaves out another aircraft’s history', async () => {
    await insertRemark(OTHER_AIRCRAFT_FLIGHT, `${MARK} on the other aircraft`)

    const body = (await notes({ aircraftRegistration: AIRCRAFT, limit: 100 }))
      .body as TechnicalNotesResponse

    expect(
      body.entries.some((entry) => entry.description === `${MARK} on the other aircraft`),
    ).toBe(false)
  })

  it('caps the feed at the requested number of most recent entries', async () => {
    await insertRemark(FLIGHTS[0], `${MARK} one`, daysAgo(3))
    await insertRemark(FLIGHTS[1], `${MARK} two`, daysAgo(2))
    const newest = await insertRemark(FLIGHTS[2], `${MARK} three`, new Date())

    const all = (await notes({ aircraftRegistration: AIRCRAFT, limit: 100 }))
      .body as TechnicalNotesResponse
    const capped = (await notes({ aircraftRegistration: AIRCRAFT, limit: 2 }))
      .body as TechnicalNotesResponse

    // Compared against the uncapped feed rather than against a literal list:
    // this aircraft also carries whatever the seeded test data put on it, and
    // the assertion worth making is that the cap keeps the newest, in order.
    expect(capped.entries).toEqual(all.entries.slice(0, 2))
    expect(capped.entries).toHaveLength(2)
    expect(capped.entries[0].findingId).toBe(newest)
  })

  it('rejects a request that names no aircraft', async () => {
    const res = await notes({ limit: 5 })

    expect(res.status).toBe(400)
  })
})
