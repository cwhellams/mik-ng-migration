import { describe, expect, it } from 'vitest'
import type { FlightLogListEntry } from '@backend/routes/flight-log/models'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'
import type { Defect } from '@backend/routes/defects/models'
import { buildLogbookRows, buildInsertItems } from './LogbookPage'

let logCounter = 0
const makeLog = (overrides: Partial<FlightLogListEntry>): FlightLogListEntry => {
  logCounter++
  return {
    acTotalFlightTime: '00:00',
    acTotalLandings: null,
    aircraftRegistration: 'OH-STL',
    ajlbBlankRowsBefore: 0,
    ajlbSeqNo: 1,
    ajlbRowNo: logCounter,
    arrivalAirport: 'EFHF',
    billableMemberId: 'Matti1',
    blockMins: 60,
    blockTime: '1:00',
    crew2LastName: null,
    departureAirport: 'EFHF',
    flightId: `flight${logCounter}`,
    flightMins: 60,
    flightTime: '1:00',
    flightType: 'LOCAL',
    fuelRemainingLitres: 50,
    fuelUpliftLitres: null,
    incidentOrObservations: null,
    instrumentFlyingMins: 0,
    isBillableFlight: true,
    isBilled: false,
    invoiceNumber: null,
    minBillableExceptionReason: null,
    nightFlyingMins: 0,
    numberOfLandings: 1,
    numberOfNightLandings: 0,
    oilUpliftLitres: null,
    offBlockTimeUtc: '2026-01-01T10:00:00.000Z',
    takeoffTimeUtc: '2026-01-01T10:05:00.000Z',
    landingTimeUtc: '2026-01-01T10:55:00.000Z',
    onBlockTimeUtc: '2026-01-01T11:00:00.000Z',
    personsOnBoard: 1,
    picLastName: 'Virtanen',
    status: 'NEW',
    totalTimeInService: null,
    acTotalFlightMins: 0,
    creditedMins: null,
    estimatedCost: null,
    isTrainingProgramPilot: null,
    ...overrides,
  } as FlightLogListEntry
}

let noteCounter = 0
const makeNote = (overrides: Partial<MaintenanceNote>): MaintenanceNote => {
  noteCounter++
  return {
    noteId: `note${noteCounter}`,
    aircraftRegistration: 'OH-STL',
    ajlbSeqNo: 1,
    description: 'Test note',
    performedBy: 'AME',
    flightMins: 0,
    rows: 1,
    blankRowsAfter: 0,
    createdAt: `2026-01-01T00:00:0${noteCounter}.000Z`,
    createdBy: 'Matti1',
    ...overrides,
  }
}

let defectCounter = 0
const makeDefect = (overrides: Partial<Defect>): Defect => {
  defectCounter++
  return {
    defectId: `defect${defectCounter}`,
    aircraftRegistration: 'OH-STL',
    ajlbSeqNo: 1,
    flightId: null,
    description: 'Test defect',
    flightMins: 0,
    rows: 1,
    blankRowsAfter: 0,
    status: 'ACTIVE',
    hilId: null,
    resolvedNoteId: null,
    createdAt: `2026-01-01T00:00:0${defectCounter}.000Z`,
    createdBy: 'Matti1',
    updatedAt: `2026-01-01T00:00:0${defectCounter}.000Z`,
    updatedBy: 'Matti1',
    ...overrides,
  }
}

describe('buildInsertItems', () => {
  it('merges notes and defects sorted by flightMins, then createdAt as a tie-break', () => {
    const noteB = makeNote({ flightMins: 100, createdAt: '2026-01-02T00:00:00.000Z' })
    const defectA = makeDefect({ flightMins: 100, createdAt: '2026-01-01T00:00:00.000Z' })
    const noteC = makeNote({ flightMins: 200 })

    const items = buildInsertItems([noteB, noteC], [defectA])

    expect(items.map((i) => (i.kind === 'note' ? i.note.noteId : i.defect.defectId))).toEqual([
      defectA.defectId, // same flightMins as noteB, but earlier createdAt
      noteB.noteId,
      noteC.noteId,
    ])
  })
})

describe('buildLogbookRows', () => {
  it('pads an empty page with blank rows when there are no flights or items', () => {
    const rows = buildLogbookRows(undefined, [], [], 5, null)
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.isEmptyRow && r.log === null)).toBe(true)
  })

  it('keeps a full page at exactly pageSize rows when an own-row item is anchored mid-page', () => {
    // 5 flights at ac_total_flight_mins 100..500, ajlbRowNo already reflects
    // the server-side reflow: a rows=1 item anchored after flight 3 (mins 300)
    // pushes flight 5 to ajlbRowNo 6, i.e. off this page.
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
      makeLog({ ajlbRowNo: 3, acTotalFlightMins: 300 }),
      makeLog({ ajlbRowNo: 4, acTotalFlightMins: 400 }),
    ]
    const note = makeNote({ flightMins: 300, rows: 1, blankRowsAfter: 0 })

    const rows = buildLogbookRows(logs, [buildInsertItems([note], [])[0]], [], 5, null)

    // 4 flight rows + 1 note row = 5, no overflow past pageSize and no
    // trailing item left dangling.
    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => !r.isEmptyRow && r.log && !r.isNoteRow)).toHaveLength(4)
    expect(rows.filter((r) => r.isNoteRow)).toHaveLength(1)
    // The note row comes immediately after the 3rd flight (its anchor).
    const noteIdx = rows.findIndex((r) => r.isNoteRow)
    expect(rows[noteIdx - 1].log?.ajlbRowNo).toBe(3)
    expect(rows[noteIdx + 1].log?.ajlbRowNo).toBe(4)
  })

  it('does not insert a row for a rows: 0 item -- it is bucketed onto the anchor flight instead', () => {
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
    ]
    const defect = makeDefect({ flightMins: 100, rows: 0, blankRowsAfter: 0 })
    const items = buildInsertItems([], [defect])
    const ownRowItems = items.filter((i) => i.rows > 0)
    const inlineItems = items.filter((i) => i.rows === 0)

    const rows = buildLogbookRows(logs, ownRowItems, inlineItems, 5, null)

    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => r.isDefectRow)).toHaveLength(0)
    const flightRow = rows.find((r) => r.log?.ajlbRowNo === 1 && !r.isEmptyRow)
    expect(flightRow?.inlineItems).toHaveLength(1)
    expect(flightRow?.inlineItems[0].kind).toBe('defect')
  })

  it('renders a rows > 1 item as one marker row plus continuation blank rows', () => {
    const logs = [makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 })]
    const note = makeNote({ flightMins: 100, rows: 3, blankRowsAfter: 0 })
    const items = buildInsertItems([note], [])

    const rows = buildLogbookRows(logs, items, [], 6, null)

    expect(rows).toHaveLength(6)
    const noteIdx = rows.findIndex((r) => r.isNoteRow)
    expect(noteIdx).toBeGreaterThanOrEqual(0)
    expect(rows[noteIdx + 1].isNoteBlankRow).toBe(true)
    expect(rows[noteIdx + 2].isNoteBlankRow).toBe(true)
    expect(rows[noteIdx + 3].isNoteBlankRow).toBe(false) // back to a plain trailing empty row
  })

  it('places trailing items anchored past the last flight, honouring blankRowsAfter', () => {
    const logs = [makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 })]
    const note = makeNote({ flightMins: 500, rows: 1, blankRowsAfter: 2 })
    const items = buildInsertItems([note], [])

    const rows = buildLogbookRows(logs, items, [], 5, null)

    expect(rows).toHaveLength(5)
    const noteIdx = rows.findIndex((r) => r.isNoteRow)
    expect(noteIdx).toBe(1) // right after the single flight row
    expect(rows[noteIdx + 1].isNoteBlankRow).toBe(true)
    expect(rows[noteIdx + 2].isNoteBlankRow).toBe(true)
  })

  it('renders an own-row item as the very first row when the page has no flights yet', () => {
    const note = makeNote({ flightMins: 100, rows: 1, blankRowsAfter: 0 })
    const items = buildInsertItems([note], [])

    const rows = buildLogbookRows([], items, [], 5, null)

    expect(rows).toHaveLength(5)
    expect(rows[0].isNoteRow).toBe(true)
    expect(rows[0].log).toBeNull()
  })

  it('anchors an item to the first flight whose total reaches its flightMins, skipping earlier flights', () => {
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 240 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 360 }), // first flight to reach 300
      makeLog({ ajlbRowNo: 3, acTotalFlightMins: 405 }),
    ]
    const note = makeNote({ flightMins: 300, rows: 1, blankRowsAfter: 0 })
    const items = buildInsertItems([note], [])

    const rows = buildLogbookRows(logs, items, [], 5, null)

    const noteIdx = rows.findIndex((r) => r.isNoteRow)
    expect(rows[noteIdx - 1].log?.ajlbRowNo).toBe(2)
    expect(rows[noteIdx + 1].log?.ajlbRowNo).toBe(3)
  })

  it("still renders an item anchored to a full page's last flight rather than dropping it", () => {
    // A page with rows_per_page = 3, already exactly full of flights. An item
    // anchored to the last flight needs a 4th row -- the server's sequence
    // wraps that onto the next page, but the next page's bleed guard
    // (pageStartFlightMins) is keyed to the last FLIGHT's total, not to
    // items already rendered after it, so an item left off here would never
    // be picked up there either and would vanish permanently. Rendering it
    // here (extending the page by one row) is a bounded, visible imperfection
    // instead of silent data loss.
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
      makeLog({ ajlbRowNo: 3, acTotalFlightMins: 300 }),
    ]
    const note = makeNote({ flightMins: 300, rows: 1, blankRowsAfter: 0 })
    const items = buildInsertItems([note], [])

    const rows = buildLogbookRows(logs, items, [], 3, null)

    expect(rows).toHaveLength(4)
    expect(rows.some((r) => r.isNoteRow)).toBe(true)
  })

  it('clips blankRowsAfter at the page boundary instead of dropping the whole item', () => {
    // Same full-page setup, but the item also has 2 blankRowsAfter spacer
    // rows. The marker itself still renders (never dropped); the spacer rows
    // are decorative filler, so they're clipped rather than pushing the page
    // even further past pageSize.
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
      makeLog({ ajlbRowNo: 3, acTotalFlightMins: 300 }),
    ]
    const note = makeNote({ flightMins: 300, rows: 1, blankRowsAfter: 2 })
    const items = buildInsertItems([note], [])

    const rows = buildLogbookRows(logs, items, [], 3, null)

    expect(rows).toHaveLength(4)
    expect(rows.some((r) => r.isNoteRow)).toBe(true)
    expect(rows.some((r) => r.isNoteBlankRow)).toBe(false)
  })

  it('does not re-insert items positioned on an earlier page (pageStartFlightMins bleed guard)', () => {
    const logs = [makeLog({ ajlbRowNo: 1, acTotalFlightMins: 200 })]
    // This item's flightMins falls before this page's starting total, so it
    // belongs to a previous page and must not be inserted here again.
    const note = makeNote({ flightMins: 50, rows: 1, blankRowsAfter: 0 })
    const items = buildInsertItems([note], [])

    const rows = buildLogbookRows(logs, items, [], 5, 100)

    expect(rows.some((r) => r.isNoteRow)).toBe(false)
  })

  it('merges an inline item anchored past the last flight onto that flight rather than dropping it', () => {
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
    ]
    // flightMins is past every flight currently loaded on this page.
    const defect = makeDefect({ flightMins: 250, rows: 0, blankRowsAfter: 0 })
    const items = buildInsertItems([], [defect])
    const inlineItems = items.filter((i) => i.rows === 0)

    const rows = buildLogbookRows(logs, [], inlineItems, 5, null)

    const lastFlightRow = rows.find((r) => r.log?.ajlbRowNo === 2 && !r.isEmptyRow)
    expect(lastFlightRow?.inlineItems).toHaveLength(1)
  })

  it('renders an inline item with no flight on the page at all as a standalone row instead of dropping it', () => {
    const defect = makeDefect({ flightMins: 100, rows: 0, blankRowsAfter: 0 })
    const items = buildInsertItems([], [defect])
    const inlineItems = items.filter((i) => i.rows === 0)

    const rows = buildLogbookRows([], [], inlineItems, 5, null)

    expect(rows.some((r) => r.isDefectRow)).toBe(true)
  })

  it('keeps an in-flight defect anchored to its flightId, immune to flightMins drift from other flights', () => {
    const anchorFlight = makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 })
    const otherFlight = makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 })
    // flightMins was captured as a snapshot at creation time and no longer
    // matches any (prevLogMins, logMins] bucket -- e.g. because an earlier
    // flight's duration was edited after the defect was created, shifting
    // every later flight's cumulative total. Position-based bucketing alone
    // would misplace or drop this defect; flightId-keying must not.
    const defect = makeDefect({
      flightId: anchorFlight.flightId,
      flightMins: 999,
      rows: 0,
      blankRowsAfter: 0,
    })
    const items = buildInsertItems([], [defect])
    const inlineItems = items.filter((i) => i.rows === 0)

    const rows = buildLogbookRows([anchorFlight, otherFlight], [], inlineItems, 5, null)

    const anchorRow = rows.find((r) => r.log?.flightId === anchorFlight.flightId && !r.isEmptyRow)
    const otherRow = rows.find((r) => r.log?.flightId === otherFlight.flightId && !r.isEmptyRow)
    expect(anchorRow?.inlineItems).toHaveLength(1)
    expect(otherRow?.inlineItems).toHaveLength(0)
  })
})
