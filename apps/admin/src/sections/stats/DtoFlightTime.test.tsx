import type { DtoFlightTimeByAcYrMth } from '@mik/contracts/stats'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import DtoFlightTime, { dtoMonthlyBarData } from './DtoFlightTime'

const aRow = (overrides: Partial<DtoFlightTimeByAcYrMth> = {}): DtoFlightTimeByAcYrMth => ({
  aircraftRegistration: 'OH-STL',
  flightType: 'SCHOOL',
  yr: 2026,
  mth: 1,
  totalFlightMins: 120,
  totalNfMins: 0,
  totalIfrMins: 0,
  ...overrides,
})

describe('DtoFlightTime', () => {
  it('renders the chart and shows an info button that explains the calculation', async () => {
    server.use(
      http.get(apiUrl('v1/stats/dto/flight-time/aircraft/year/month'), () =>
        HttpResponse.json([aRow()]),
      ),
    )

    const { user } = renderWithProviders(<DtoFlightTime />)

    expect(await screen.findByText('OH-STL')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'DTO (Training) Flight Time' }))

    expect(screen.getByText(/Flight time logged specifically as DTO/)).toBeInTheDocument()
    // The one calculation caveat that matters most: this is air time, not
    // block time, unlike School-Flight Reservation Efficiency (see #1323).
    expect(screen.getByText(/uses flight\/air time, not block time/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the no-flights message when there is no DTO flight time', async () => {
    server.use(
      http.get(apiUrl('v1/stats/dto/flight-time/aircraft/year/month'), () => HttpResponse.json([])),
    )

    renderWithProviders(<DtoFlightTime />)

    expect(
      await screen.findByText('No DTO training flights recorded in the last 12 months.'),
    ).toBeInTheDocument()
  })

  // The view backing this page is grouped by flight_type as well as
  // aircraft/year/month (an aircraft can have both DTO-flagged SCHOOL and
  // DTO-flagged DTO-type flights in the same month), so a naive merge that
  // overwrites instead of accumulating would silently drop one row's hours.
  // Asserted directly against the transform rather than the rendered chart,
  // since nivo does not render bars/labels in jsdom's 0x0 test containers.
  it('sums hours across multiple flight_type rows for the same aircraft/month', () => {
    const barData = dtoMonthlyBarData([
      aRow({ flightType: 'SCHOOL', yr: 2026, mth: 1, totalFlightMins: 60 }),
      aRow({ flightType: 'DTO', yr: 2026, mth: 1, totalFlightMins: 120 }),
    ])

    const january = barData
      .find((aircraft) => aircraft.aircraft === 'OH-STL')
      ?.data.find((point) => point.month === '2026-01')

    expect(january?.hours).toBe(3)
  })
})
