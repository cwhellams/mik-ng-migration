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
import LoginValidate from './Validate'

/**
 * The magic-link half of the login flow. It consumes the token in the URL and
 * navigates to `target`, and it carries the same #1312 exposure the code-entry
 * page did: the session it starts is new, but the SWR cache the destination
 * reads is the logged-out one's — see `Sent.test.tsx` for the full account.
 */

const Destination = () => {
  const { hasAccess, isLoading } = useRoles()
  if (isLoading) return <span>loading</span>
  return <span>at /fly, member: {String(hasAccess(MIKPermissions.MEMBER))}</span>
}

const aSessionStartedByTheLink = () => {
  const session = { valid: false }
  const identity = (body: object) => () =>
    session.valid ? HttpResponse.json(body) : problemResponse(401, 'Unauthorized')

  server.use(
    http.get(apiUrl('v1/members/me'), identity(aMember())),
    http.get(apiUrl('v1/members/roles'), identity(aMemberRolesResponse())),
    http.post(apiUrl('auth/refresh'), identity({})),
    http.post(apiUrl('auth/login/validate'), () => {
      session.valid = true
      return HttpResponse.json({ ok: true })
    }),
  )

  return session
}

/** The bounce lands here; the link stands in for the one in the email. */
const LoginPage = () => (
  <div>
    <span>login page</span>
    <Link to='/login/validate?token=a-magic-token&target=/fly'>open the email link</Link>
  </div>
)

const renderLoginFlow = () =>
  renderWithProviders(
    <Routes>
      <Route path='/fly' element={<Destination />} />
      <Route path='/login' element={<LoginPage />} />
      <Route path='/login/validate' element={<LoginValidate />} />
    </Routes>,
    { route: '/fly', serverClock: false },
  )

describe('LoginValidate', () => {
  it('lands on the target after a link opened from a bounced-off page', async () => {
    aSessionStartedByTheLink()

    const { user } = renderLoginFlow()

    expect(await screen.findByText('login page')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'open the email link' }))

    expect(await screen.findByText('at /fly, member: true')).toBeInTheDocument()
  })

  it('says so when the token has expired', async () => {
    aSessionStartedByTheLink()
    server.use(
      http.post(apiUrl('auth/login/validate'), () => problemResponse(401, 'Token expired')),
    )

    const { user } = renderLoginFlow()

    expect(await screen.findByText('login page')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'open the email link' }))

    expect(await screen.findByText('Login failed')).toBeInTheDocument()
  })
})
