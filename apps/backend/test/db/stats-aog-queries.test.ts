import 'dotenv/config'

import { db } from '../../src/db/connection.ts'
import { getAogDaysByAcYr, getAogDaysByAcYrMth } from '../../src/db/stats-queries.ts'

// Keep these in the same UTC calendar month so a single yr/mth filter covers both.
const MAINTENANCE_START = new Date(Date.UTC(2024, 5, 1, 6, 0, 0)) // 2024-06-01
const MAINTENANCE_END = new Date(Date.UTC(2024, 5, 4, 18, 0, 0)) // 2024-06-04 (4 calendar days)
const DEFECT_CREATED = new Date(Date.UTC(2024, 5, 10, 0, 0, 0)) // 2024-06-10
const DEFECT_RESOLVED = new Date(Date.UTC(2024, 5, 13, 0, 0, 0)) // 2024-06-13 (4 calendar days)

describe('stats-queries: AOG (Aircraft On Ground) days', () => {
  const bookingId = 'aogtest01'
  let defectId: string | undefined

  beforeAll(async () => {
    await db
      .insertInto('schedule.bookings')
      .values({
        booking_id: bookingId,
        member_id: 'k1mnimda',
        registration: 'OH-STL',
        booking_type: 'MAINTENANCE',
        booking_status: 'CONFIRMED',
        start_time_epoch: Math.floor(MAINTENANCE_START.getTime() / 1000),
        end_time_epoch: Math.floor(MAINTENANCE_END.getTime() / 1000),
        created_by: 'k1mnimda',
        updated_by: 'k1mnimda',
      })
      .execute()

    const defect = await db
      .insertInto('flight.defect')
      .values({
        aircraft_registration: 'OH-STL',
        ajlb_seq_no: 1,
        description: 'AOG stats test defect',
        flight_mins: 0,
        status: 'RESOLVED',
        created_at: DEFECT_CREATED,
        created_by: 'k1mnimda',
        updated_at: DEFECT_RESOLVED,
        updated_by: 'k1mnimda',
      })
      .returning('defect_id')
      .executeTakeFirstOrThrow()
    defectId = defect.defect_id
  })

  afterAll(async () => {
    await db.deleteFrom('schedule.bookings').where('booking_id', '=', bookingId).execute()
    if (defectId) {
      await db.deleteFrom('flight.defect').where('defect_id', '=', defectId).execute()
    }
  })

  it('getAogDaysByAcYrMth counts maintenance and unserviceable days separately for the month', async () => {
    const rows = await getAogDaysByAcYrMth({
      aircraft_registration: 'OH-STL',
      yr: 2024,
      mth: 6,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].maintenance_days).toBe(4)
    expect(rows[0].unserviceable_days).toBe(4)
    expect(rows[0].total_aog_days).toBe(8)
  })

  it('getAogDaysByAcYr totals AOG days across the year for the aircraft', async () => {
    const rows = await getAogDaysByAcYr({
      aircraft_registration: 'OH-STL',
      yr: 2024,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].maintenance_days).toBe(4)
    expect(rows[0].unserviceable_days).toBe(4)
    expect(rows[0].total_aog_days).toBe(8)
  })
})
