import type { Category, DiscountCode } from '@mik/contracts/shop'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import DiscountCodesAdmin from './DiscountCodesAdmin'

/**
 * Another of the near-identical admin CRUD pages (#1115 §9), and the one with
 * the most conversion between form strings and API types — every numeric field
 * is a string in the form and a number (or null) in the payload.
 */
const aCode = (overrides: Partial<DiscountCode> = {}) =>
  ({
    codeId: 'code-1',
    code: 'SPRING25',
    description: 'Spring sale',
    categoryIds: [],
    discountType: 'percent',
    discountValue: 25,
    minOrderAmount: null,
    maxUses: 100,
    usesCount: 4,
    validFrom: '2025-01-01T00:00:00.000Z',
    validUntil: '2025-12-31T00:00:00.000Z',
    isActive: true,
    ...overrides,
  }) as DiscountCode

const aCategory = () =>
  ({ categoryId: 'cat-1', name: { en: 'Clothing', fi: 'Vaatteet', sv: 'Kläder' } }) as Category

const discountCodes = (codes: DiscountCode[] = [aCode()]) => {
  const state = { writes: [] as { method: string; path: string; body: unknown }[] }

  server.use(
    http.get(apiUrl('v1/shop/discount-codes'), () => HttpResponse.json(codes)),
    http.get(apiUrl('v1/shop/categories'), () => HttpResponse.json([aCategory()])),
    http.post(apiUrl('v1/shop/discount-codes'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(aCode())
    }),
    http.put(apiUrl('v1/shop/discount-codes/:id'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.id), body: await request.json() })
      return HttpResponse.json(aCode())
    }),
  )

  return state
}

const openAdd = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(await screen.findByRole('button', { name: /Add Code/ }))
  return screen.findByRole('dialog')
}

describe('DiscountCodesAdmin listing', () => {
  it('lists each code with its discount and usage', async () => {
    discountCodes()

    renderWithProviders(<DiscountCodesAdmin />)

    expect(await screen.findByText('SPRING25')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('4 / 100')).toBeInTheDocument()
  })

  it('renders a fixed discount in euros rather than percent', async () => {
    discountCodes([aCode({ discountType: 'fixed', discountValue: 10 })])

    renderWithProviders(<DiscountCodesAdmin />)

    expect(await screen.findByText('€10')).toBeInTheDocument()
  })

  it('shows an unlimited code without a usage cap', async () => {
    discountCodes([aCode({ maxUses: null, usesCount: 7 })])

    renderWithProviders(<DiscountCodesAdmin />)

    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(screen.queryByText(/7 \//)).toBeNull()
  })

  it('marks an inactive code as such', async () => {
    discountCodes([aCode({ isActive: false })])

    renderWithProviders(<DiscountCodesAdmin />)

    expect(await screen.findByText('No')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    server.use(
      http.get(apiUrl('v1/shop/discount-codes'), () => problemResponse(500, 'Down')),
      http.get(apiUrl('v1/shop/categories'), () => HttpResponse.json([aCategory()])),
    )

    renderWithProviders(<DiscountCodesAdmin />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Down')
  })
})

describe('DiscountCodesAdmin creating', () => {
  it('upper-cases the code before sending it', async () => {
    const state = discountCodes()

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await openAdd(user)

    await user.type(screen.getByRole('textbox', { name: /Code/ }), '  summer10  ')
    await user.type(screen.getByRole('spinbutton', { name: /Value/ }), '10')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ code: 'SUMMER10' })
  })

  it('converts the numeric fields and leaves the empty ones null', async () => {
    const state = discountCodes()

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await openAdd(user)

    await user.type(screen.getByRole('textbox', { name: /Code/ }), 'SUMMER10')
    await user.type(screen.getByRole('spinbutton', { name: /Value/ }), '12.5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({
      discountValue: 12.5,
      minOrderAmount: null,
      maxUses: null,
      validUntil: null,
      description: null,
    })
  })

  it('will not save without both a code and a discount value', async () => {
    // The guard matters: `Number.parseFloat('') || 0` would otherwise post a
    // zero-discount code rather than rejecting the entry.
    discountCodes()

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await openAdd(user)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: /Code/ }), 'FREEBIE')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.type(screen.getByRole('spinbutton', { name: /Value/ }), '5')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('confirms the save and closes', async () => {
    discountCodes()

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await openAdd(user)

    await user.type(screen.getByRole('textbox', { name: /Code/ }), 'SUMMER10')
    await user.type(screen.getByRole('spinbutton', { name: /Value/ }), '10')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the dialog open and reports a rejected save', async () => {
    discountCodes()
    server.use(
      http.post(apiUrl('v1/shop/discount-codes'), () => problemResponse(409, 'Code exists')),
    )

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await openAdd(user)

    await user.type(screen.getByRole('textbox', { name: /Code/ }), 'SUMMER10')
    await user.type(screen.getByRole('spinbutton', { name: /Value/ }), '10')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('DiscountCodesAdmin editing', () => {
  it('loads the code into the dialog', async () => {
    discountCodes()

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await screen.findByText('SPRING25')
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit Code' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Code/ })).toHaveValue('SPRING25')
    expect(screen.getByRole('spinbutton', { name: /Value/ })).toHaveValue(25)
    expect(screen.getByRole('spinbutton', { name: /Max uses/ })).toHaveValue(100)
  })

  it('leaves an absent minimum order amount blank rather than showing null', async () => {
    discountCodes([aCode({ minOrderAmount: null })])

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await screen.findByText('SPRING25')
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('spinbutton', { name: /Min order amount/ })).toHaveValue(null)
  })

  it('puts the change against the code it was editing', async () => {
    const state = discountCodes()

    const { user } = renderWithProviders(<DiscountCodesAdmin />)
    await screen.findByText('SPRING25')
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const value = await screen.findByRole('spinbutton', { name: /Value/ })
    await user.clear(value)
    await user.type(value, '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      path: 'code-1',
      body: { code: 'SPRING25', discountValue: 30 },
    })
  })
})
