import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

// TurnstileWidget itself (site-key gating, Cloudflare wiring) is covered by
// @mik/ui's own TurnstileWidget.test.tsx. Mocking it here — rather than its
// internal @marsidev/react-turnstile dependency — is also what actually works:
// that package is a dependency of @mik/ui, not of this app, so a vi.mock of it
// from this test file resolves against a different module id than the one
// TurnstileWidget.tsx (physically in packages/ui) imports, and silently never
// intercepts it.
vi.mock('@mik/ui/components/TurnstileWidget', () => ({
  TurnstileWidget: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type='button' onClick={() => onSuccess('a-turnstile-token')}>
      Simulate Turnstile success
    </button>
  ),
}))

import Login from './Login'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'

/**
 * `handleSubmit` used to compute `safeTarget` and then drop it on the floor —
 * `trigger({ email })` never included it, so the backend's magic-link email
 * always fell back to redirecting into the member app rather than back here.
 * This pins the fix: the request body must carry `target`.
 *
 * The admin app also had no Turnstile widget at all, unlike the member app —
 * `verifyTurnstileToken` on the backend only checks a token when one is sent,
 * so the admin login endpoint was unprotected. `TurnstileWidget` moved to
 * `@mik/ui` so both apps render the same one; this pins that the admin login
 * form wires it up the same way the member app's does.
 */
describe('Login', () => {
  it('sends target alongside email when requesting a login link', async () => {
    const requestBodies: unknown[] = []
    server.use(
      http.post(apiUrl('auth/login'), async ({ request }) => {
        requestBodies.push(await request.json())
        return HttpResponse.json({ code: 12345 })
      }),
    )

    renderWithProviders(<Login />)

    await userEvent.type(screen.getByLabelText('Email address'), 'admin@mik.fi')
    await userEvent.click(screen.getByRole('button', { name: 'Send login link' }))

    await waitFor(() => expect(requestBodies).toHaveLength(1))
    expect(requestBodies[0]).toEqual({ email: 'admin@mik.fi', target: '/' })
  })

  it('sends the Turnstile token once the widget succeeds', async () => {
    const requestBodies: unknown[] = []
    server.use(
      http.post(apiUrl('auth/login'), async ({ request }) => {
        requestBodies.push(await request.json())
        return HttpResponse.json({ code: 12345 })
      }),
    )

    renderWithProviders(<Login />)

    await userEvent.type(screen.getByLabelText('Email address'), 'admin@mik.fi')
    await userEvent.click(screen.getByRole('button', { name: 'Simulate Turnstile success' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send login link' }))

    await waitFor(() => expect(requestBodies).toHaveLength(1))
    expect(requestBodies[0]).toEqual({
      email: 'admin@mik.fi',
      target: '/',
      turnstileToken: 'a-turnstile-token',
    })
  })
})
