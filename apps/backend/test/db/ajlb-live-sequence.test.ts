import 'dotenv/config'

import { getFlightLogs } from '../../src/db/flight-log-queries.ts'
import {
  createMaintenanceNote,
  deleteMaintenanceNote,
} from '../../src/db/maintenance-note-queries.ts'
import { createDefect } from '../../src/db/defect-queries.ts'
import { db } from '../../src/db/connection.ts'

// OH-STL/3 (test data): rows_per_page = 5, no validated flights yet (baseline
// = start_flight_mins = 700000), 43 NEW flights. Pages step by 2 starting at
// start_page = 500. Page 500's first five flights, in chronological order,
// have ac_total_flight_mins: 700060, 700150, 700240, 700360, 700405.
const AIRCRAFT = 'OH-STL'
const AJLB_SEQ_NO = 3

describe('flight.vw_ajlb_live_sequence pagination reflow', () => {
  it('spills the excess flight onto the next page when a rows > 0 note is anchored mid-page', async () => {
    const before = await getFlightLogs({
      aircraftRegistration: AIRCRAFT,
      ajlbSeqNo: AJLB_SEQ_NO,
      page: 500,
    })
    expect(before.logs.map((l) => l.ajlbRowNo)).toEqual([1, 2, 3, 4, 5])
    const fifthFlightId = before.logs[4].flightId

    const note = await createMaintenanceNote(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Reflow test note',
        performedBy: 'Mechanic',
        flightMins: 700300, // anchors after the 4th flight (700240 < 700300 <= 700360)
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )

    try {
      const afterPage500 = await getFlightLogs({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        page: 500,
      })
      // The note now occupies row 5, pushing the 5th flight onto page 502.
      expect(afterPage500.logs.map((l) => l.ajlbRowNo)).toEqual([1, 2, 3, 4])
      expect(afterPage500.logs.some((l) => l.flightId === fifthFlightId)).toBe(false)

      const afterPage502 = await getFlightLogs({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        page: 502,
      })
      expect(afterPage502.logs[0].flightId).toBe(fifthFlightId)
      expect(afterPage502.logs[0].ajlbRowNo).toBe(1)
    } finally {
      await deleteMaintenanceNote(note.noteId)
    }
  })

  it('does not shift any flight row/page when the anchored item has rows: 0', async () => {
    const before = await getFlightLogs({
      aircraftRegistration: AIRCRAFT,
      ajlbSeqNo: AJLB_SEQ_NO,
      page: 500,
    })
    expect(before.logs.map((l) => l.ajlbRowNo)).toEqual([1, 2, 3, 4, 5])

    const defect = await createDefect(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Inline reflow test defect',
        flightMins: 700300,
        rows: 0,
        blankRowsAfter: 0,
      },
      'Matti1',
    )

    try {
      const after = await getFlightLogs({
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        page: 500,
      })
      expect(after.logs.map((l) => l.ajlbRowNo)).toEqual([1, 2, 3, 4, 5])
      expect(after.logs.map((l) => l.flightId)).toEqual(before.logs.map((l) => l.flightId))
    } finally {
      await db.deleteFrom('flight.defect').where('defect_id', '=', defect.defectId).execute()
    }
  })

  it('orders multiple items anchored to the same flight by flightMins then createdAt', async () => {
    const later = await createMaintenanceNote(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'Second note, later flightMins',
        performedBy: 'Mechanic',
        flightMins: 700310,
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )
    const earlier = await createMaintenanceNote(
      {
        aircraftRegistration: AIRCRAFT,
        ajlbSeqNo: AJLB_SEQ_NO,
        description: 'First note, earlier flightMins',
        performedBy: 'Mechanic',
        flightMins: 700300,
        rows: 1,
        blankRowsAfter: 0,
      },
      'Matti1',
    )

    try {
      const rows = await db
        .selectFrom('flight.vw_ajlb_live_sequence')
        .select(['item_type', 'item_id', 'ajlb_row_number'])
        .where('aircraft_registration', '=', AIRCRAFT)
        .where('ajlb_seq_no', '=', AJLB_SEQ_NO)
        .where('item_id', 'in', [earlier.noteId, later.noteId])
        .orderBy('ajlb_row_number', 'asc')
        .execute()

      expect(rows.map((r) => r.item_id)).toEqual([earlier.noteId, later.noteId])
    } finally {
      await deleteMaintenanceNote(earlier.noteId)
      await deleteMaintenanceNote(later.noteId)
    }
  })
})
