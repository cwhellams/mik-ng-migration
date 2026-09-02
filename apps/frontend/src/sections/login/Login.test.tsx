import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { MIKPermissions } from '@mik/contracts/members'
import { useRoles } from '@mik/ui/hooks/useRoles'

// TurnstileWidget's own wiring is covered by @mik/ui's TurnstileWidget.test.tsx.
// It has to be mocked by the specifier this file's subject imports, not by its
// internal @marsidev/react-turnstile dependency — that package belongs to
// @mik/ui, so a vi.mock of it here resolves to a different module id and
// silently never intercepts. (The same note is in apps/admin's Login.test.tsx.)
vi.mock('@mik/ui/components/TurnstileWidget', () => ({
  TurnstileWidget: () => null,
}))

const passkey = vi.hoisted(() => ({
  signIn: vi.fn(),
  signInDiscoverable: vi.fn(),
}))

vi.mock('../../utils/passkey', () => ({
  passkeySupported: () => true,
  isSecureContextForPasskeys: () => true,
  loginWithPasskey: passkey.signIn,
  loginWithPasskeyDiscoverable: passkey.signInDiscoverable,
}))

import { aMember, aMemberRolesResponse } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import Login from './Login'

/**
 * A passkey login is the one sign-in path that never touches `useAuth` — it
 * talks to the backend through `sharedApi` — so it is also the one that has to
 * empty the API cache itself. Without that, #1312 reappears on this page alone:
 * the cookie is set, `navigate()` runs, and the destination reads the 401 the
 * logged-out session cached and bounces straight back here.
 */

const Destination = () => {
  const { hasAccess, isLoading } = useRoles()
  if (isLoading) return <span>loading</span>
  return <span>at /fly, member: {String(hasAccess(MIKPermissions.MEMBER))}</span>
}

/** Identity answers 401 until the passkey ceremony reports success. */
const aSessionStartedByThePasskey = () => {
  const session = { valid: false }
  const identity = (body: object) => () =>
    session.valid ? HttpResponse.json(body) : problemResponse(401, 'Unauthorized')

  server.use(
    http.get(apiUrl('v1/members/me'), identity(aMember())),
    http.get(apiUrl('v1/members/roles'), identity(aMemberRolesResponse())),
    http.post(apiUrl('auth/refresh'), identity({})),
  )

  const succeed = async () => {
    session.valid = true
    return { ok: true as const }
  }
  passkey.signIn.mockImplementation(succeed)
  passkey.signInDiscoverable.mockImplementation(succeed)

  return session
}

const renderLoginFlow = () =>
  renderWithProviders(
    <Routes>
      <Route path='/fly' element={<Destination />} />
      <Route path='/login' element={<Login />} />
    </Routes>,
    { route: '/fly', serverClock: false },
  )

describe('Login', () => {
  it('lands on the target after a passkey sign-in from a bounced-off page', async () => {
    aSessionStartedByThePasskey()

    const { user } = renderLoginFlow()

    // The bounce, which is what leaves the 401 in the cache — and what puts
    // `/fly` in the router state this page navigates back to.
    expect(await screen.findByRole('button', { name: 'Sign in with passkey' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in with passkey' }))

    expect(await screen.findByText('at /fly, member: true')).toBeInTheDocument()
    // No email typed, so the browser is asked to offer every passkey it holds.
    expect(passkey.signInDiscoverable).toHaveBeenCalled()
  })

  it('uses the email-scoped ceremony once an address is typed', async () => {
    aSessionStartedByThePasskey()

    const { user } = renderLoginFlow()

    await user.type(
      await screen.findByLabelText('Email', { exact: false }),
      'matti.meikalainen@gmail.com',
    )
    await user.click(screen.getByRole('button', { name: 'Sign in with passkey' }))

    expect(await screen.findByText('at /fly, member: true')).toBeInTheDocument()
    expect(passkey.signIn).toHaveBeenCalledWith('matti.meikalainen@gmail.com')
  })

  it('stays put when the member cancels the passkey prompt', async () => {
    aSessionStartedByThePasskey()
    passkey.signInDiscoverable.mockResolvedValue({ ok: false, reason: 'cancelled' })

    const { user } = renderLoginFlow()

    await user.click(await screen.findByRole('button', { name: 'Sign in with passkey' }))

    expect(screen.getByRole('button', { name: 'Sign in with passkey' })).toBeInTheDocument()
  })
})
