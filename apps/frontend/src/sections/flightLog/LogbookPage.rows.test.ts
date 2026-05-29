import { describe, expect, it } from 'vitest'
import { buildLogbookRows } from './LogbookPage'
import { FlightLogListEntry, FlightLogStatus } from '@backend/routes/flight-log/models'

const log = {
  flightId: 1,
  ajlbRowNo: 4,
  ajlbBlankRowsBefore: 2,
  status: FlightLogStatus.NEW,
} as FlightLogListEntry

describe('buildLogbookRows', () => {
  it('fills empty page with empty rows', () => {
    const rows = buildLogbookRows(undefined, 10)

    expect(rows).toHaveLength(10)
    expect(rows.every((row) => row.isEmptyRow)).toBe(true)
    expect(rows.every((row) => !row.hasEditActions)).toBe(true)
  })

  it('renders empty rows at beginning and end so page has fixed row count', () => {
    const rows = buildLogbookRows([log], 10)

    expect(rows).toHaveLength(10)
    expect(rows.slice(0, 3).every((row) => row.isEmptyRow && row.hasEditActions)).toBe(
      true
    )
    expect(rows[3]).toMatchObject({ isEmptyRow: false, log })
    expect(rows.slice(4).every((row) => row.isEmptyRow && !row.hasEditActions)).toBe(
      true
    )
  })
})
