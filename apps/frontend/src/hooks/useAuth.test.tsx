import { act, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import useApi from '@mik/ui/hooks/useApi'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useAuth } from './useAuth'

/**
 * A gate on top of the real `clearApiCache()`, so the one test below that
 * needs the clear to still be pending at a specific moment doesn't have to
 * race real timers against it — `useClearApiCache` normally does no I/O at
 * all, so there is no other way to hold it open on demand. Every other test
 * in this file leaves the gate open (already resolved), so the real clear
 * still runs and still empties the cache exactly as before.
 */
const clearApiCacheGate = vi.hoisted(() => ({
  promise: Promise.resolve() as Promise<void>,
}))

vi.mock('@mik/ui/hooks/apiCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mik/ui/hooks/apiCache')>()
  return {
    ...actual,
    useClearApiCache: () => {
      const realClear = actual.useClearApiCache()
      return async () => {
        await realClear()
        await clearApiCacheGate.promise
      }
    },
  }
})

describe('useAuth', () => {
  it('posts the request to the endpoint it was created for', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(apiUrl('auth/login'), async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ sent: true })
      }),
    )

    const { result } = renderHookWithProviders(() =>
      useAuth<{ email: string }, { sent: boolean }>('login'),
    )

    const response = await result.current.trigger({ email: 'matti@example.com' })

    expect(bodies).toEqual([{ email: 'matti@example.com' }])
    expect(response.data).toEqual({ sent: true })
  })

  it.each([
    'login/validate',
    'login/verify-code',
    'register',
    'register/verify',
    'logout',
  ] as const)('targets auth/%s', async (endpoint) => {
    const paths: string[] = []
    server.use(
      http.post(apiUrl(`auth/${endpoint}`), ({ request }) => {
        paths.push(new URL(request.url).pathname)
        return HttpResponse.json({ ok: true })
      }),
    )

    const { result } = renderHookWithProviders(() => useAuth(endpoint))
    await result.current.trigger()

    expect(paths).toEqual([`/api/auth/${endpoint}`])
  })

  it('works without a payload, as logout needs', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(apiUrl('auth/logout'), async ({ request }) => {
        bodies.push(await request.text())
        return HttpResponse.json({ ok: true })
      }),
    )

    const { result } = renderHookWithProviders(() => useAuth('logout'))
    const response = await result.current.trigger()

    expect(bodies).toEqual([''])
    expect(response.error).toBeUndefined()
  })

  it('returns the problem body when the credentials are rejected', async () => {
    server.use(http.post(apiUrl('auth/login'), () => problemResponse(401, 'Unknown email')))

    const { result } = renderHookWithProviders(() => useAuth('login'))

    const response = await result.current.trigger({})

    expect(response.error).toEqual({ status: 401, detail: 'Unknown email' })
    expect(response.data).toBeUndefined()
  })

  it('does not attempt a token refresh on a 401 — there is no session yet', async () => {
    const state = { refreshes: 0, attempts: 0 }
    server.use(
      http.post(apiUrl('auth/refresh'), () => {
        state.refreshes++
        return HttpResponse.json({})
      }),
      http.post(apiUrl('auth/login'), () => {
        state.attempts++
        return problemResponse(401, 'Unknown email')
      }),
    )

    const { result } = renderHookWithProviders(() => useAuth('login'))
    await result.current.trigger({})

    expect(state.refreshes).toBe(0)
    expect(state.attempts).toBe(1)
  })

  it('reports isMutating while the request is in flight', async () => {
    server.use(
      http.post(apiUrl('auth/login'), async () => {
        await delay(250)
        return HttpResponse.json({ sent: true })
      }),
    )

    const { result } = renderHookWithProviders(() => useAuth('login'))

    expect(result.current.isMutating).toBe(false)
    const pending = result.current.trigger({})
    await waitFor(() => expect(result.current.isMutating).toBe(true))

    await pending
    await waitFor(() => expect(result.current.isMutating).toBe(false))
  })

  it('never fetches on mount — it is trigger-only', async () => {
    const state = { calls: 0 }
    server.use(
      http.get(apiUrl('auth/login'), () => {
        state.calls++
        return HttpResponse.json({})
      }),
    )

    const { result } = renderHookWithProviders(() => useAuth('login'))

    await waitFor(() => expect(result.current.isMutating).toBe(false))
    expect(state.calls).toBe(0)
  })
})

/**
 * A sign-in makes every cached response wrong: they were all answers given to
 * whoever was signed in before, this member's own 401s from before they signed
 * in included. #1312 is what that costs when it is left in place — the header's
 * roles call read a cached 401 and bounced the member back to the login page —
 * so `useAuth` empties the cache on the way through. The rule itself lives in
 * `@mik/ui/hooks/apiCache`; what is pinned here is that this hook applies it.
 */
describe('useAuth cache invalidation', () => {
  /** A verified session plus one cached response, so the clear is observable. */
  const signedInWith = (endpoint: string) => {
    server.use(
      http.post(apiUrl(`auth/${endpoint}`), () => HttpResponse.json({ ok: true })),
      http.get(apiUrl('v1/thing'), () => HttpResponse.json({ value: 'ok' })),
    )

    return renderHookWithProviders(() => ({
      auth: useAuth(endpoint as Parameters<typeof useAuth>[0]),
      thing: useApi<{ value: string }>({ url: 'v1/thing' }),
    }))
  }

  it.each(['login/validate', 'login/verify-code', 'register/verify'])(
    'empties the API cache after a successful %s',
    async (endpoint) => {
      const { result } = signedInWith(endpoint)

      await waitFor(() => expect(result.current.thing.data).toEqual({ value: 'ok' }))

      await act(() => result.current.auth.trigger())

      expect(result.current.thing.data).toBeUndefined()
    },
  )

  it.each(['login', 'register', 'logout', 'contact'])(
    'leaves the cache alone for %s, which does not start a session',
    async (endpoint) => {
      const { result } = signedInWith(endpoint)

      await waitFor(() => expect(result.current.thing.data).toEqual({ value: 'ok' }))

      await act(() => result.current.auth.trigger())

      expect(result.current.thing.data).toEqual({ value: 'ok' })
    },
  )

  it('leaves the cache alone when the code is rejected', async () => {
    // Nothing has changed hands on a failed verification, and clearing anyway
    // would blank the page behind a mistyped code.
    server.use(
      http.post(apiUrl('auth/login/verify-code'), () => problemResponse(401, 'Invalid code')),
      http.get(apiUrl('v1/thing'), () => HttpResponse.json({ value: 'ok' })),
    )

    const { result } = renderHookWithProviders(() => ({
      auth: useAuth('login/verify-code'),
      thing: useApi<{ value: string }>({ url: 'v1/thing' }),
    }))

    await waitFor(() => expect(result.current.thing.data).toEqual({ value: 'ok' }))

    await act(() => result.current.auth.trigger())

    expect(result.current.thing.data).toEqual({ value: 'ok' })
  })

  it('keeps isMutating true through the cache clear, not just the POST', async () => {
    // A caller gating a spinner or its own success state on `isMutating`
    // (Sent.tsx, Validate.tsx, RegistrationVerify.tsx) must not see it drop to
    // false before `clearApiCache()` has run — RegistrationVerify.tsx in
    // particular falls through to rendering nothing in that gap, since its own
    // success state is only set once `trigger()`'s returned promise resolves.
    // `mutation.isMutating` alone would already be false by then; only the
    // combined flag this hook returns spans the whole thing. The gate below
    // holds the (real) cache clear open so that gap is observable on demand
    // rather than racing a microtask.
    server.use(http.post(apiUrl('auth/login/verify-code'), () => HttpResponse.json({ ok: true })))

    let openGate: () => void = () => {}
    clearApiCacheGate.promise = new Promise((resolve) => {
      openGate = resolve
    })

    const { result } = renderHookWithProviders(() => useAuth('login/verify-code'))

    const pending = result.current.trigger()

    // The POST has settled and the (real) cache clear has run — the state a
    // bare `mutation.isMutating` would already report as "done" — but the
    // gate is still shut, so `trigger()` itself has not resolved yet.
    await waitFor(() => expect(result.current.isMutating).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(result.current.isMutating).toBe(true)

    openGate()
    await act(() => pending)
    expect(result.current.isMutating).toBe(false)
  })
})
