import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { hasBlankReportedDefect, submitReportedDefects } from './reportDefectsApi'

const FLIGHT_ID = 'fi_inst1'

/** Only the fields submitReportedDefects reads off the fetched flight. */
const aFlight = (overrides: Record<string, unknown> = {}) => ({
  flightId: FLIGHT_ID,
  aircraftRegistration: 'OH-STL',
  ajlbSeqNo: 1,
  acTotalFlightTime: '355:01',
  offBlockTimeUtc: '2026-03-14T08:00:00.000Z',
  ...overrides,
})

const flightLogApi = (flight = aFlight()) => {
  const posted: unknown[] = []
  server.use(
    http.get(apiUrl(`v1/flight-logs/${FLIGHT_ID}`), () => HttpResponse.json(flight)),
    http.post(apiUrl('v1/defects'), async ({ request }) => {
      posted.push(await request.json())
      return HttpResponse.json({}, { status: 201 })
    }),
  )
  return posted
}

describe('hasBlankReportedDefect', () => {
  it('is false for untouched and filled-in rows', () => {
    expect(hasBlankReportedDefect(['', 'Nose wheel shimmy'])).toBe(false)
  })

  it('is true for a row that is only whitespace', () => {
    expect(hasBlankReportedDefect(['   '])).toBe(true)
  })
})

describe('submitReportedDefects', () => {
  it('dates each defect to the day of the flight it was found on, not today', async () => {
    // #1254: a flight logged days after it happened must not stamp its defects with
    // the day the entry was typed up.
    const posted = flightLogApi()

    await submitReportedDefects(FLIGHT_ID, ['Nose wheel shimmy on landing'])

    expect(posted).toEqual([
      {
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 1,
        flightId: FLIGHT_ID,
        description: 'Nose wheel shimmy on landing',
        flightMins: 355 * 60 + 1,
        recordedOn: '2026-03-14',
        rows: 0,
      },
    ])
  })

  it('uses the flight day in the club timezone, not the UTC one', async () => {
    // 23:30 UTC on the 14th is already the 15th in Helsinki, and the flight belongs
    // to the day the crew flew it.
    const posted = flightLogApi(aFlight({ offBlockTimeUtc: '2026-03-14T23:30:00.000Z' }))

    await submitReportedDefects(FLIGHT_ID, ['Nose wheel shimmy on landing'])

    expect(posted).toMatchObject([{ recordedOn: '2026-03-15' }])
  })

  it('posts one defect per non-blank, trimmed description', async () => {
    const posted = flightLogApi()

    await submitReportedDefects(FLIGHT_ID, ['  Nose wheel shimmy  ', '', '   '])

    expect(posted).toMatchObject([{ description: 'Nose wheel shimmy' }])
  })

  it('does nothing when every description is blank', async () => {
    const posted = flightLogApi()

    await submitReportedDefects(FLIGHT_ID, ['', '  '])

    expect(posted).toHaveLength(0)
  })
})
