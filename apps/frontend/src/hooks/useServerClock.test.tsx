import type { TimeResponse } from '@backend/routes/time/api'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { ServerClockProvider, useServerClock } from './useServerClock'

const LOCAL_NOW = Date.parse('2025-06-02T09:00:00Z')

afterEach(() => vi.useRealTimers())

/** Answers /v1/time as if the server clock were `skewMs` ahead of the local one. */
const serverAhead = (skewMs: number) => {
  const state = { syncs: 0 }
  server.use(
    http.get(apiUrl('v1/time'), () => {
      state.syncs++
      const epochMs = Date.now() + skewMs
      return HttpResponse.json<TimeResponse>({
        utcIso: new Date(epochMs).toISOString(),
        epochMs,
      })
    }),
  )
  return state
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ServerClockProvider>{children}</ServerClockProvider>
)

const renderClock = () => renderHook(() => useServerClock(), { wrapper })

describe('useServerClock without a provider', () => {
  it('falls back to a static local time rather than throwing', () => {
    const { result } = renderHook(() => useServerClock())

    expect(result.current.synced).toBe(false)
    expect(result.current.skewed).toBe(false)
    expect(typeof result.current.utcMs).toBe('number')
  })
})

describe('useServerClock syncing', () => {
  it('starts unsynced and becomes synced once the server answers', async () => {
    serverAhead(0)

    const { result } = renderClock()

    expect(result.current.synced).toBe(false)
    await waitFor(() => expect(result.current.synced).toBe(true))
    expect(result.current.skewed).toBe(false)
  })

  it('measures a small offset without flagging skew', async () => {
    serverAhead(30_000)

    const { result } = renderClock()

    await waitFor(() => expect(result.current.synced).toBe(true))
    expect(result.current.skewMs).toBeGreaterThan(25_000)
    expect(result.current.skewed).toBe(false)
  })

  it('flags a local clock that is more than five minutes behind', async () => {
    serverAhead(10 * 60_000)

    const { result } = renderClock()

    await waitFor(() => expect(result.current.skewed).toBe(true))
    expect(result.current.skewMs).toBeGreaterThan(0)
  })

  it('flags a local clock that is more than five minutes ahead', async () => {
    serverAhead(-10 * 60_000)

    const { result } = renderClock()

    await waitFor(() => expect(result.current.skewed).toBe(true))
    expect(result.current.skewMs).toBeLessThan(0)
  })

  it('stays unsynced and unskewed when the endpoint fails', async () => {
    server.use(http.get(apiUrl('v1/time'), () => problemResponse(503, 'Unavailable')))

    const { result } = renderClock()

    // Ticking continues from the local clock; the app must not stall on this.
    await waitFor(() => expect(result.current.utcMs).toBeGreaterThan(0))
    expect(result.current.synced).toBe(false)
    expect(result.current.skewed).toBe(false)
  })

  it('survives a network failure without throwing', async () => {
    server.use(http.get(apiUrl('v1/time'), () => HttpResponse.error()))

    const { result } = renderClock()

    await waitFor(() => expect(result.current.utcMs).toBeGreaterThan(0))
    expect(result.current.synced).toBe(false)
  })
})

describe('useServerClock ticking', () => {
  it('advances every second, corrected by the measured offset', async () => {
    vi.useFakeTimers({ now: LOCAL_NOW })
    serverAhead(60_000)

    const { result } = renderClock()

    // Let the initial sync settle while the fake clock is held still.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await vi.waitFor(() => expect(result.current.synced).toBe(true))

    // The context's default utcMs is captured when the module is first imported,
    // so read a real tick before measuring rather than that stale value.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    const before = result.current.utcMs

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(result.current.utcMs - before).toBeGreaterThanOrEqual(3_000)
    // The reported time is the local clock plus the server offset.
    expect(result.current.utcMs).toBeGreaterThan(LOCAL_NOW + 60_000)
  })

  it('re-syncs with the server every five minutes', async () => {
    vi.useFakeTimers({ now: LOCAL_NOW })
    const state = serverAhead(0)

    renderClock()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await vi.waitFor(() => expect(state.syncs).toBe(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    await vi.waitFor(() => expect(state.syncs).toBe(2))
  })

  it('stops ticking once unmounted', async () => {
    vi.useFakeTimers({ now: LOCAL_NOW })
    serverAhead(0)

    const { result, unmount } = renderClock()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    const lastValue = result.current.utcMs

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(result.current.utcMs).toBe(lastValue)
  })
})
