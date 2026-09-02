import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
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

/**
 * This app's login flow is the member app's, minus the endpoints it has no
 * pages for — so it inherits #1312 too: the SWR cache holds answers given to
 * whoever was signed in before, and a sign-in has to empty it. The rule lives
 * in `@mik/ui/hooks/apiCache`; that this hook applies it is what is pinned here.
 */
describe('useAuth', () => {
  const signedInWith = (endpoint: Parameters<typeof useAuth>[0]) => {
    server.use(
      http.post(apiUrl(`auth/${endpoint}`), () => HttpResponse.json({ ok: true })),
      http.get(apiUrl('v1/thing'), () => HttpResponse.json({ value: 'ok' })),
    )

    return renderHookWithProviders(() => ({
      auth: useAuth(endpoint),
      thing: useApi<{ value: string }>({ url: 'v1/thing' }),
    }))
  }

  it('posts to the endpoint it was created for', async () => {
    const paths: string[] = []
    server.use(
      http.post(apiUrl('auth/login'), ({ request }) => {
        paths.push(new URL(request.url).pathname)
        return HttpResponse.json({ ok: true })
      }),
    )

    const { result } = renderHookWithProviders(() => useAuth('login'))
    await act(() => result.current.trigger({ email: 'k1mnimda@mik.fi' }))

    expect(paths).toEqual(['/api/auth/login'])
  })

  it.each(['login/validate', 'login/verify-code'] as const)(
    'empties the API cache after a successful %s',
    async (endpoint) => {
      const { result } = signedInWith(endpoint)

      await waitFor(() => expect(result.current.thing.data).toEqual({ value: 'ok' }))

      await act(() => result.current.auth.trigger())

      expect(result.current.thing.data).toBeUndefined()
    },
  )

  it.each(['login', 'logout'] as const)(
    'leaves the cache alone for %s, which does not start a session',
    async (endpoint) => {
      const { result } = signedInWith(endpoint)

      await waitFor(() => expect(result.current.thing.data).toEqual({ value: 'ok' }))

      await act(() => result.current.auth.trigger())

      expect(result.current.thing.data).toEqual({ value: 'ok' })
    },
  )

  it('leaves the cache alone when the code is rejected', async () => {
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
    // A caller gating a spinner or its own success state on `isMutating` must
    // not see it drop to false before `clearApiCache()` has run.
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
