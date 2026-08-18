import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { RecentRemark } from '@mik/contracts/remarks'

import { aFlightLog, anAdmin } from '../../../test/fixtures'
import { signInAs } from '../../../test/auth'
import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { FlightLogAdminDashboard } from './FlightLogAdminDashboard'

const aRecentRemark = (overrides: Partial<RecentRemark> = {}): RecentRemark => ({
  remarkId: 'remark-1',
  flightId: 'fi_inst1',
  description: 'Oil stain noticed on the ramp, wiped off',
  aircraftRegistration: 'OH-STL',
  takeoffTimeUtc: '2025-06-02T09:00:00.000Z',
  createdAt: '2025-06-02T09:00:00.000Z',
  createdBy: 'Matti1',
  updatedAt: '2025-06-02T09:00:00.000Z',
  updatedBy: 'Matti1',
  ...overrides,
})

const dashboardApi = (
  logs: ReturnType<typeof aFlightLog>[] = [],
  recentRemarks: RecentRemark[] = [],
) => {
  server.use(
    http.get(apiUrl('v1/ajlb'), () => HttpResponse.json({ books: [] })),
    http.get(apiUrl('v1/flight-logs'), () => HttpResponse.json({ logs })),
    http.get(apiUrl('v1/remarks/recent'), () => HttpResponse.json({ remarks: recentRemarks })),
  )
}

describe('FlightLogAdminDashboard incidents, observations and remarks', () => {
  it('lists the most recently logged remarks with a link to the flight', async () => {
    signInAs(anAdmin())
    dashboardApi([], [aRecentRemark()])

    renderWithProviders(<FlightLogAdminDashboard />)

    expect(await screen.findByText('Oil stain noticed on the ramp, wiped off')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /OH-STL/ })
    expect(link).toHaveAttribute('href', '/logs/flights/fi_inst1')
  })

  it('lists flights with an incident or observation alongside remarks, in one widget', async () => {
    signInAs(anAdmin())
    dashboardApi(
      [
        aFlightLog({
          flightId: 'fi_inst2',
          aircraftRegistration: 'OH-IHQ',
          incidentOrObservations: 'Rough running on climb-out',
          takeoffTimeUtc: '2025-06-03T09:00:00.000Z',
        }),
      ],
      [aRecentRemark({ takeoffTimeUtc: '2025-06-02T09:00:00.000Z' })],
    )

    renderWithProviders(<FlightLogAdminDashboard />)

    expect(await screen.findByText('Rough running on climb-out')).toBeInTheDocument()
    expect(screen.getByText('Oil stain noticed on the ramp, wiped off')).toBeInTheDocument()
  })

  it('puts the most recent flight -- incident or remark -- first', async () => {
    signInAs(anAdmin())
    dashboardApi(
      [
        aFlightLog({
          flightId: 'fi_inst2',
          aircraftRegistration: 'OH-IHQ',
          incidentOrObservations: 'Rough running on climb-out',
          takeoffTimeUtc: '2025-06-01T09:00:00.000Z',
        }),
      ],
      [aRecentRemark({ takeoffTimeUtc: '2025-06-05T09:00:00.000Z' })],
    )

    renderWithProviders(<FlightLogAdminDashboard />)

    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Oil stain noticed on the ramp, wiped off')
    expect(items[1]).toHaveTextContent('Rough running on climb-out')
  })

  it('shows an empty state when there are no incidents, observations or remarks', async () => {
    signInAs(anAdmin())
    dashboardApi([], [])

    renderWithProviders(<FlightLogAdminDashboard />)

    expect(
      await screen.findByText('No flights with incidents, observations or remarks.'),
    ).toBeInTheDocument()
  })
})
