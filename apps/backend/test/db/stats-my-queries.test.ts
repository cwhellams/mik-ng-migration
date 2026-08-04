import 'dotenv/config'

import { sql } from 'kysely'
import { db } from '../../src/db/connection.ts'
import { getMyStatistics } from '../../src/db/stats-queries.ts'

// Baseline test data: Pekka1 is PIC on 201 OH-STL flights spanning 2010-01-01..2025-03-03,
// all EFHK–EFHK.
const MEMBER_ID = 'Pekka1'

describe('stats-queries: getMyStatistics', () => {
  it('returns all-time totals for the member when no range is given', async () => {
    const result = await getMyStatistics({ memberId: MEMBER_ID })

    // number_of_landings is randomized per row in the mass test data fixture,
    // so the expected total can't be a fixed literal — derive it the same way
    // getMyStatistics does, straight from the source rows.
    const landingsRow = await sql<{ total_landings: number }>`
      SELECT COALESCE(SUM(number_of_landings), 0)::int AS total_landings
      FROM flight.logs
      WHERE pic_member_id = ${MEMBER_ID}
    `.execute(db)
    const expectedTotalLandings = Number(landingsRow.rows[0]?.total_landings ?? 0)

    expect(result.totals).toEqual({
      flightCount: 201,
      totalFlightMins: 21190,
      totalBlockMins: 23232,
      totalLandings: expectedTotalLandings,
      uniqueAirports: 1,
    })
  })

  it('scopes totals to the requested date range', async () => {
    const result = await getMyStatistics({
      memberId: MEMBER_ID,
      date_from: '2010-01-01',
      date_to: '2010-01-31',
    })

    expect(result.totals.flightCount).toBe(37)
    expect(result.totals.totalFlightMins).toBe(888)
    expect(result.daily.every((d) => d.date >= '2010-01-01' && d.date <= '2010-01-31')).toBe(true)
    expect(result.monthly).toEqual([{ yr: 2010, mth: 1, flightMins: 888 }])
  })

  it('filters by aircraft registration', async () => {
    const matching = await getMyStatistics({
      memberId: MEMBER_ID,
      aircraft_registration: 'OH-STL',
    })
    expect(matching.totals.flightCount).toBe(201)

    const nonMatching = await getMyStatistics({
      memberId: MEMBER_ID,
      aircraft_registration: 'OH-IHQ',
    })
    expect(nonMatching.totals.flightCount).toBe(0)
    expect(nonMatching.daily).toEqual([])
    expect(nonMatching.monthly).toEqual([])
  })

  it('returns a daily series that is sorted and sums to the total', async () => {
    const result = await getMyStatistics({ memberId: MEMBER_ID })

    const dates = result.daily.map((d) => d.date)
    expect([...dates].sort()).toEqual(dates)
    expect(result.daily.reduce((sum, d) => sum + d.flightMins, 0)).toBe(
      result.totals.totalFlightMins,
    )
  })

  it('rolls the daily series up into a sorted monthly series', async () => {
    const result = await getMyStatistics({ memberId: MEMBER_ID })

    const keys = result.monthly.map((m) => `${m.yr}-${String(m.mth).padStart(2, '0')}`)
    expect([...keys].sort()).toEqual(keys)
    expect(new Set(keys).size).toBe(keys.length)
    expect(result.monthly.reduce((sum, m) => sum + m.flightMins, 0)).toBe(
      result.totals.totalFlightMins,
    )
  })

  it('returns zeroed totals for a member with no flights', async () => {
    const result = await getMyStatistics({ memberId: 'no-such-member' })

    expect(result).toEqual({
      totals: {
        flightCount: 0,
        totalFlightMins: 0,
        totalBlockMins: 0,
        totalLandings: 0,
        uniqueAirports: 0,
      },
      daily: [],
      monthly: [],
    })
  })
})
