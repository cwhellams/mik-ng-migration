import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { RecentRemark } from '@mik/contracts/remarks'

import { anAdmin } from '../../../test/fixtures'
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

const dashboardApi = (recentRemarks: RecentRemark[] = []) => {
  server.use(
    http.get(apiUrl('v1/ajlb'), () => HttpResponse.json({ books: [] })),
    http.get(apiUrl('v1/flight-logs'), () => HttpResponse.json({ logs: [] })),
    http.get(apiUrl('v1/remarks/recent'), () => HttpResponse.json({ remarks: recentRemarks })),
  )
}

describe('FlightLogAdminDashboard remarks', () => {
  it('lists the most recently logged remarks with a link to the flight', async () => {
    signInAs(anAdmin())
    dashboardApi([aRecentRemark()])

    renderWithProviders(<FlightLogAdminDashboard />)

    expect(await screen.findByText('Oil stain noticed on the ramp, wiped off')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /OH-STL/ })
    expect(link).toHaveAttribute('href', '/logs/flights/fi_inst1')
  })

  it('shows an empty state when there are no remarks', async () => {
    signInAs(anAdmin())
    dashboardApi([])

    renderWithProviders(<FlightLogAdminDashboard />)

    expect(await screen.findByText('No remarks logged.')).toBeInTheDocument()
  })
})
