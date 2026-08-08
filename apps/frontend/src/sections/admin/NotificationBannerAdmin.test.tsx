import type { NotificationBanner } from '@backend/routes/notification-banner/models'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import NotificationBannerAdmin from './NotificationBannerAdmin'

const banner = (overrides: Partial<NotificationBanner> = {}) => {
  const state = {
    current: {
      enabled: false,
      message: null,
      severity: 'info',
      ...overrides,
    } as NotificationBanner,
    writes: [] as unknown[],
  }

  server.use(
    http.get(apiUrl('v1/notification-banner'), () => HttpResponse.json(state.current)),
    http.put(apiUrl('v1/notification-banner'), async ({ request }) => {
      const body = (await request.json()) as NotificationBanner
      state.writes.push(body)
      state.current = body
      return HttpResponse.json(body)
    }),
  )

  return state
}

describe('NotificationBannerAdmin', () => {
  it('loads the banner the club currently has set', async () => {
    banner({ enabled: true, message: 'Hangar closed', severity: 'warning' })

    renderWithProviders(<NotificationBannerAdmin />)

    expect(await screen.findByRole('textbox', { name: /Banner message/ })).toHaveValue(
      'Hangar closed',
    )
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('previews the banner as members will see it', async () => {
    banner({ enabled: true, message: 'Hangar closed', severity: 'warning' })

    renderWithProviders(<NotificationBannerAdmin />)

    const preview = await screen.findByRole('alert')
    expect(preview).toHaveTextContent('Hangar closed')
    expect(preview.className).toContain('MuiAlert-colorWarning')
  })

  it('shows no preview while the banner is switched off', async () => {
    banner({ enabled: false, message: 'Hangar closed' })

    renderWithProviders(<NotificationBannerAdmin />)

    await screen.findByRole('textbox', { name: /Banner message/ })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('saves the message, severity and switch together', async () => {
    const state = banner()

    const { user } = renderWithProviders(<NotificationBannerAdmin />)

    await user.type(
      await screen.findByRole('textbox', { name: /Banner message/ }),
      'Runway closed Saturday',
    )
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toEqual({
      enabled: true,
      message: 'Runway closed Saturday',
      severity: 'info',
    })
  })

  it('saves the chosen severity', async () => {
    const state = banner()

    const { user } = renderWithProviders(<NotificationBannerAdmin />)

    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Error' }))
    await user.type(screen.getByRole('textbox', { name: /Banner message/ }), 'Grounded')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ severity: 'error' })
  })

  it('sends a null message rather than an empty string', async () => {
    // The API models the absence of a banner as null, not "".
    const state = banner({ enabled: true, message: 'Old text' })

    const { user } = renderWithProviders(<NotificationBannerAdmin />)

    await user.clear(await screen.findByRole('textbox', { name: /Banner message/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ message: null })
  })

  it('confirms a successful save', async () => {
    banner()

    const { user } = renderWithProviders(<NotificationBannerAdmin />)

    await user.type(await screen.findByRole('textbox', { name: /Banner message/ }), 'Notice')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Banner updated successfully.')).toBeInTheDocument()
  })

  it('offers a clear button only while a banner is set', async () => {
    banner({ enabled: false, message: null })

    renderWithProviders(<NotificationBannerAdmin />)

    await screen.findByRole('button', { name: 'Save' })
    expect(screen.queryByRole('button', { name: 'Clear banner' })).toBeNull()
  })

  it('clears the banner in one step', async () => {
    const state = banner({ enabled: true, message: 'Hangar closed' })

    const { user } = renderWithProviders(<NotificationBannerAdmin />)

    await user.click(await screen.findByRole('button', { name: 'Clear banner' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ enabled: false, message: null })
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Banner message/ })).toHaveValue(''),
    )
  })

  it('counts the characters left of the 500 limit', async () => {
    banner({ message: 'Hello' })

    renderWithProviders(<NotificationBannerAdmin />)

    expect(await screen.findByText('5/500')).toBeInTheDocument()
  })

  it('caps the message at 500 characters', async () => {
    banner()

    renderWithProviders(<NotificationBannerAdmin />)

    expect(await screen.findByRole('textbox', { name: /Banner message/ })).toHaveAttribute(
      'maxlength',
      '500',
    )
  })

  it('renders nothing at all while loading', () => {
    banner()

    const { container } = renderWithProviders(<NotificationBannerAdmin />)

    expect(container).toBeEmptyDOMElement()
  })

  it('reports a failed save, and keeps what was typed', async () => {
    banner()
    server.use(http.put(apiUrl('v1/notification-banner'), () => problemResponse(500, 'Down')))

    const { user } = renderWithProviders(<NotificationBannerAdmin />)

    await user.type(await screen.findByRole('textbox', { name: /Banner message/ }), 'Notice')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Failed to save the banner. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Banner updated successfully.')).toBeNull()
    // The refetch is skipped on failure, so the admin's text is still there.
    expect(screen.getByRole('textbox', { name: /Banner message/ })).toHaveValue('Notice')
  })

  it('reports a failed clear rather than blanking the fields', async () => {
    banner({ enabled: true, message: 'Hangar closed' })
    server.use(http.put(apiUrl('v1/notification-banner'), () => problemResponse(500, 'Down')))

    const { user } = renderWithProviders(<NotificationBannerAdmin />)

    await user.click(await screen.findByRole('button', { name: 'Clear banner' }))

    expect(
      await screen.findByText('Failed to save the banner. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Banner message/ })).toHaveValue('Hangar closed')
  })
})

describe('NotificationBannerAdmin accessibility', () => {
  it('names the show/hide switch from its label', async () => {
    // It is a `switch`, not a `checkbox` — worth pinning, since the obvious
    // query does not find it.
    banner({ enabled: true, message: 'Hangar closed' })

    renderWithProviders(<NotificationBannerAdmin />)

    await screen.findByRole('textbox', { name: /Banner message/ })
    expect(screen.getByRole('switch', { name: 'Show banner' })).toBeInTheDocument()
  })
})
