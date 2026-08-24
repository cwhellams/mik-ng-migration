import type { UsefulPhoneNumber } from '@mik/contracts/useful-phone-numbers'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import UsefulPhoneNumbersAdminPage from './UsefulPhoneNumbersAdminPage'

/**
 * An admin CRUD page with an inline form rather than a dialog — one of the
 * shapes #1115 §9 wants folded into a shared `<CrudPage>`. Notably it calls the
 * shared axios instance directly instead of going through `useApi`'s mutation,
 * so its errors arrive as thrown axios errors rather than `{ error }` results.
 */
const aNumber = (overrides: Partial<UsefulPhoneNumber> = {}) =>
  ({
    label: 'FLIGHT_PLAN_CENTER',
    phoneNumber: '+358295350500',
    sortOrder: 1,
    ...overrides,
  }) as UsefulPhoneNumber

const phoneNumbers = (numbers: UsefulPhoneNumber[] = [aNumber()]) => {
  const state = { numbers, writes: [] as { method: string; path: string; body: unknown }[] }

  server.use(
    http.get(apiUrl('v1/useful-phone-numbers'), () => HttpResponse.json(state.numbers)),
    http.post(apiUrl('v1/useful-phone-numbers'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(aNumber())
    }),
    http.put(apiUrl('v1/useful-phone-numbers/:label'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.label), body: await request.json() })
      return HttpResponse.json(aNumber())
    }),
    http.delete(apiUrl('v1/useful-phone-numbers/:label'), ({ params }) => {
      state.writes.push({ method: 'DELETE', path: String(params.label), body: null })
      state.numbers = state.numbers.filter((n) => n.label !== params.label)
      return HttpResponse.json({ ok: true })
    }),
  )

  return state
}

afterEach(() => vi.restoreAllMocks())

describe('UsefulPhoneNumbersAdminPage listing', () => {
  it('lists the configured numbers', async () => {
    phoneNumbers()

    renderWithProviders(<UsefulPhoneNumbersAdminPage />)

    expect(await screen.findByText('FLIGHT_PLAN_CENTER')).toBeInTheDocument()
    expect(screen.getByText('+358295350500')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    server.use(http.get(apiUrl('v1/useful-phone-numbers'), () => problemResponse(500, 'Down')))

    renderWithProviders(<UsefulPhoneNumbersAdminPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Down')
  })
})

describe('UsefulPhoneNumbersAdminPage creating', () => {
  it('posts a new number with its label and sort order', async () => {
    const state = phoneNumbers()

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)

    await user.type(await screen.findByRole('textbox', { name: /Label/ }), 'TOWER')
    await user.type(screen.getByRole('textbox', { name: /Phone number/ }), '+358123456')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: { label: 'TOWER', phoneNumber: '+358123456', sortOrder: 0 },
    })
  })

  it('trims what was typed before sending it', async () => {
    const state = phoneNumbers()

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)

    await user.type(await screen.findByRole('textbox', { name: /Label/ }), '  TOWER  ')
    await user.type(screen.getByRole('textbox', { name: /Phone number/ }), '  +358123456  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ label: 'TOWER', phoneNumber: '+358123456' })
  })

  it('confirms the save and clears the form for the next entry', async () => {
    phoneNumbers()

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)

    await user.type(await screen.findByRole('textbox', { name: /Label/ }), 'TOWER')
    await user.type(screen.getByRole('textbox', { name: /Phone number/ }), '+358123456')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Phone number saved.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Label/ })).toHaveValue(''))
  })

  it('reports the server’s own message when the save is rejected', async () => {
    phoneNumbers()
    server.use(
      http.post(apiUrl('v1/useful-phone-numbers'), () =>
        problemResponse(409, 'Label already used'),
      ),
    )

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)

    await user.type(await screen.findByRole('textbox', { name: /Label/ }), 'TOWER')
    await user.type(screen.getByRole('textbox', { name: /Phone number/ }), '+358123456')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Label already used')).toBeInTheDocument()
    // The entry survives so it can be corrected rather than retyped.
    expect(screen.getByRole('textbox', { name: /Label/ })).toHaveValue('TOWER')
  })
})

describe('UsefulPhoneNumbersAdminPage editing', () => {
  it('loads the row into the form', async () => {
    phoneNumbers()

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('textbox', { name: /Label/ })).toHaveValue('FLIGHT_PLAN_CENTER')
    expect(screen.getByRole('textbox', { name: /Phone number/ })).toHaveValue('+358295350500')
  })

  it('puts the change against the original label', async () => {
    const state = phoneNumbers()

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    const phone = screen.getByRole('textbox', { name: /Phone number/ })
    await user.clear(phone)
    await user.type(phone, '+358999')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      path: 'FLIGHT_PLAN_CENTER',
      body: { phoneNumber: '+358999' },
    })
  })

  it('offers a cancel that returns to a blank form', async () => {
    phoneNumbers()

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('textbox', { name: /Label/ })).toHaveValue('')
  })
})

describe('UsefulPhoneNumbersAdminPage deleting', () => {
  it('asks before deleting, naming the row', async () => {
    const state = phoneNumbers()
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith('Delete phone number FLIGHT_PLAN_CENTER?')
    expect(state.writes).toHaveLength(0)
  })

  it('deletes once confirmed and refreshes the list', async () => {
    const state = phoneNumbers()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'DELETE', path: 'FLIGHT_PLAN_CENTER' })
    await waitFor(() => expect(screen.queryByText('FLIGHT_PLAN_CENTER')).toBeNull())
  })

  it('reports a failed delete', async () => {
    phoneNumbers()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    server.use(
      http.delete(apiUrl('v1/useful-phone-numbers/:label'), () => problemResponse(409, 'In use')),
    )

    const { user } = renderWithProviders(<UsefulPhoneNumbersAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('In use')).toBeInTheDocument()
  })
})
