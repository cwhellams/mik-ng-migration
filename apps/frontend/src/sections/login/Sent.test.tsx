import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Link, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { MIKPermissions } from '@mik/contracts/members'
import { useRoles } from '@mik/ui/hooks/useRoles'

import { aMember, aMemberRolesResponse } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import LoginSent from './Sent'

/**
 * The code-entry page, and the bug it was the visible end of.
 *
 * #1312: entering a valid code re-rendered the code-entry page instead of
 * landing on the dashboard. Nothing was wrong with this page — it verified the
 * code, the backend set the cookie and `navigate()` ran. What sent the member
 * back was the SWR cache: the 401 from the page they had been bounced *off*
 * was still the cached answer for the roles endpoint the header reads, so the
 * destination redirected to /login again the moment it mounted.
 *
 * That is why this suite drives the whole bounce-and-return rather than
 * asserting on `navigate` — the two halves only interact through the cache.
 */

/** A page that needs the header's identity call, like every real destination. */
const Destination = () => {
  const { hasAccess, isLoading } = useRoles()
  if (isLoading) return <span>loading</span>
  return <span>at /fly, member: {String(hasAccess(MIKPermissions.MEMBER))}</span>
}

/** Where the bounce lands, with the link Login.tsx's own navigate stands in for. */
const LoginPage = () => (
  <div>
    <span>login page</span>
    <Link to='/login/sent' state={{ email: 'matti@example.com', target: '/fly' }}>
      code sent
    </Link>
  </div>
)

/**
 * Serves identity against a session that starts dead and is brought to life by
 * `auth/login/verify-code`, exactly as setting the cookie does.
 */
const aSessionStartedByTheCode = () => {
  const session = { valid: false }
  const identity = (body: object) => () =>
    session.valid ? HttpResponse.json(body) : problemResponse(401, 'Unauthorized')

  server.use(
    http.get(apiUrl('v1/members/me'), identity(aMember())),
    http.get(apiUrl('v1/members/roles'), identity(aMemberRolesResponse())),
    http.post(apiUrl('auth/refresh'), identity({})),
    http.post(apiUrl('auth/login/verify-code'), () => {
      session.valid = true
      return HttpResponse.json({ ok: true })
    }),
  )

  return session
}

const enterTheCode = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.type(screen.getByLabelText('Verification code'), '12345')
  await user.click(screen.getByRole('button', { name: 'Confirm code' }))
}

const renderLoginFlow = () =>
  renderWithProviders(
    <Routes>
      <Route path='/fly' element={<Destination />} />
      <Route path='/login' element={<LoginPage />} />
      <Route path='/login/sent' element={<LoginSent />} />
    </Routes>,
    { route: '/fly', serverClock: false },
  )

describe('LoginSent', () => {
  it('lands on the target after a code entered from a bounced-off page', async () => {
    aSessionStartedByTheCode()

    const { user } = renderLoginFlow()

    // The bounce, which is what leaves the 401 in the cache.
    expect(await screen.findByText('login page')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'code sent' }))
    await enterTheCode(user)

    expect(await screen.findByText('at /fly, member: true')).toBeInTheDocument()
  })

  it('reports a rejected code and stays put', async () => {
    aSessionStartedByTheCode()
    server.use(
      http.post(apiUrl('auth/login/verify-code'), () => problemResponse(401, 'Invalid code')),
    )

    const { user } = renderLoginFlow()

    expect(await screen.findByText('login page')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'code sent' }))
    await enterTheCode(user)

    expect(await screen.findByText('Invalid code')).toBeInTheDocument()
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument()
  })

  it('will not submit a code that is not five digits', async () => {
    aSessionStartedByTheCode()

    const { user } = renderLoginFlow()
    expect(await screen.findByText('login page')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'code sent' }))

    await user.type(screen.getByLabelText('Verification code'), '123')

    expect(screen.getByRole('button', { name: 'Confirm code' })).toBeDisabled()
  })
})
