import type { NotificationBanner as Banner } from '@mik/contracts/notification-banner'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import { NotificationBanner } from './NotificationBanner'

const banner = (overrides: Partial<Banner> = {}) =>
  server.use(
    http.get(apiUrl('v1/notification-banner'), () =>
      HttpResponse.json<Banner>({
        enabled: true,
        message: 'Hangar closed this weekend',
        severity: 'warning',
        ...overrides,
      }),
    ),
  )

describe('NotificationBanner', () => {
  it('shows the message the club has published', async () => {
    banner()

    renderWithProviders(<NotificationBanner />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Hangar closed this weekend')
  })

  it('renders at the severity the club chose', async () => {
    banner({ severity: 'error' })

    renderWithProviders(<NotificationBanner />)

    expect((await screen.findByRole('alert')).className).toContain('MuiAlert-colorError')
  })

  it('stays hidden while switched off', async () => {
    banner({ enabled: false })

    renderWithProviders(<NotificationBanner />)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('stays hidden when enabled with no message', async () => {
    banner({ message: null })

    renderWithProviders(<NotificationBanner />)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('stays hidden when the endpoint fails', async () => {
    server.use(http.get(apiUrl('v1/notification-banner'), () => problemResponse(500, 'Down')))

    renderWithProviders(<NotificationBanner />)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('shows to a signed-out visitor too', async () => {
    // It is fetched with allowUnauthenticated, so the login page can show it.
    banner()
    server.use(http.get(apiUrl('v1/members/me'), () => problemResponse(401, 'Unauthorized')))

    renderWithProviders(<NotificationBanner />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Hangar closed this weekend')
  })
})
