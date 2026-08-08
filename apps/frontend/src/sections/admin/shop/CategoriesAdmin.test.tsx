import type { Category } from '@backend/routes/shop/models'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { renderWithProviders } from '../../../test/renderWithProviders'
import CategoriesAdmin from './CategoriesAdmin'

/**
 * One of the ~10 near-identical admin CRUD pages #1115 §9 proposes replacing
 * with a shared `<CrudPage>`. Tested first, deliberately: this is the safety net
 * that refactor needs (issue #1116, Q5 — "test first").
 */
const aCategory = (overrides: Partial<Category> = {}) =>
  ({
    categoryId: 'cat-1',
    name: { en: 'Clothing', fi: 'Vaatteet', sv: 'Kläder' },
    description: { en: 'Club wear', fi: 'Seuravaatteet', sv: 'Klubbkläder' },
    ...overrides,
  }) as Category

/** Serves the list and records every write, so payloads can be asserted. */
const shopCategories = (categories: Category[] = [aCategory()]) => {
  const state = {
    categories,
    writes: [] as { method: string; path: string; body: unknown }[],
  }

  server.use(
    http.get(apiUrl('v1/shop/categories'), () => HttpResponse.json(state.categories)),
    http.post(apiUrl('v1/shop/categories'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(aCategory({ categoryId: 'cat-new' }))
    }),
    http.put(apiUrl('v1/shop/categories/:id'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.id), body: await request.json() })
      return HttpResponse.json(aCategory())
    }),
    http.delete(apiUrl('v1/shop/categories/:id'), ({ params }) => {
      state.writes.push({ method: 'DELETE', path: String(params.id), body: null })
      state.categories = state.categories.filter((c) => c.categoryId !== params.id)
      return HttpResponse.json({ ok: true })
    }),
  )

  return state
}

const openDialog = async (user: ReturnType<typeof renderWithProviders>['user'], name: RegExp) => {
  await user.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

afterEach(() => vi.restoreAllMocks())

describe('CategoriesAdmin listing', () => {
  it('lists each category in all three languages', async () => {
    shopCategories()

    renderWithProviders(<CategoriesAdmin />)

    expect(await screen.findByText('Clothing')).toBeInTheDocument()
    expect(screen.getByText('Vaatteet')).toBeInTheDocument()
    expect(screen.getByText('Kläder')).toBeInTheDocument()
  })

  it('renders an empty table when there is nothing yet', async () => {
    shopCategories([])

    renderWithProviders(<CategoriesAdmin />)

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.queryByText('Clothing')).toBeNull()
  })

  it('reports a failed load instead of an empty table', async () => {
    server.use(http.get(apiUrl('v1/shop/categories'), () => problemResponse(500, 'Database down')))

    renderWithProviders(<CategoriesAdmin />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Database down')
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('CategoriesAdmin creating', () => {
  it('opens an empty dialog from Add Category', async () => {
    shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await openDialog(user, /Add Category/)

    expect(screen.getByRole('heading', { name: 'Add Category' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name \(EN\)/ })).toHaveValue('')
  })

  it('will not save without an English name', async () => {
    shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await openDialog(user, /Add Category/)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('treats a name of only spaces as missing', async () => {
    shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await openDialog(user, /Add Category/)
    await user.type(screen.getByRole('textbox', { name: /Name \(EN\)/ }), '   ')

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('posts every language it was given', async () => {
    const state = shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await openDialog(user, /Add Category/)

    await user.type(screen.getByRole('textbox', { name: /Name \(EN\)/ }), 'Books')
    await user.type(screen.getByRole('textbox', { name: /Name \(FI\)/ }), 'Kirjat')
    await user.type(screen.getByRole('textbox', { name: /Name \(SV\)/ }), 'Böcker')
    await user.type(screen.getByRole('textbox', { name: /Description \(EN\)/ }), 'Manuals')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: {
        name: { en: 'Books', fi: 'Kirjat', sv: 'Böcker' },
        description: { en: 'Manuals', fi: '', sv: '' },
      },
    })
  })

  it('confirms the save and closes the dialog', async () => {
    shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await openDialog(user, /Add Category/)
    await user.type(screen.getByRole('textbox', { name: /Name \(EN\)/ }), 'Books')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the dialog open and reports the problem when saving fails', async () => {
    shopCategories()
    server.use(http.post(apiUrl('v1/shop/categories'), () => problemResponse(409, 'Duplicate')))

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await openDialog(user, /Add Category/)
    await user.type(screen.getByRole('textbox', { name: /Name \(EN\)/ }), 'Books')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    // The user's typing must survive a failed save.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name \(EN\)/ })).toHaveValue('Books')
  })

  it('abandons the entry on cancel', async () => {
    const state = shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await openDialog(user, /Add Category/)
    await user.type(screen.getByRole('textbox', { name: /Name \(EN\)/ }), 'Books')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.writes).toHaveLength(0)
  })
})

describe('CategoriesAdmin editing', () => {
  it('opens the dialog pre-filled with the existing category', async () => {
    shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await screen.findByText('Clothing')
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit Category' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name \(EN\)/ })).toHaveValue('Clothing')
    expect(screen.getByRole('textbox', { name: /Name \(FI\)/ })).toHaveValue('Vaatteet')
    expect(screen.getByRole('textbox', { name: /Description \(EN\)/ })).toHaveValue('Club wear')
  })

  it('puts the change to the category it was editing', async () => {
    const state = shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await screen.findByText('Clothing')
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const nameField = await screen.findByRole('textbox', { name: /Name \(EN\)/ })
    await user.clear(nameField)
    await user.type(nameField, 'Apparel')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      path: 'cat-1',
      body: { name: { en: 'Apparel', fi: 'Vaatteet', sv: 'Kläder' } },
    })
  })

  it('copes with a category that has no description at all', async () => {
    shopCategories([aCategory({ description: undefined })])

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await screen.findByText('Clothing')
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('textbox', { name: /Description \(EN\)/ })).toHaveValue('')
  })

  it('starts a fresh entry after editing one, rather than reusing it', async () => {
    shopCategories()

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await screen.findByText('Clothing')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await openDialog(user, /Add Category/)

    expect(screen.getByRole('heading', { name: 'Add Category' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name \(EN\)/ })).toHaveValue('')
  })
})

describe('CategoriesAdmin deleting', () => {
  it('asks for confirmation first', async () => {
    const state = shopCategories()
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await screen.findByText('Clothing')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this?')
    expect(state.writes).toHaveLength(0)
  })

  it('deletes and refreshes the list once confirmed', async () => {
    const state = shopCategories()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await screen.findByText('Clothing')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(state.writes).toEqual([{ method: 'DELETE', path: 'cat-1', body: null }]),
    )
    expect(await screen.findByText('Deleted')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Clothing')).toBeNull())
  })

  it('reports a failed delete and leaves the row in place', async () => {
    shopCategories()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    server.use(
      http.delete(apiUrl('v1/shop/categories/:id'), () => problemResponse(409, 'Category in use')),
    )

    const { user } = renderWithProviders(<CategoriesAdmin />)
    await screen.findByText('Clothing')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByText('Clothing')).toBeInTheDocument()
  })
})
