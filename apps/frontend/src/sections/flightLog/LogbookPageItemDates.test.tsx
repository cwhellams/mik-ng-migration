import type { AircraftJourneyLogBook } from '@mik/contracts/ajlb'
import type { Defect } from '@mik/contracts/defects'
import type { FlightLogListResponse } from '@mik/contracts/flight-log'
import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { signInAs } from '../../test/auth'
import { ALL_PERMISSIONS, anAdmin, aRoleWithPermissions } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import FlightLogsList from './LogbookPage'

/**
 * The date beside an own-row maintenance note / defect in the logbook is the date
 * the work was done, not the date the row was written (#1254). It used to be
 * `createdAt`, so every fixture here deliberately gives the two different values.
 */
const AIRCRAFT = 'OH-STL'

const anAjlb = (): AircraftJourneyLogBook =>
  ({
    seqNo: 1,
    aircraftRegistration: AIRCRAFT,
    startFlightMins: 0,
    startLandings: 0,
    noOfPages: 100,
    rowsPerPage: 12,
    startPage: 1,
    startDate: '2020-01-01',
    endDate: null,
    createdAt: '2020-01-01T00:00:00.000Z',
    createdBy: 'Matti1',
    view: {
      lastPage: 35,
      newFlightsPage: 35,
      newFlightsCount: 0,
      newFlightsTime: '00:00',
      validatedFlightsCount: 0,
      validatedFlightsTime: '00:00',
      validatedBeforeUTC: null,
      verifiedTotalFlightTime: '355:01',
      unverifiedTotalFlightTime: '355:01',
      unverifiedTotalFlightMins: 355 * 60 + 1,
      validatedTotalLandings: 0,
      totalLandings: 0,
    },
  }) as unknown as AircraftJourneyLogBook

const aNote = (): MaintenanceNote => ({
  noteId: 'note-1',
  aircraftRegistration: AIRCRAFT,
  ajlbSeqNo: 1,
  description: '50 h inspection',
  performedBy: 'AME',
  flightMins: 355 * 60 + 1,
  recordedOn: '2026-03-14',
  rows: 1,
  createdAt: '2026-03-20T09:00:00.000Z',
  createdBy: 'Matti1',
})

const aDefect = (): Defect =>
  ({
    defectId: 'defect-1',
    aircraftRegistration: AIRCRAFT,
    ajlbSeqNo: 1,
    flightId: null,
    description: 'Nose wheel shimmy on landing',
    flightMins: 355 * 60 + 1,
    recordedOn: '2026-03-15',
    rows: 1,
    status: 'ACTIVE',
    hilId: null,
    resolvedNoteId: null,
    createdAt: '2026-03-21T09:00:00.000Z',
    createdBy: 'Matti1',
    updatedAt: '2026-03-21T09:00:00.000Z',
    updatedBy: 'Matti1',
  }) as unknown as Defect

const stubLogbookApis = (
  notes: MaintenanceNote[],
  defects: Defect[],
  flightLogs: FlightLogListResponse,
) => {
  server.use(
    http.get(apiUrl('v1/ajlb/:registration/:seqNo'), () => HttpResponse.json(anAjlb())),
    http.get(apiUrl('v1/flight-logs'), () => HttpResponse.json(flightLogs)),
    http.get(apiUrl('v1/maintenance-notes'), () => HttpResponse.json(notes)),
    http.get(apiUrl('v1/defects'), () => HttpResponse.json(defects)),
    http.get(apiUrl('v1/remarks'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/aircraft-hil'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/aircraft-hil/overview'), () => HttpResponse.json([])),
  )
}

const renderLogbookPage = () =>
  renderWithProviders(<FlightLogsList />, {
    route: `/logs/books/${AIRCRAFT}/1`,
    path: '/logs/books/:aircraftRegistration/:ajlbSeqNo',
    sudo: true,
  })

describe('LogbookPage own-row item dates', () => {
  it('dates a maintenance note row by when the work was done', async () => {
    stubLogbookApis([aNote()], [], {
      logs: [],
      page: 35,
      pageStartFlightMins: 355 * 60 + 1,
      pageItemRows: [{ rowNumber: 1, itemType: 'note', itemId: 'note-1', isContentRow: true }],
    })
    signInAs(anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] }))

    renderLogbookPage()

    expect(await screen.findByText('14.03.2026')).toBeInTheDocument()
    expect(screen.queryByText('20.03.2026')).toBeNull()
  })

  it('dates a defect row by when the defect was observed', async () => {
    stubLogbookApis([], [aDefect()], {
      logs: [],
      page: 35,
      pageStartFlightMins: 355 * 60 + 1,
      pageItemRows: [{ rowNumber: 1, itemType: 'defect', itemId: 'defect-1', isContentRow: true }],
    })
    signInAs(anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] }))

    renderLogbookPage()

    expect(await screen.findByText('15.03.2026')).toBeInTheDocument()
    expect(screen.queryByText('21.03.2026')).toBeNull()
  })
})
