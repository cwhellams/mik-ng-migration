import { http, HttpResponse } from 'msw'
import { Link, Route, Routes, useNavigate } from 'react-router'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import useApi from './useApi'
import { signsIn, useClearApiCache } from './apiCache'

/**
 * The cache is per session, and this is the pair of things that says so: which
 * `auth/*` calls end one, and what emptying it does.
 */

interface Payload {
  value: string
}

const PAYLOAD: Payload = { value: 'ok' }

describe('signsIn', () => {
  it.each(['login/validate', 'login/verify-code', 'register/verify'])(
    'counts auth/%s as a sign-in',
    (endpoint) => {
      expect(signsIn(endpoint)).toBe(true)
    },
  )

  it.each(['login', 'register', 'contact', 'logout'])('does not count auth/%s', (endpoint) => {
    // `login` and `register` only send an email; `contact` is not an auth call;
    // and signing out deliberately leaves the outgoing page's data in place.
    expect(signsIn(endpoint)).toBe(false)
  })
})

describe('useClearApiCache', () => {
  it('drops cached data without fetching it again', async () => {
    const state = { requests: 0 }
    server.use(
      http.get(apiUrl('v1/thing'), () => {
        state.requests++
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const Page = () => {
      const { data } = useApi<Payload>({ url: 'v1/thing' })
      const clearApiCache = useClearApiCache()
      return (
        <button onClick={() => clearApiCache()}>{data ? `value ${data.value}` : 'no value'}</button>
      )
    }

    const { user } = renderWithProviders(<Page />)

    expect(await screen.findByRole('button', { name: 'value ok' })).toBeInTheDocument()

    await user.click(screen.getByRole('button'))

    // `revalidate: false`: whoever mounts next asks for what it needs itself.
    expect(await screen.findByRole('button', { name: 'no value' })).toBeInTheDocument()
    expect(state.requests).toBe(1)
  })

  it('drops a cached 401, so the next mount starts from loading rather than from it', async () => {
    // The #1312 case. A page reached straight after a sign-in must not find the
    // 401 its own logged-out call left behind: `useRoles` and `useMe` both skip
    // stale revalidation, so a permission gate reading that error would render
    // Forbidden for a beat before the refetch it never asked for landed.
    const session = { valid: false }
    server.use(
      http.post(apiUrl('auth/refresh'), () =>
        session.valid ? HttpResponse.json({}) : problemResponse(401, 'Refresh token expired'),
      ),
      http.get(apiUrl('v1/thing'), () =>
        session.valid ? HttpResponse.json(PAYLOAD) : problemResponse(401, 'Token expired'),
      ),
    )

    const rendered: string[] = []

    const Page = () => {
      const { data, error } = useApi<Payload>({
        url: 'v1/thing',
        skipRedirectOnUnauthorized: true,
      })
      const state = data ? `value ${data.value}` : error ? `failed ${error.status}` : 'loading'
      rendered.push(state)
      return (
        <div>
          <span>{state}</span>
          <Link to='/login'>leave</Link>
        </div>
      )
    }

    const SignIn = () => {
      const clearApiCache = useClearApiCache()
      const navigate = useNavigate()
      return (
        <button
          onClick={async () => {
            session.valid = true
            await clearApiCache()
            navigate('/fly')
          }}
        >
          sign in
        </button>
      )
    }

    const { user } = renderWithProviders(
      <Routes>
        <Route path='/fly' element={<Page />} />
        <Route path='/login' element={<SignIn />} />
      </Routes>,
      { route: '/fly' },
    )

    expect(await screen.findByText('failed 401')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'leave' }))
    rendered.length = 0

    await user.click(screen.getByRole('button', { name: 'sign in' }))

    expect(await screen.findByText('value ok')).toBeInTheDocument()
    expect(rendered[0]).toBe('loading')
    expect(rendered).not.toContain('failed 401')
  })
})
