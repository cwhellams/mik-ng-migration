import { delay, http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders, renderWithProviders } from '../test/renderWithProviders'
import useApi from './useApi'

/**
 * `useApi` is used at 286 call sites across 162 files, so a bug here is a bug
 * everywhere. These tests cover the behaviour that lives in the hook itself —
 * the 401 refresh-and-retry cycle, retry suppression, the sudo header, the
 * redirect to /login and the error→Problem normalisation.
 */

interface Payload {
  value: string
}

const PAYLOAD: Payload = { value: 'ok' }

/** Records every request the test makes, so headers and paths can be asserted. */
const recorder = () => {
  const requests: Request[] = []
  return {
    requests,
    record: (request: Request) => {
      requests.push(request.clone())
    },
  }
}

beforeEach(() => {
  // The interceptor keeps a module-level promise so concurrent 401s share one
  // refresh. It clears itself on settle, but make the expectation explicit.
  server.resetHandlers()
})

describe('useApi fetching', () => {
  it('resolves the response body, unwrapped from axios', async () => {
    server.use(http.get(apiUrl('v1/thing'), () => HttpResponse.json(PAYLOAD)))

    const { result } = renderHookWithProviders(() => useApi<Payload>({ url: 'v1/thing' }))

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(result.current.error).toBeUndefined()
  })

  it('exposes the RFC 9457 problem body on failure, not the axios error', async () => {
    server.use(http.get(apiUrl('v1/thing'), () => problemResponse(404, 'No such thing')))

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', skipRedirectOnUnauthorized: true }),
    )

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.error).toEqual({ status: 404, detail: 'No such thing' })
    expect(result.current.data).toBeUndefined()
  })

  it('does not fetch at all when skipFetch is set', async () => {
    const { requests, record } = recorder()
    server.use(
      http.get(apiUrl('v1/thing'), ({ request }) => {
        record(request)
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', skipFetch: true }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(requests).toHaveLength(0)
    expect(result.current.data).toBeUndefined()
  })

  it('serialises array params as repeated bare keys, not bracket notation', async () => {
    const { requests, record } = recorder()
    server.use(
      http.get(apiUrl('v1/thing'), ({ request }) => {
        record(request)
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', params: { registration: ['OH-STL', 'OH-IHQ'] } }),
    )

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    // Express's qs parser would keep 'registration[]' as a literal key.
    expect(new URL(requests[0].url).search).toBe('?registration=OH-STL&registration=OH-IHQ')
  })

  it('omits null and undefined params rather than sending them as strings', async () => {
    const { requests, record } = recorder()
    server.use(
      http.get(apiUrl('v1/thing'), ({ request }) => {
        record(request)
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({
        url: 'v1/thing',
        params: { kept: 'yes', empty: undefined, missing: null },
      }),
    )

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(new URL(requests[0].url).search).toBe('?kept=yes')
  })

  it('refuses an absolute URL, so a caller cannot be tricked into calling out', () => {
    // validateApiPath throws during render — an SSRF guard, not a soft failure.
    expect(() =>
      renderHookWithProviders(() => useApi({ url: 'https://evil.example.com/steal' })),
    ).toThrow('Absolute URLs are not allowed in API paths')
  })

  it('refuses a path-traversal attempt', () => {
    expect(() => renderHookWithProviders(() => useApi({ url: 'v1/../../etc/passwd' }))).toThrow(
      'Path traversal is not allowed',
    )
  })
})

describe('useApi sudo header', () => {
  /** Serves v1/thing and hands back the requests it saw. */
  const captureRequests = () => {
    const { requests, record } = recorder()
    server.use(
      http.get(apiUrl('v1/thing'), ({ request }) => {
        record(request)
        return HttpResponse.json(PAYLOAD)
      }),
    )
    return requests
  }

  it('sends x-sudo: false while admin mode is off', async () => {
    const requests = captureRequests()

    const { result } = renderHookWithProviders(() => useApi<Payload>({ url: 'v1/thing' }))

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(requests[0].headers.get('x-sudo')).toBe('false')
  })

  it('sends x-sudo: true while admin mode is on', async () => {
    const requests = captureRequests()

    const { result } = renderHookWithProviders(() => useApi<Payload>({ url: 'v1/thing' }), {
      sudo: true,
    })

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(requests[0].headers.get('x-sudo')).toBe('true')
  })

  it('sends x-sudo: true for an alwaysSudo request even with admin mode off', async () => {
    const requests = captureRequests()

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', alwaysSudo: true }),
    )

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(requests[0].headers.get('x-sudo')).toBe('true')
  })

  it('keeps the caller’s own headers alongside x-sudo', async () => {
    const { requests, record } = recorder()
    server.use(
      http.get(apiUrl('v1/thing'), ({ request }) => {
        record(request)
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', headers: { 'x-custom': 'kept' } }),
    )

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(requests[0].headers.get('x-custom')).toBe('kept')
    expect(requests[0].headers.get('x-sudo')).toBe('false')
  })
})

describe('useApi 401 handling', () => {
  /**
   * Answers 401 until the refresh endpoint has been called, then succeeds —
   * exactly what an expired access token plus a valid refresh cookie looks like.
   */
  const expiredSession = () => {
    const state = { refreshes: 0, attempts: 0 }
    server.use(
      http.post(apiUrl('auth/refresh'), async () => {
        state.refreshes++
        // Hold the refresh open so overlapping 401s have to share it.
        await delay(20)
        return HttpResponse.json({})
      }),
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return state.refreshes > 0
          ? HttpResponse.json(PAYLOAD)
          : problemResponse(401, 'Token expired')
      }),
    )
    return state
  }

  it('refreshes the token and retries the request once', async () => {
    const state = expiredSession()

    const { result } = renderHookWithProviders(() => useApi<Payload>({ url: 'v1/thing' }))

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(state.refreshes).toBe(1)
    expect(state.attempts).toBe(2)
  })

  it('refreshes only once when several requests hit a 401 together', async () => {
    const state = { refreshes: 0, refreshed: false }
    server.use(
      http.post(apiUrl('auth/refresh'), async () => {
        state.refreshes++
        await delay(20)
        state.refreshed = true
        return HttpResponse.json({})
      }),
      http.get(apiUrl('v1/one'), () =>
        state.refreshed ? HttpResponse.json(PAYLOAD) : problemResponse(401, 'Token expired'),
      ),
      http.get(apiUrl('v1/two'), () =>
        state.refreshed ? HttpResponse.json(PAYLOAD) : problemResponse(401, 'Token expired'),
      ),
    )

    const { result } = renderHookWithProviders(() => ({
      one: useApi<Payload>({ url: 'v1/one' }),
      two: useApi<Payload>({ url: 'v1/two' }),
    }))

    await waitFor(() => {
      expect(result.current.one.data).toEqual(PAYLOAD)
      expect(result.current.two.data).toEqual(PAYLOAD)
    })
    // Both 401s share the single in-flight refresh promise.
    expect(state.refreshes).toBe(1)
  })

  it('gives up after one retry rather than looping', async () => {
    const state = { refreshes: 0, attempts: 0 }
    server.use(
      http.post(apiUrl('auth/refresh'), () => {
        state.refreshes++
        return HttpResponse.json({})
      }),
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return problemResponse(401, 'Still expired')
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', skipRedirectOnUnauthorized: true }),
    )

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(state.attempts).toBe(2)
    expect(state.refreshes).toBe(1)
  })

  it('propagates the original 401 when the refresh itself fails', async () => {
    const state = { attempts: 0 }
    server.use(
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Refresh token expired')),
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return problemResponse(401, 'Token expired')
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', skipRedirectOnUnauthorized: true }),
    )

    await waitFor(() => expect(result.current.error).toBeDefined())
    // The user sees the original 401, not the refresh failure.
    expect(result.current.error).toEqual({ status: 401, detail: 'Token expired' })
    expect(state.attempts).toBe(1)
  })

  it('skips the refresh entirely for an allowUnauthenticated request', async () => {
    const state = { refreshes: 0, attempts: 0 }
    server.use(
      http.post(apiUrl('auth/refresh'), () => {
        state.refreshes++
        return HttpResponse.json({})
      }),
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return problemResponse(401, 'Not logged in')
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', allowUnauthenticated: true }),
    )

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(state.refreshes).toBe(0)
    expect(state.attempts).toBe(1)
  })
})

/**
 * The redirect runs from an effect, once per lost session. It used to run from
 * the hook's render body, which terminated only because the redirect unmounts
 * the component that made the call — a caller that survived the route change
 * re-navigated on every render and never stopped. The last two tests here pin
 * the fix; the rest are written as route trees because that is how the redirect
 * is actually observed.
 */
describe('useApi redirect to login', () => {
  const Protected = ({ request }: { request: Parameters<typeof useApi>[0] }) => {
    const { error } = useApi<Payload>(request)
    const { pathname } = useLocation()
    return (
      <div>
        <span>at {pathname}</span>
        {error ? <span>failed {error.status}</span> : null}
      </div>
    )
  }

  const renderAtRoute = (request: Parameters<typeof useApi>[0], route = '/club/members') =>
    renderWithProviders(
      <Routes>
        <Route path='/club/members' element={<Protected request={request} />} />
        <Route path='/login/validate' element={<Protected request={request} />} />
        <Route path='/login' element={<span>login page</span>} />
      </Routes>,
      { route },
    )

  it('sends the user to /login once a 401 survives the refresh cycle', async () => {
    server.use(
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Refresh token expired')),
      http.get(apiUrl('v1/thing'), () => problemResponse(401, 'Token expired')),
    )

    renderAtRoute({ url: 'v1/thing' })

    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('stays put when skipRedirectOnUnauthorized is set', async () => {
    server.use(
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Refresh token expired')),
      http.get(apiUrl('v1/thing'), () => problemResponse(401, 'Token expired')),
    )

    renderAtRoute({ url: 'v1/thing', skipRedirectOnUnauthorized: true })

    expect(await screen.findByText('failed 401')).toBeInTheDocument()
    expect(screen.getByText('at /club/members')).toBeInTheDocument()
  })

  it('stays put when allowUnauthenticated is set', async () => {
    server.use(http.get(apiUrl('v1/thing'), () => problemResponse(401, 'Not logged in')))

    renderAtRoute({ url: 'v1/thing', allowUnauthenticated: true }, '/login/validate')

    expect(await screen.findByText('failed 401')).toBeInTheDocument()
    expect(screen.getByText('at /login/validate')).toBeInTheDocument()
  })

  it('does not redirect on a non-401 failure', async () => {
    server.use(http.get(apiUrl('v1/thing'), () => problemResponse(403, 'Forbidden')))

    renderAtRoute({ url: 'v1/thing' })

    expect(await screen.findByText('failed 403')).toBeInTheDocument()
    expect(screen.getByText('at /club/members')).toBeInTheDocument()
  })

  it('withholds data once the session is gone, so no stale content renders', async () => {
    // First response succeeds, a revalidation then 401s: `data` must clear.
    let loggedIn = true
    server.use(
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Refresh token expired')),
      http.get(apiUrl('v1/thing'), () =>
        loggedIn ? HttpResponse.json(PAYLOAD) : problemResponse(401, 'Token expired'),
      ),
    )

    const Showing = () => {
      const { data, mutate } = useApi<Payload>({
        url: 'v1/thing',
        skipRedirectOnUnauthorized: true,
      })
      return <button onClick={() => mutate()}>{data ? `value ${data.value}` : 'no value'}</button>
    }

    const { user } = renderWithProviders(<Showing />)

    expect(await screen.findByRole('button', { name: 'value ok' })).toBeInTheDocument()

    loggedIn = false
    await user.click(screen.getByRole('button'))

    expect(await screen.findByRole('button', { name: 'no value' })).toBeInTheDocument()
  })

  it('redirects once, from a caller that stays mounted across the route change', async () => {
    // The regression this guards: rendered outside <Routes>, the caller survives
    // the navigation to /login. Driven from the render body, the redirect then
    // re-fired on every render and the test hung. Recording each location the
    // router visits makes an extra navigation visible instead.
    server.use(
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Refresh token expired')),
      http.get(apiUrl('v1/thing'), () => problemResponse(401, 'Token expired')),
    )

    const visited: string[] = []
    const Persistent = () => {
      useApi<Payload>({ url: 'v1/thing' })
      const { pathname } = useLocation()
      if (visited.at(-1) !== pathname) visited.push(pathname)
      return <span>at {pathname}</span>
    }

    renderWithProviders(<Persistent />, { route: '/club/members' })

    await waitFor(() => expect(screen.getByText('at /login')).toBeInTheDocument())

    // Give any runaway navigation a chance to show up before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(visited).toEqual(['/club/members', '/login'])
  })

  it('remembers the page the user was on, not /login', async () => {
    server.use(
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Refresh token expired')),
      http.get(apiUrl('v1/thing'), () => problemResponse(401, 'Token expired')),
    )

    const Persistent = () => {
      useApi<Payload>({ url: 'v1/thing' })
      const { pathname, state } = useLocation()
      return (
        <span>{`at ${pathname} from ${(state as { target?: string })?.target ?? 'nowhere'}`}</span>
      )
    }

    renderWithProviders(<Persistent />, { route: '/club/members' })

    expect(await screen.findByText('at /login from /club/members')).toBeInTheDocument()
  })

  it('keeps the original target when a later revalidation 401s again', async () => {
    // A latch that re-arms whenever `shouldRedirect` drops would break here:
    // `isValidating` flickers true on any revalidation, and when this one
    // settles still-401 the second navigate would run from /login and overwrite
    // `target` with '/login' itself. Guarding on the current pathname has no
    // such state to reset.
    server.use(
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Refresh token expired')),
      http.get(apiUrl('v1/thing'), () => problemResponse(401, 'Token expired')),
    )

    const visited: string[] = []
    const Persistent = () => {
      const { mutate } = useApi<Payload>({ url: 'v1/thing' })
      const { pathname, state } = useLocation()
      if (visited.at(-1) !== pathname) visited.push(pathname)
      return (
        <button onClick={() => mutate()}>
          {`at ${pathname} from ${(state as { target?: string })?.target ?? 'nowhere'}`}
        </button>
      )
    }

    const { user } = renderWithProviders(<Persistent />, { route: '/club/members' })

    await screen.findByRole('button', { name: 'at /login from /club/members' })

    // Force the revalidation that flickers isValidating.
    await user.click(screen.getByRole('button'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.getByRole('button', { name: 'at /login from /club/members' })).toBeInTheDocument()
    expect(visited).toEqual(['/club/members', '/login'])
  })
})

describe('useApi retry policy', () => {
  const retrying = { shouldRetryOnError: true, errorRetryInterval: 5, errorRetryCount: 3 }

  afterEach(() => vi.useRealTimers())

  it('does not retry a 4xx — the answer will not change', async () => {
    const state = { attempts: 0 }
    server.use(
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return problemResponse(404, 'No such thing')
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', skipRedirectOnUnauthorized: true }, retrying),
    )

    await waitFor(() => expect(result.current.error).toBeDefined())
    // Switch to fake timers after the initial request settles so that we can
    // advance virtual time well past the retry window without a real sleep.
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(retrying.errorRetryCount * retrying.errorRetryInterval * 10)
    expect(state.attempts).toBe(1)
  })

  it('retries a 5xx, which may well be transient', async () => {
    const state = { attempts: 0 }
    server.use(
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return state.attempts > 1 ? HttpResponse.json(PAYLOAD) : problemResponse(503, 'Try again')
      }),
    )

    const { result } = renderHookWithProviders(() => useApi<Payload>({ url: 'v1/thing' }, retrying))

    await waitFor(() => expect(result.current.data).toEqual(PAYLOAD))
    expect(state.attempts).toBeGreaterThan(1)
  })
})

describe('useApi mutations', () => {
  it('posts the payload and returns the response body', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(apiUrl('v1/thing'), async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ value: 'created' })
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', skipFetch: true }),
    )

    const response = await result.current.mutation.trigger('POST', { value: 'new' })

    expect(bodies).toEqual([{ value: 'new' }])
    expect(response.data).toEqual({ value: 'created' })
    expect(response.error).toBeUndefined()
  })

  it('appends a relative path to the base url', async () => {
    const { requests, record } = recorder()
    server.use(
      http.patch(apiUrl('v1/thing/42/read'), ({ request }) => {
        record(request)
        return HttpResponse.json({ ok: true })
      }),
    )

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    await result.current.mutation.trigger('PATCH', undefined, '42/read')

    expect(new URL(requests[0].url).pathname).toBe('/api/v1/thing/42/read')
  })

  it('treats a leading slash as an absolute API path', async () => {
    const { requests, record } = recorder()
    server.use(
      http.post(apiUrl('v1/elsewhere'), ({ request }) => {
        record(request)
        return HttpResponse.json({ ok: true })
      }),
    )

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    await result.current.mutation.trigger('POST', {}, '/v1/elsewhere')

    expect(new URL(requests[0].url).pathname).toBe('/api/v1/elsewhere')
  })

  it('sends a GET payload as query params rather than a body', async () => {
    const { requests, record } = recorder()
    server.use(
      http.get(apiUrl('v1/thing'), ({ request }) => {
        record(request)
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    await result.current.fetch.trigger('GET', { page: 3 })

    expect(new URL(requests[0].url).search).toBe('?page=3')
  })

  it('normalises a problem response into the error field', async () => {
    server.use(http.post(apiUrl('v1/thing'), () => problemResponse(422, 'Missing field')))

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    const response = await result.current.mutation.trigger('POST', {})

    expect(response.error).toEqual({ status: 422, detail: 'Missing field' })
    expect(response.data).toBeUndefined()
  })

  it('synthesises a problem when the failure carries no problem body', async () => {
    server.use(http.post(apiUrl('v1/thing'), () => HttpResponse.error()))

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    const response = await result.current.mutation.trigger('POST', {})

    // A network-level failure still comes back shaped like a Problem, so callers
    // never have to branch on the error type.
    expect(response.error).toMatchObject({ status: expect.any(Number) })
    expect(response.error?.detail).toBeTruthy()
  })

  it('exposes the same trigger under both fetch and mutation', async () => {
    server.use(http.get(apiUrl('v1/thing'), () => HttpResponse.json(PAYLOAD)))

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    expect(result.current.fetch.trigger).toBeInstanceOf(Function)
    expect(result.current.mutation.trigger).toBeInstanceOf(Function)
  })

  it('refuses an absolute path passed to trigger, reported as a status 0 problem', async () => {
    server.use(http.post(apiUrl('v1/thing'), () => HttpResponse.json({})))

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    const response = await result.current.mutation.trigger(
      'POST',
      {},
      'https://evil.example.com/steal',
    )

    // A plain Error is not an axios error, so it comes back with status 0 —
    // callers still get a Problem shape rather than a thrown exception.
    expect(response.error).toEqual({
      status: 0,
      detail: 'Absolute URLs are not allowed in API paths',
    })
  })

  it('reports isMutating while a mutation is in flight', async () => {
    server.use(
      http.post(apiUrl('v1/thing'), async () => {
        // Comfortably longer than waitFor's polling interval.
        await delay(250)
        return HttpResponse.json({})
      }),
    )

    const { result } = renderHookWithProviders(() => useApi({ url: 'v1/thing', skipFetch: true }))

    expect(result.current.mutation.isMutating).toBe(false)
    const pending = result.current.mutation.trigger('POST', {})
    await waitFor(() => expect(result.current.mutation.isMutating).toBe(true))

    await pending
    await waitFor(() => expect(result.current.mutation.isMutating).toBe(false))
  })
})

describe('useApi caching', () => {
  it('shares one request between hooks using the same url and params', async () => {
    const state = { attempts: 0 }
    server.use(
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const { result } = renderHookWithProviders(() => ({
      a: useApi<Payload>({ url: 'v1/thing', params: { page: 1 } }),
      b: useApi<Payload>({ url: 'v1/thing', params: { page: 1 } }),
    }))

    await waitFor(() => {
      expect(result.current.a.data).toEqual(PAYLOAD)
      expect(result.current.b.data).toEqual(PAYLOAD)
    })
    expect(state.attempts).toBe(1)
  })

  it('treats different params as different cache entries', async () => {
    const state = { attempts: 0 }
    server.use(
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return HttpResponse.json(PAYLOAD)
      }),
    )

    const { result } = renderHookWithProviders(() => ({
      a: useApi<Payload>({ url: 'v1/thing', params: { page: 1 } }),
      b: useApi<Payload>({ url: 'v1/thing', params: { page: 2 } }),
    }))

    await waitFor(() => {
      expect(result.current.a.data).toEqual(PAYLOAD)
      expect(result.current.b.data).toEqual(PAYLOAD)
    })
    expect(state.attempts).toBe(2)
  })

  it('refetches on mutate', async () => {
    const state = { attempts: 0 }
    server.use(
      http.get(apiUrl('v1/thing'), () => {
        state.attempts++
        return HttpResponse.json({ value: `call ${state.attempts}` })
      }),
    )

    const { result } = renderHookWithProviders(() => useApi<Payload>({ url: 'v1/thing' }))

    await waitFor(() => expect(result.current.data).toEqual({ value: 'call 1' }))

    await result.current.mutate()

    await waitFor(() => expect(result.current.data).toEqual({ value: 'call 2' }))
  })
})

describe('useApi console noise', () => {
  it('does not log anything of its own on a handled failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(http.get(apiUrl('v1/thing'), () => problemResponse(404, 'No such thing')))

    const { result } = renderHookWithProviders(() =>
      useApi<Payload>({ url: 'v1/thing', skipRedirectOnUnauthorized: true }),
    )

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(error).not.toHaveBeenCalled()
  })
})
