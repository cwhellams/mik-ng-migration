import { waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useAuth } from './useAuth'

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
