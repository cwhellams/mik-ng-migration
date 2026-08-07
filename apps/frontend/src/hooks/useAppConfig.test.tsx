import type { AppConfig } from '@backend/routes/config/models'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useAppConfig } from './useAppConfig'

describe('useAppConfig', () => {
  it('reports loading before the config arrives', () => {
    const { result } = renderHookWithProviders(() => useAppConfig())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.config).toBeUndefined()
  })

  it('returns the server-side feature flags', async () => {
    server.use(
      http.get(apiUrl('v1/config'), () =>
        HttpResponse.json<AppConfig>({ medicalCheckEnabled: true }),
      ),
    )

    const { result } = renderHookWithProviders(() => useAppConfig())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.config).toEqual({ medicalCheckEnabled: true })
  })

  it('leaves the config undefined when the endpoint fails', async () => {
    server.use(http.get(apiUrl('v1/config'), () => problemResponse(500, 'Config unavailable')))

    const { result } = renderHookWithProviders(() => useAppConfig())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Callers must treat a missing config as "flag off" rather than crashing.
    expect(result.current.config).toBeUndefined()
  })

  it('fetches once and shares the result between call sites', async () => {
    const state = { calls: 0 }
    server.use(
      http.get(apiUrl('v1/config'), () => {
        state.calls++
        return HttpResponse.json<AppConfig>({ medicalCheckEnabled: false })
      }),
    )

    const { result } = renderHookWithProviders(() => ({
      a: useAppConfig(),
      b: useAppConfig(),
    }))

    await waitFor(() => expect(result.current.a.config).toBeDefined())
    expect(result.current.b.config).toEqual(result.current.a.config)
    expect(state.calls).toBe(1)
  })
})
