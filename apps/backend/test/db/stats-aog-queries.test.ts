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
        bookingId: bookingId,
        memberId: 'k1mnimda',
        registration: 'OH-STL',
        bookingType: 'MAINTENANCE',
        bookingStatus: 'CONFIRMED',
        startTimeEpoch: Math.floor(MAINTENANCE_START.getTime() / 1000),
        endTimeEpoch: Math.floor(MAINTENANCE_END.getTime() / 1000),
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      .execute()

    const defect = await db
      .insertInto('flight.defect')
      .values({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 1,
        description: 'AOG stats test defect',
        flightMins: 0,
        status: 'RESOLVED',
        createdAt: DEFECT_CREATED,
        createdBy: 'k1mnimda',
        updatedAt: DEFECT_RESOLVED,
        updatedBy: 'k1mnimda',
      })
      .returning('defectId')
      .executeTakeFirstOrThrow()
    defectId = defect.defectId
  })

  afterAll(async () => {
    await db.deleteFrom('schedule.bookings').where('bookingId', '=', bookingId).execute()
    if (defectId) {
      await db.deleteFrom('flight.defect').where('defectId', '=', defectId).execute()
    }
  })

  it('getAogDaysByAcYrMth counts maintenance and unserviceable days separately for the month', async () => {
    const rows = await getAogDaysByAcYrMth({
      aircraftRegistration: 'OH-STL',
      yr: 2024,
      mth: 6,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].maintenanceDays).toBe(4)
    expect(rows[0].unserviceableDays).toBe(4)
    expect(rows[0].totalAogDays).toBe(8)
  })

  it('getAogDaysByAcYr totals AOG days across the year for the aircraft', async () => {
    const rows = await getAogDaysByAcYr({
      aircraftRegistration: 'OH-STL',
      yr: 2024,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].maintenanceDays).toBe(4)
    expect(rows[0].unserviceableDays).toBe(4)
    expect(rows[0].totalAogDays).toBe(8)
  })
})
