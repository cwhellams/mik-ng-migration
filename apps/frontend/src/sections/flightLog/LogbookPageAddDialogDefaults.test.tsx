import type { AircraftJourneyLogBook } from '@mik/contracts/ajlb'
import type { FlightLogListResponse } from '@mik/contracts/flight-log'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { signInAs } from '../../test/auth'
import { ALL_PERMISSIONS, anAdmin, aRoleWithPermissions } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import FlightLogsList from './LogbookPage'

const AIRCRAFT = 'OH-STL'

const anAjlb = (overrides: Partial<AircraftJourneyLogBook> = {}): AircraftJourneyLogBook =>
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
      // 355h 1min -- a distinctive value that's easy to tell apart from both
      // 0 (the old accidental default) and any single flight's own total.
      unverifiedTotalFlightMins: 355 * 60 + 1,
      validatedTotalLandings: 0,
      totalLandings: 0,
    },
    ...overrides,
  }) as unknown as AircraftJourneyLogBook

const emptyFlightLogResponse: FlightLogListResponse = {
  logs: [],
  page: 35,
  pageItemRows: [],
  pageStartFlightMins: 355 * 60 + 1,
}

const stubLogbookApis = (ajlb: AircraftJourneyLogBook, flightLogs = emptyFlightLogResponse) => {
  server.use(
    http.get(apiUrl('v1/ajlb/:registration/:seqNo'), () => HttpResponse.json(ajlb)),
    http.get(apiUrl('v1/flight-logs'), () => HttpResponse.json(flightLogs)),
    http.get(apiUrl('v1/maintenance-notes'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/defects'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/aircraft-hil'), () => HttpResponse.json([])),
  )
}

const renderLogbookPage = () =>
  renderWithProviders(<FlightLogsList />, {
    route: `/logs/books/${AIRCRAFT}/1`,
    path: '/logs/books/:aircraftRegistration/:ajlbSeqNo',
    sudo: true,
  })

describe('LogbookPage add-note/add-defect default flight time', () => {
  it('defaults the "Report defect" time to the ajlb\'s current running total, not the page\'s (empty) flight list', async () => {
    stubLogbookApis(anAjlb())
    signInAs(anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] }))

    const { user } = renderLogbookPage()

    await user.click(await screen.findByRole('button', { name: /Report defect/i }))

    expect(await screen.findByLabelText('Hours')).toHaveValue(355)
    expect(screen.getByLabelText('Minutes')).toHaveValue(1)
  })

  it('defaults the "Add maintenance note" time to the same running total', async () => {
    stubLogbookApis(anAjlb())
    signInAs(anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] }))

    const { user } = renderLogbookPage()

    await user.click(await screen.findByRole('button', { name: /Add Maintenance Note/i }))

    expect(await screen.findByLabelText('Hours')).toHaveValue(355)
    expect(screen.getByLabelText('Minutes')).toHaveValue(1)
  })
})
