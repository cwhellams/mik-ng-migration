import { describe, expect, it } from 'vitest'
import type { FlightLogListEntry, PageItemRow } from '@backend/routes/flight-log/models'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'
import type { Defect } from '@backend/routes/defects/models'
import { buildLogbookRows, buildInlineItems } from './LogbookPage'

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

const makeItemRow = (overrides: Partial<PageItemRow>): PageItemRow => ({
  rowNumber: 1,
  itemType: 'note',
  itemId: 'note1',
  isContentRow: true,
  ...overrides,
})

const byId = <T extends { [key: string]: unknown }>(
  items: T[],
  idKey: keyof T,
): Record<string, T> => Object.fromEntries(items.map((item) => [item[idKey] as string, item]))

describe('buildInlineItems', () => {
  it('merges notes and defects sorted by flightMins, then createdAt as a tie-break', () => {
    const noteB = makeNote({ flightMins: 100, rows: 0, createdAt: '2026-01-02T00:00:00.000Z' })
    const defectA = makeDefect({ flightMins: 100, rows: 0, createdAt: '2026-01-01T00:00:00.000Z' })
    const noteC = makeNote({ flightMins: 200, rows: 0 })

    const items = buildInlineItems([noteB, noteC], [defectA])

    expect(items.map((i) => (i.kind === 'note' ? i.note.noteId : i.defect.defectId))).toEqual([
      defectA.defectId, // same flightMins as noteB, but earlier createdAt
      noteB.noteId,
      noteC.noteId,
    ])
  })

  it('excludes own-row (rows > 0) items -- those come from pageItemRows instead', () => {
    const ownRowNote = makeNote({ flightMins: 100, rows: 1 })
    const inlineDefect = makeDefect({ flightMins: 100, rows: 0 })

    const items = buildInlineItems([ownRowNote], [inlineDefect])

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('defect')
  })
})

describe('buildLogbookRows', () => {
  it('pads an empty page with blank rows when there are no flights or items', () => {
    const rows = buildLogbookRows(undefined, [], [], {}, {}, 5, null)
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.isEmptyRow && r.log === null)).toBe(true)
  })

  it('places an own-row item at the exact row number the server assigned', () => {
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
      makeLog({ ajlbRowNo: 4, acTotalFlightMins: 400 }),
    ]
    const note = makeNote({ rows: 1 })
    const pageItemRows = [makeItemRow({ rowNumber: 3, itemType: 'note', itemId: note.noteId })]

    const rows = buildLogbookRows(logs, pageItemRows, [], byId([note], 'noteId'), {}, 5, null)

    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => !r.isEmptyRow && r.log && !r.isNoteRow)).toHaveLength(3)
    expect(rows.filter((r) => r.isNoteRow)).toHaveLength(1)
    const noteIdx = rows.findIndex((r) => r.isNoteRow)
    expect(rows[noteIdx - 1].log?.ajlbRowNo).toBe(2)
    expect(rows[noteIdx + 1].log?.ajlbRowNo).toBe(4)
  })

  it('does not insert a row for a rows: 0 item -- it is bucketed onto the anchor flight instead', () => {
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
    ]
    const defect = makeDefect({ flightMins: 100, rows: 0, blankRowsAfter: 0 })
    const inlineItems = buildInlineItems([], [defect])

    const rows = buildLogbookRows(logs, [], inlineItems, {}, {}, 5, null)

    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => r.isDefectRow)).toHaveLength(0)
    const flightRow = rows.find((r) => r.log?.ajlbRowNo === 1 && !r.isEmptyRow)
    expect(flightRow?.inlineItems).toHaveLength(1)
    expect(flightRow?.inlineItems[0].kind).toBe('defect')
  })

  it('renders a rows > 1 item as one content row plus continuation blank rows, per pageItemRows', () => {
    const logs = [makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 })]
    const note = makeNote({ rows: 3 })
    const pageItemRows = [
      makeItemRow({ rowNumber: 2, itemType: 'note', itemId: note.noteId, isContentRow: true }),
      makeItemRow({ rowNumber: 3, itemType: 'note', itemId: note.noteId, isContentRow: false }),
      makeItemRow({ rowNumber: 4, itemType: 'note', itemId: note.noteId, isContentRow: false }),
    ]

    const rows = buildLogbookRows(logs, pageItemRows, [], byId([note], 'noteId'), {}, 6, null)

    expect(rows).toHaveLength(6)
    const noteIdx = rows.findIndex((r) => r.isNoteRow)
    expect(noteIdx).toBe(1)
    expect(rows[noteIdx + 1].isNoteBlankRow).toBe(true)
    expect(rows[noteIdx + 2].isNoteBlankRow).toBe(true)
    expect(rows[noteIdx + 3].isNoteBlankRow).toBe(false) // back to a plain trailing empty row
  })

  it('renders an item that starts on this page but continues onto the next as content plus blank rows, never overflowing pageSize', () => {
    // Mirrors the real bug: a defect (rows: 2, blankRowsAfter: 4) anchored right
    // after the page's last flight only has room for its content row plus 3
    // continuation/blankRowsAfter rows before the page is full -- the server
    // (flight.vw_ajlb_live_rows) is the one deciding this split, and this test
    // just confirms buildLogbookRows renders exactly what it's told, never more.
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
    ]
    const defect = makeDefect({ rows: 2, blankRowsAfter: 4 })
    const pageItemRows = [
      makeItemRow({
        rowNumber: 3,
        itemType: 'defect',
        itemId: defect.defectId,
        isContentRow: true,
      }),
      makeItemRow({
        rowNumber: 4,
        itemType: 'defect',
        itemId: defect.defectId,
        isContentRow: false,
      }),
      makeItemRow({
        rowNumber: 5,
        itemType: 'defect',
        itemId: defect.defectId,
        isContentRow: false,
      }),
    ]

    const rows = buildLogbookRows(logs, pageItemRows, [], {}, byId([defect], 'defectId'), 5, null)

    expect(rows).toHaveLength(5) // never overflows pageSize
    expect(rows.filter((r) => r.isDefectRow)).toHaveLength(1)
    expect(rows.filter((r) => r.isDefectBlankRow)).toHaveLength(2)
  })

  it('renders the continuation of an item that started on the previous page as blank rows at the top', () => {
    // The item's content row already rendered on the previous page -- this
    // page only gets its remaining continuation/blankRowsAfter rows, still
    // correctly identified by pageItemRows even with no flight preceding them.
    const logs = [makeLog({ ajlbRowNo: 3, acTotalFlightMins: 300 })]
    const defect = makeDefect({ rows: 2, blankRowsAfter: 4 })
    const pageItemRows = [
      makeItemRow({
        rowNumber: 1,
        itemType: 'defect',
        itemId: defect.defectId,
        isContentRow: false,
      }),
      makeItemRow({
        rowNumber: 2,
        itemType: 'defect',
        itemId: defect.defectId,
        isContentRow: false,
      }),
    ]

    const rows = buildLogbookRows(logs, pageItemRows, [], {}, byId([defect], 'defectId'), 5, 299)

    expect(rows[0].isDefectBlankRow).toBe(true)
    expect(rows[1].isDefectBlankRow).toBe(true)
    expect(rows[2].log?.ajlbRowNo).toBe(3)
    expect(rows.filter((r) => r.isDefectRow)).toHaveLength(0) // content row isn't repeated here
  })

  it('renders an own-row item as the very first row when the page has no flights yet', () => {
    const note = makeNote({ rows: 1 })
    const pageItemRows = [makeItemRow({ rowNumber: 1, itemType: 'note', itemId: note.noteId })]

    const rows = buildLogbookRows([], pageItemRows, [], byId([note], 'noteId'), {}, 5, null)

    expect(rows).toHaveLength(5)
    expect(rows[0].isNoteRow).toBe(true)
    expect(rows[0].log).toBeNull()
  })

  it('attaches a genuinely blank row to the next upcoming flight for admin edit actions', () => {
    const logs = [makeLog({ ajlbRowNo: 3, acTotalFlightMins: 300 })]

    const rows = buildLogbookRows(logs, [], [], {}, {}, 5, null)

    expect(rows[0].isEmptyRow).toBe(true)
    expect(rows[0].hasEditActions).toBe(true)
    expect(rows[0].log?.ajlbRowNo).toBe(3)
    expect(rows[1].hasEditActions).toBe(true)
    expect(rows[1].log?.ajlbRowNo).toBe(3)
    // Trailing padding after the last flight has no "next flight" and no action.
    expect(rows[4].hasEditActions).toBe(false)
    expect(rows[4].log).toBeNull()
  })

  it('does not re-insert items positioned on an earlier page (pageStartFlightMins bleed guard)', () => {
    const logs = [makeLog({ ajlbRowNo: 1, acTotalFlightMins: 200 })]
    // This item's flightMins falls before this page's starting total, so it
    // belongs to a previous page and must not be inserted here again.
    const defect = makeDefect({ flightMins: 50, rows: 0, blankRowsAfter: 0 })
    const inlineItems = buildInlineItems([], [defect])

    const rows = buildLogbookRows(logs, [], inlineItems, {}, {}, 5, 100)

    expect(rows.every((r) => r.inlineItems.length === 0)).toBe(true)
  })

  it('merges an inline item anchored past the last flight onto that flight rather than dropping it', () => {
    const logs = [
      makeLog({ ajlbRowNo: 1, acTotalFlightMins: 100 }),
      makeLog({ ajlbRowNo: 2, acTotalFlightMins: 200 }),
    ]
    // flightMins is past every flight currently loaded on this page.
    const defect = makeDefect({ flightMins: 250, rows: 0, blankRowsAfter: 0 })
    const inlineItems = buildInlineItems([], [defect])

    const rows = buildLogbookRows(logs, [], inlineItems, {}, {}, 5, null)

    const lastFlightRow = rows.find((r) => r.log?.ajlbRowNo === 2 && !r.isEmptyRow)
    expect(lastFlightRow?.inlineItems).toHaveLength(1)
  })

  it('renders an inline item with no flight on the page at all as a standalone row instead of dropping it', () => {
    const defect = makeDefect({ flightMins: 100, rows: 0, blankRowsAfter: 0 })
    const inlineItems = buildInlineItems([], [defect])

    const rows = buildLogbookRows([], [], inlineItems, {}, {}, 5, null)

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
    const inlineItems = buildInlineItems([], [defect])

    const rows = buildLogbookRows([anchorFlight, otherFlight], [], inlineItems, {}, {}, 5, null)

    const anchorRow = rows.find((r) => r.log?.flightId === anchorFlight.flightId && !r.isEmptyRow)
    const otherRow = rows.find((r) => r.log?.flightId === otherFlight.flightId && !r.isEmptyRow)
    expect(anchorRow?.inlineItems).toHaveLength(1)
    expect(otherRow?.inlineItems).toHaveLength(0)
  })
})
