import type { Category, Product } from '@mik/contracts/shop'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import ProductsAdmin from './ProductsAdmin'

/**
 * The shop product admin page (#1115 §9). Products carry localised name and
 * description objects, so the interesting behaviour is the form ⇄ payload
 * translation in `productToForm`/`formToPayload` — everything the admin types
 * is a string, and the payload has to come back out as numbers, nulls and
 * trimmed tag arrays.
 */
const aProduct = (overrides: Partial<Product> = {}) =>
  ({
    productId: 'prod-1',
    name: { en: 'Club cap', fi: 'Lippalakki', sv: 'Keps' },
    description: { en: 'Navy cap', fi: '', sv: '' },
    categoryId: 'cat-1',
    price: 25,
    stockQuantity: 12,
    lowStockThreshold: 5,
    maxOrderQuantity: null,
    imageUrl: null,
    tags: ['clothing'],
    isActive: true,
    isPublished: true,
    productType: 'STANDARD',
    hasOrders: false,
    ...overrides,
  }) as Product

const aCategory = (overrides: Partial<Category> = {}) =>
  ({
    categoryId: 'cat-1',
    name: { en: 'Merchandise', fi: 'Tuotteet', sv: 'Varor' },
    ...overrides,
  }) as Category

type Write = { method: string; id: string; body: Record<string, unknown> | null }

const shopApi = (products: Product[] = [aProduct()], categories: Category[] = [aCategory()]) => {
  const state = { writes: [] as Write[], listRequests: [] as URL[] }

  server.use(
    http.get(apiUrl('v1/shop/products'), ({ request }) => {
      state.listRequests.push(new URL(request.url))
      return HttpResponse.json(products)
    }),
    http.get(apiUrl('v1/shop/categories'), () => HttpResponse.json(categories)),
    http.get(apiUrl('v1/shop/simplbooks-items'), () =>
      HttpResponse.json([{ code: 'SB-1', name: 'Merch sales' }]),
    ),
    http.post(apiUrl('v1/shop/products'), async ({ request }) => {
      state.writes.push({
        method: 'POST',
        id: '',
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json(aProduct({ productId: 'prod-new' }))
    }),
    http.put(apiUrl('v1/shop/products/:id'), async ({ request, params }) => {
      state.writes.push({
        method: 'PUT',
        id: String(params.id),
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json(aProduct())
    }),
    http.delete(apiUrl('v1/shop/products/:id'), ({ params }) => {
      state.writes.push({ method: 'DELETE', id: String(params.id), body: null })
      return HttpResponse.json({})
    }),
  )

  return state
}

const nameField = (lang: 'EN' | 'FI' | 'SV' = 'EN') =>
  screen.getByRole('textbox', { name: `Name (${lang})` })

const openCreate = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Add Product' }))
  return screen.findByRole('dialog')
}

/** Fills the three fields the Save button gates on. */
const fillRequired = async (
  user: ReturnType<typeof renderWithProviders>['user'],
  name = 'Windsock',
) => {
  await user.type(nameField(), name)
  await user.click(screen.getByRole('combobox', { name: 'Category *' }))
  await user.click(await screen.findByRole('option', { name: 'Merchandise' }))
  await user.type(screen.getByRole('spinbutton', { name: 'Price' }), '42.50')
}

describe('ProductsAdmin listing', () => {
  it('lists products with their English name, category and price', async () => {
    shopApi()

    renderWithProviders(<ProductsAdmin />)

    const row = (await screen.findByText('Club cap')).closest('tr')!
    expect(within(row).getByText('Merchandise')).toBeInTheDocument()
    expect(within(row).getByText('€25.00')).toBeInTheDocument()
  })

  it('flags stock that has run out', async () => {
    shopApi([aProduct({ stockQuantity: 0 })])

    renderWithProviders(<ProductsAdmin />)

    expect(await screen.findByText('Out of stock')).toBeInTheDocument()
  })

  it('warns on stock at or below the low-stock threshold', async () => {
    shopApi([aProduct({ stockQuantity: 5, lowStockThreshold: 5 })])

    renderWithProviders(<ProductsAdmin />)

    const chip = (await screen.findByText('5')).closest('.MuiChip-root')
    expect(chip).toHaveClass('MuiChip-colorWarning')
  })

  it('falls back to a threshold of 5 when the product sets none', async () => {
    shopApi([aProduct({ stockQuantity: 4, lowStockThreshold: null })])

    renderWithProviders(<ProductsAdmin />)

    const chip = (await screen.findByText('4')).closest('.MuiChip-root')
    expect(chip).toHaveClass('MuiChip-colorWarning')
  })

  it('distinguishes published products from drafts', async () => {
    shopApi([aProduct({ isPublished: false })])

    renderWithProviders(<ProductsAdmin />)

    expect(await screen.findByText('Draft')).toBeInTheDocument()
  })

  it('reports a failed load instead of an empty table', async () => {
    shopApi()
    server.use(http.get(apiUrl('v1/shop/products'), () => problemResponse(500, 'Shop is down')))

    renderWithProviders(<ProductsAdmin />)

    expect(await screen.findByText(/Shop is down/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('falls back to the raw category id when the category is missing', async () => {
    shopApi([aProduct({ categoryId: 'cat-gone' })], [])

    renderWithProviders(<ProductsAdmin />)

    expect(await screen.findByText('cat-gone')).toBeInTheDocument()
  })
})

describe('ProductsAdmin filtering', () => {
  it('asks the API for the admin view rather than filtering client-side', async () => {
    const state = shopApi()

    renderWithProviders(<ProductsAdmin />)
    await screen.findByText('Club cap')

    expect(state.listRequests[0].searchParams.get('adminView')).toBe('true')
  })

  it('sends the chosen category as a query parameter', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await screen.findByText('Club cap')

    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.click(await screen.findByRole('option', { name: 'Merchandise' }))

    await waitFor(() =>
      expect(state.listRequests.at(-1)!.searchParams.get('categoryId')).toBe('cat-1'),
    )
  })

  it('sends published as a boolean, not the string from the select', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await screen.findByText('Club cap')

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Draft' }))

    await waitFor(() =>
      expect(state.listRequests.at(-1)!.searchParams.get('published')).toBe('false'),
    )
  })

  it('drops the filter again when the admin picks All', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await screen.findByText('Club cap')

    await user.click(screen.getByRole('combobox', { name: 'Active' }))
    await user.click(await screen.findByRole('option', { name: 'Inactive' }))
    await waitFor(() => expect(state.listRequests.at(-1)!.searchParams.get('active')).toBe('false'))

    await user.click(screen.getByRole('combobox', { name: 'Active' }))
    await user.click(await screen.findByRole('option', { name: 'All' }))

    await waitFor(() => expect(state.listRequests.at(-1)!.searchParams.has('active')).toBe(false))
  })
})

describe('ProductsAdmin creating', () => {
  it('opens an empty dialog', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    expect(nameField()).toHaveValue('')
    expect(screen.getByRole('spinbutton', { name: 'Price' })).toHaveValue(null)
  })

  it('will not save until name, category and price are all given', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)
    const save = screen.getByRole('button', { name: 'Save' })

    expect(save).toBeDisabled()

    await user.type(nameField(), 'Windsock')
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('combobox', { name: 'Category *' }))
    await user.click(await screen.findByRole('option', { name: 'Merchandise' }))
    expect(save).toBeDisabled()

    await user.type(screen.getByRole('spinbutton', { name: 'Price' }), '42.50')
    expect(save).toBeEnabled()
  })

  it('treats a name of only spaces as missing', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    await user.type(nameField(), '   ')
    await user.click(screen.getByRole('combobox', { name: 'Category *' }))
    await user.click(await screen.findByRole('option', { name: 'Merchandise' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Price' }), '42.50')

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('posts the localised name and numeric price', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    await fillRequired(user)
    await user.type(nameField('FI'), 'Tuulipussi')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: {
        name: { en: 'Windsock', fi: 'Tuulipussi', sv: '' },
        categoryId: 'cat-1',
        price: 42.5,
        productType: 'STANDARD',
      },
    })
  })

  it('sends the optional numeric fields as null rather than 0 when left blank', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({
      lowStockThreshold: null,
      maxOrderQuantity: null,
      imageUrl: null,
      simplbooksItemId: null,
      stockQuantity: 0,
      tags: [],
    })
  })

  it('splits the tag list on commas and trims each tag', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    await fillRequired(user)
    await user.type(screen.getByRole('textbox', { name: 'Tags' }), ' clothing , outdoor ,, ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body!.tags).toEqual(['clothing', 'outdoor'])
  })

  it('sends the SimplBooks item the admin picked, by code', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    await fillRequired(user)
    await user.click(screen.getByRole('combobox', { name: 'SimplBooks Item ID' }))
    await user.click(await screen.findByRole('option', { name: 'Merch sales (SB-1)' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ simplbooksItemId: 'SB-1' })
  })

  it('reports a rejected save and keeps the dialog open so nothing is retyped', async () => {
    shopApi()
    server.use(http.post(apiUrl('v1/shop/products'), () => problemResponse(409, 'Duplicate')))

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(nameField()).toHaveValue('Windsock')
  })

  it('abandons the entry on cancel', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.writes).toHaveLength(0)
  })
})

describe('ProductsAdmin editing', () => {
  it('pre-fills every language of the product', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit Club cap' }))

    await screen.findByRole('dialog')
    expect(nameField()).toHaveValue('Club cap')
    expect(nameField('FI')).toHaveValue('Lippalakki')
    expect(nameField('SV')).toHaveValue('Keps')
    expect(screen.getByRole('textbox', { name: 'Description (EN)' })).toHaveValue('Navy cap')
  })

  it('pre-fills the numbers as strings the admin can edit', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit Club cap' }))

    await screen.findByRole('dialog')
    expect(screen.getByRole('spinbutton', { name: 'Price' })).toHaveValue(25)
    expect(screen.getByRole('spinbutton', { name: 'Stock' })).toHaveValue(12)
    expect(screen.getByRole('spinbutton', { name: 'Low stock threshold' })).toHaveValue(5)
    // Null on the product, so blank in the form rather than a literal "null".
    expect(screen.getByRole('spinbutton', { name: 'Max per member' })).toHaveValue(null)
  })

  it('puts the change against the product it was editing', async () => {
    const state = shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit Club cap' }))
    await screen.findByRole('dialog')

    await user.clear(nameField())
    await user.type(nameField(), 'Club cap v2')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      id: 'prod-1',
      body: { name: { en: 'Club cap v2', fi: 'Lippalakki', sv: 'Keps' } },
    })
  })

  it('keeps the product type it already had rather than resetting it to STANDARD', async () => {
    const state = shopApi([aProduct({ productType: 'MEMBERSHIP' as Product['productType'] })])

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit Club cap' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ productType: 'MEMBERSHIP' })
  })

  it('closes the dialog and confirms once the save succeeds', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit Club cap' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('starts a fresh entry afterwards rather than reusing the last product', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit Club cap' }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await openCreate(user)

    expect(nameField()).toHaveValue('')
  })

  it('offers the variants tab only when editing an existing product', async () => {
    shopApi()

    const { user } = renderWithProviders(<ProductsAdmin />)
    await openCreate(user)
    expect(screen.queryByRole('tab', { name: 'Variants' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Edit Club cap' }))
    expect(await screen.findByRole('tab', { name: 'Variants' })).toBeInTheDocument()
  })

  it('sends flight-hour packages to their own admin page instead of editing them here', async () => {
    shopApi([aProduct({ productType: 'FLIGHT_HOURS_PACKAGE' as Product['productType'] })])

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit Club cap' }))

    await screen.findByRole('dialog')
    expect(screen.getByText(/Flight packages cannot be edited here/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to Flight Packages' })).toHaveAttribute(
      'href',
      '/admin/shop/flight-packages',
    )
  })
})

describe('ProductsAdmin deleting', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('asks for confirmation before deleting', async () => {
    const state = shopApi()
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Delete Club cap' }))

    expect(confirm).toHaveBeenCalled()
    expect(state.writes).toHaveLength(0)
  })

  it('deletes the product once confirmed', async () => {
    const state = shopApi()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Delete Club cap' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'DELETE', id: 'prod-1' })
    expect(await screen.findByText('Deleted')).toBeInTheDocument()
  })

  it('reports a rejected delete', async () => {
    shopApi()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    server.use(http.delete(apiUrl('v1/shop/products/:id'), () => problemResponse(409, 'In use')))

    const { user } = renderWithProviders(<ProductsAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Delete Club cap' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
  })

  it('will not let a product that has orders be deleted at all', async () => {
    shopApi([aProduct({ hasOrders: true })])

    renderWithProviders(<ProductsAdmin />)

    expect(await screen.findByRole('button', { name: 'Delete Club cap' })).toBeDisabled()
  })
})
