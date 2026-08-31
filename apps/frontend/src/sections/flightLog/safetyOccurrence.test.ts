import { describe, expect, it } from 'vitest'

import {
  buildOccurrencePrefill,
  buildSafetyDescription,
  hasNewSafetyContent,
  readOccurrencePrefill,
} from './safetyOccurrence'

/**
 * The rules behind the "was safety affected?" prompt (#1225). What decides whether a
 * pilot is asked at all lives here rather than in the two flight log forms, so both
 * ask on exactly the same grounds — and so the one field that must never trigger it,
 * `personalRemarks`, has somewhere to be proven absent.
 */
const labels = { defect: 'Defect', remark: 'Remark' }

describe('hasNewSafetyContent', () => {
  it('asks when the pilot wrote an incident or observation on a new entry', () => {
    expect(hasNewSafetyContent({ incidentOrObservations: 'Engine ran rough on climb' })).toBe(true)
  })

  it('stays quiet on an entry with nothing noted at all', () => {
    expect(hasNewSafetyContent({ incidentOrObservations: null })).toBe(false)
  })

  it('treats whitespace as nothing noted', () => {
    expect(hasNewSafetyContent({ incidentOrObservations: '   \n ' })).toBe(false)
  })

  it('asks when a defect was reported alongside the entry', () => {
    expect(hasNewSafetyContent({ reportedDefects: ['Nosewheel shimmy'] })).toBe(true)
  })

  it('asks when a remark was reported alongside the entry', () => {
    expect(hasNewSafetyContent({ reportedRemarks: ['Oil stain on the ramp'] })).toBe(true)
  })

  it('ignores blank defect and remark rows the pilot never filled in', () => {
    expect(hasNewSafetyContent({ reportedDefects: ['  '], reportedRemarks: [''] })).toBe(false)
  })

  it('does not ask again about a remark that was already on the entry before this edit', () => {
    expect(
      hasNewSafetyContent({
        incidentOrObservations: 'Engine ran rough on climb',
        previousIncidentOrObservations: 'Engine ran rough on climb',
      }),
    ).toBe(false)
  })

  it('ignores a difference in surrounding whitespace alone', () => {
    expect(
      hasNewSafetyContent({
        incidentOrObservations: '  Engine ran rough on climb ',
        previousIncidentOrObservations: 'Engine ran rough on climb',
      }),
    ).toBe(false)
  })

  it('asks when an edit changed what the remark says', () => {
    expect(
      hasNewSafetyContent({
        incidentOrObservations: 'Engine ran rough, and the alternator light flickered',
        previousIncidentOrObservations: 'Engine ran rough on climb',
      }),
    ).toBe(true)
  })

  it('asks when an edit added a remark to an entry that had none', () => {
    expect(
      hasNewSafetyContent({
        incidentOrObservations: 'Engine ran rough on climb',
        previousIncidentOrObservations: null,
      }),
    ).toBe(true)
  })

  it('asks about a defect reported while editing, even if the remark is unchanged', () => {
    expect(
      hasNewSafetyContent({
        incidentOrObservations: 'Engine ran rough on climb',
        previousIncidentOrObservations: 'Engine ran rough on climb',
        reportedDefects: ['Nosewheel shimmy'],
      }),
    ).toBe(true)
  })
})

describe('buildSafetyDescription', () => {
  it('carries the observation over as the pilot wrote it', () => {
    expect(buildSafetyDescription({ incidentOrObservations: 'Engine ran rough' }, labels)).toBe(
      'Engine ran rough',
    )
  })

  it('labels defects and remarks, which read very differently to the safety team', () => {
    expect(
      buildSafetyDescription(
        {
          incidentOrObservations: 'Engine ran rough',
          reportedDefects: ['Nosewheel shimmy'],
          reportedRemarks: ['Oil stain on the ramp'],
        },
        labels,
      ),
    ).toBe('Engine ran rough\n\nDefect: Nosewheel shimmy\n\nRemark: Oil stain on the ramp')
  })

  it('leaves no empty paragraphs behind when only defects were reported', () => {
    expect(
      buildSafetyDescription(
        { incidentOrObservations: null, reportedDefects: ['Flat spot'] },
        labels,
      ),
    ).toBe('Defect: Flat spot')
  })
})

describe('buildOccurrencePrefill', () => {
  const flight = {
    aircraftRegistration: 'OH-STL',
    departureAirport: 'EFNU',
    arrivalAirport: 'EFHK',
    offBlockTimeEpoch: '1747900800', // 2025-05-22T08:00:00Z
  }

  it('carries the flight over so the pilot never retypes it', () => {
    expect(
      buildOccurrencePrefill(
        'fl-1',
        flight,
        { incidentOrObservations: 'Engine ran rough' },
        labels,
      ),
    ).toEqual({
      sourceFlightId: 'fl-1',
      occurrenceDate: '2025-05-22T08:00:00.000Z',
      aircraftRegistration: 'OH-STL',
      departureAirport: 'EFNU',
      arrivalAirport: 'EFHK',
      description: 'Engine ran rough',
    })
  })

  it('dates the occurrence off-block — the earliest of the flight’s four times, so the pilot only ever moves it forward', () => {
    const { occurrenceDate } = buildOccurrencePrefill('fl-1', flight, {}, labels)
    expect(occurrenceDate).toBe('2025-05-22T08:00:00.000Z')
  })
})

describe('readOccurrencePrefill', () => {
  it('reads a prefill handed over by the flight log', () => {
    const prefill = buildOccurrencePrefill(
      'fl-1',
      {
        aircraftRegistration: 'OH-STL',
        departureAirport: 'EFNU',
        arrivalAirport: 'EFNU',
        offBlockTimeEpoch: '1747900800',
      },
      {},
      labels,
    )

    expect(readOccurrencePrefill({ occurrencePrefill: prefill })).toEqual(prefill)
  })

  it('ignores the list page’s own router state, which is a plain search string', () => {
    expect(readOccurrencePrefill('status=NEW')).toBeUndefined()
  })

  it('ignores an absent state', () => {
    expect(readOccurrencePrefill(null)).toBeUndefined()
    expect(readOccurrencePrefill(undefined)).toBeUndefined()
  })
})
