import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import { Stats } from './Stats'

/**
 * The default view mode ('aircraft') fetches every one of these endpoints
 * unconditionally on mount — MSW's strict unhandled-request mode fails the
 * test otherwise, so every one needs a handler even where the test itself
 * only cares about one or two cards.
 */
const statsApi = () => {
  server.use(
    http.get(apiUrl('v1/stats/flight-time/aircraft/year'), () =>
      HttpResponse.json([
        {
          aircraftRegistration: 'OH-STL',
          flightType: 'PRIVATE',
          yr: new Date().getFullYear(),
          totalFlightMins: 600,
          totalNfMins: 0,
          totalIfrMins: 0,
        },
      ]),
    ),
    http.get(apiUrl('v1/stats/pilot/flight-time/year'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/stats/members/count-by-type'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/stats/flight-time/aircraft/calendar'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/stats/visited-airfields'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/stats/flight-time/aircraft/year/month'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/stats/landings/year'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/stats/pob-distribution/year'), () => HttpResponse.json([])),
    http.get(apiUrl('v1/stats/non-billable/flight-time/aircraft/year'), () =>
      HttpResponse.json([
        {
          aircraftRegistration: 'OH-STL',
          flightType: 'MAINTENANCE',
          yr: new Date().getFullYear(),
          totalFlightMins: 60,
          totalNfMins: 0,
          totalIfrMins: 0,
        },
      ]),
    ),
    http.get(apiUrl('v1/stats/flight-stats/year'), () =>
      HttpResponse.json([
        {
          aircraftRegistration: 'OH-STL',
          yr: new Date().getFullYear(),
          longestFlight: 120,
          shortestFlight: 20,
          averageFlight: 55,
          medianFlight: 50,
        },
      ]),
    ),
  )
}

describe('Stats', () => {
  it("the Flight Time by Aircraft (Yearly) card's info button explains the calculation", async () => {
    statsApi()

    const { user } = renderWithProviders(<Stats />)

    await user.click(
      await screen.findByRole('button', { name: 'Flight Time by Aircraft (Yearly)' }),
    )

    expect(screen.getByText(/The total flight time logged for each aircraft/)).toBeInTheDocument()
  })

  it("the new Non-Billable Flight Time card's info button explains the calculation", async () => {
    statsApi()

    const { user } = renderWithProviders(<Stats />)

    await user.click(
      await screen.findByRole('button', { name: 'Non-Billable Flight Time by Aircraft' }),
    )

    expect(screen.getByText(/Flight time logged as non-billable/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the new Flight Length Statistics card renders the row and its info button explains the calculation', async () => {
    statsApi()

    const { user } = renderWithProviders(<Stats />)

    expect(await screen.findByText('120 min')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Flight Length Statistics' }))

    expect(screen.getByText(/how long a typical flight is on each aircraft/i)).toBeInTheDocument()
  })
})
