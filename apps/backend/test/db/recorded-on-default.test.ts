import 'dotenv/config'

import { describe, expect, it } from '@jest/globals'
import { sql } from 'kysely'

import { db } from '../../src/db/connection.ts'

/**
 * `flight.maintenance_note.recorded_on` and `flight.defect.recorded_on` carry a DEFAULT,
 * and it has to mean the same thing as the value the application sends (#1254): the
 * club's Helsinki calendar date.
 *
 * `CURRENT_DATE` does not, and that is the trap this guards (#1288 review). It reads the
 * *session's* timezone, which the pool pins to UTC (`db/connection.ts`), so it rolls over
 * at 02:00/03:00 Helsinki — an insert that fell back to the default late on an evening
 * would file the entry under tomorrow. Nothing in the app relies on the default today, so
 * a regression here would be invisible until some future ad-hoc SQL or a forgotten field
 * quietly wrote the wrong logbook date.
 *
 * Each case inserts under a deliberately extreme session timezone and asserts the row
 * lands on Helsinki's date anyway. Kiritimati (UTC+14) and Midway (UTC-11) are 25 hours
 * apart, so whatever the hour, at least one of them is on a different calendar day from
 * Helsinki — asserted, so the test can never pass by the two happening to agree.
 */
const EXTREME_ZONES = ['Pacific/Kiritimati', 'Pacific/Midway'] as const

/** Thrown to roll the probe row back; the row itself is never wanted. */
class Rollback extends Error {}

interface Probe {
  recordedOn: string
  sessionToday: string
  helsinkiToday: string
}

/**
 * Inserts a row omitting `recorded_on` under `zone`, and reports what the column default
 * produced alongside the two dates it could have been. Always rolled back.
 */
const probeDefault = async (table: 'maintenance_note' | 'defect', zone: string): Promise<Probe> => {
  let probe: Probe | undefined

  // The only columns either table needs beyond recorded_on; both hang off OH-STL's
  // third journey log book, which the seed data always has.
  const insert =
    table === 'maintenance_note'
      ? sql<Probe>`
          insert into flight.maintenance_note
            (aircraft_registration, ajlb_seq_no, description, performed_by, flight_mins,
             created_by, updated_by)
          values ('OH-STL', 3, 'recorded_on default probe', 'AME', 0, 'k1mnimda', 'k1mnimda')
          returning recorded_on,
                    current_date as session_today,
                    (now() at time zone 'Europe/Helsinki')::date as helsinki_today`
      : sql<Probe>`
          insert into flight.defect
            (aircraft_registration, ajlb_seq_no, description, flight_mins,
             created_by, updated_by)
          values ('OH-STL', 3, 'recorded_on default probe', 0, 'k1mnimda', 'k1mnimda')
          returning recorded_on,
                    current_date as session_today,
                    (now() at time zone 'Europe/Helsinki')::date as helsinki_today`

  try {
    await db.transaction().execute(async (trx) => {
      // Transaction-scoped (the third argument), so the pooled connection goes back to
      // the pool's own `-c timezone=UTC` regardless of how this transaction ends.
      await sql`select set_config('timezone', ${zone}, true)`.execute(trx)
      const { rows } = await insert.execute(trx)
      probe = rows[0]
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  if (!probe) throw new Error(`No row returned for ${table} under ${zone}`)
  return probe
}

describe('recorded_on column default', () => {
  it.each(['maintenance_note', 'defect'] as const)(
    'files a %s under Helsinki’s date, not the session timezone’s',
    async (table) => {
      const probes = await Promise.all(EXTREME_ZONES.map((zone) => probeDefault(table, zone)))

      for (const probe of probes) {
        expect(probe.recordedOn).toBe(probe.helsinkiToday)
      }

      // Guards the guard: if both extremes happened to agree with Helsinki, the
      // assertions above would hold for `CURRENT_DATE` too and prove nothing.
      expect(probes.map((p) => p.sessionToday)).not.toEqual(probes.map((p) => p.helsinkiToday))
    },
  )
})
