import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { signInAs } from '../test/auth'
import { aMember } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useMe } from './useMe'

describe('useMe', () => {
  it('returns the signed-in member', async () => {
    const { result } = renderHookWithProviders(() => useMe())

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.me?.memberId).toBe('Matti1')
    expect(result.current.me?.firstName).toBe('Matti')
  })

  it('reflects whoever the test signs in as', async () => {
    signInAs(aMember({ memberId: 'Anna1', firstName: 'Anna', lastName: 'Aalto' }))

    const { result } = renderHookWithProviders(() => useMe())

    await waitFor(() => expect(result.current.me?.memberId).toBe('Anna1'))
  })

  it('returns no member, and does not redirect, when nobody is signed in', async () => {
    signInAs(null)

    const { result } = renderHookWithProviders(() => useMe())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.me).toBeUndefined()
  })

  it('handles the endpoint answering with an explicit null member', async () => {
    server.use(http.get(apiUrl('v1/members/me'), () => HttpResponse.json(null)))

    const { result } = renderHookWithProviders(() => useMe())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.me).toBeNull()
  })

  it('re-reads the profile when mutate is called', async () => {
    let mustUpdateProfile = false
    server.use(
      http.get(apiUrl('v1/members/me'), () => HttpResponse.json(aMember({ mustUpdateProfile }))),
    )

    const { result } = renderHookWithProviders(() => useMe())

    await waitFor(() => expect(result.current.me?.mustUpdateProfile).toBe(false))

    // An admin sets the flag while the tab is open.
    mustUpdateProfile = true
    await result.current.mutate()

    await waitFor(() => expect(result.current.me?.mustUpdateProfile).toBe(true))
  })

  it('surfaces no member when the profile endpoint fails outright', async () => {
    server.use(http.get(apiUrl('v1/members/me'), () => problemResponse(500, 'Database down')))

    const { result } = renderHookWithProviders(() => useMe())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.me).toBeUndefined()
  })
})
