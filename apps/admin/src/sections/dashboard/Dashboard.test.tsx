import { screen, waitFor } from '@testing-library/react'
import { MIKPermissions } from '@mik/contracts/members'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import Dashboard from './Dashboard'
import { signInWithPermissions } from '../../test/auth'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'

/**
 * Each widget is gated on its own permission, so a treasurer sees expense
 * approvals and nothing else. That is the behaviour worth pinning: the four
 * queues came from the member dashboard, where they were mixed in with weather
 * and bookings, and the point of moving them was that an admin sees only their
 * own work (#1233).
 */
const emptyQueues = () => {
  // No catch-all here on purpose: `server.use` prepends, so a catch-all
  // registered alongside these would shadow the default /v1/members handler and
  // hand MemberAdminDashboard an array where it expects { members: [] }.
  server.use(
    http.get(apiUrl('v1/members'), () => HttpResponse.json({ members: [], total: 0 })),
    http.get(apiUrl('v1/expenses/admin/pending/count'), () => HttpResponse.json({ count: 0 })),
    http.get(apiUrl('v1/ame/admin/pending/count'), () => HttpResponse.json({ count: 0 })),
    http.get(apiUrl('v1/ajlb'), () => HttpResponse.json({ ajlbs: [] })),
    http.get(apiUrl('v1/flight-logs'), () => HttpResponse.json({ flightLogs: [], total: 0 })),
    http.get(apiUrl('v1/remarks/recent'), () => HttpResponse.json({ remarks: [] })),
  )
}

describe('admin dashboard', () => {
  beforeEach(() => emptyQueues())

  it('greets the signed-in admin by name', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(<Dashboard />)

    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument()
  })

  it('shows the member-approval queue to a member admin', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(<Dashboard />)

    expect(await screen.findByText(/pending member approvals/i)).toBeInTheDocument()
  })

  it('does not show the member-approval queue to a treasurer', async () => {
    // The whole reason each widget carries its own permission rather than the
    // page carrying one.
    signInWithPermissions(MIKPermissions.EXPENSE_ADMIN)

    renderWithProviders(<Dashboard />)

    await waitFor(() =>
      expect(screen.queryByText(/pending member approvals/i)).not.toBeInTheDocument(),
    )
  })

  it('explains itself to an admin with none of these queues', async () => {
    // Reachable: every route in this app is gated, but the dashboard is not, so
    // an admin whose permissions cover none of the four lands here.
    signInWithPermissions(MIKPermissions.OUTBOX_ADMIN)

    renderWithProviders(<Dashboard />)

    expect(await screen.findByText(/nothing is waiting on you/i)).toBeInTheDocument()
  })
})
