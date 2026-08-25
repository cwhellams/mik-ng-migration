import type { InventoryCategory, InventoryItem, InventoryLocation } from '@mik/contracts/inventory'
import type { ItemUnitListResponse } from '@mik/contracts/inventory-units'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { anItemUnit, anItemUnitListResponse } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import InventoryAdminPage from './InventoryAdminPage'

/**
 * Inventory admin (#1115 §9): three tabs over one page. Items are the
 * interesting tab — the form shape depends on the item type (consumables have
 * a quantity and a low-stock threshold, assets have a condition and serial
 * number), and an existing consumable's quantity may only be changed through
 * the adjust dialog so that every movement lands in the audit log.
 */
const aCategory = (overrides: Partial<InventoryCategory> = {}) =>
  ({
    categoryId: 'cat-1',
    name: { en: 'Headsets', fi: 'Kuulokkeet', sv: 'Headset' },
    description: { en: '', fi: '', sv: '' },
    isActive: true,
    ...overrides,
  }) as InventoryCategory

const aLocation = (overrides: Partial<InventoryLocation> = {}) =>
  ({
    locationId: 'loc-1',
    name: { en: 'Hangar', fi: 'Halli', sv: 'Hangar' },
    description: { en: '', fi: '', sv: '' },
    isActive: true,
    ...overrides,
  }) as InventoryLocation

const anItem = (overrides: Partial<InventoryItem> = {}) =>
  ({
    itemId: 'item-1',
    name: { en: 'Oil 15W50', fi: 'Öljy 15W50', sv: 'Olja 15W50' },
    description: { en: 'Engine oil', fi: '', sv: '' },
    categoryId: 'cat-1',
    category: aCategory(),
    locationId: 'loc-1',
    location: aLocation(),
    itemType: 'CONSUMABLE',
    quantity: 8,
    lowStockThreshold: 10,
    condition: 'UNKNOWN',
    serialNumber: null,
    imageUrl: null,
    notes: null,
    tags: [],
    isActive: true,
    isReservable: false,
    ...overrides,
  }) as InventoryItem

type Write = { method: string; url: string; body: Record<string, unknown> }

const inventoryApi = (
  items: InventoryItem[] = [anItem()],
  categories: InventoryCategory[] = [aCategory()],
  locations: InventoryLocation[] = [aLocation()],
  units: ItemUnitListResponse = anItemUnitListResponse(),
) => {
  const state = { writes: [] as Write[] }
  const record = async (method: string, request: Request) => {
    state.writes.push({
      method,
      url: new URL(request.url).pathname,
      body: (await request.json().catch(() => ({}))) as Record<string, unknown>,
    })
  }

  server.use(
    http.get(apiUrl('v1/inventory/items'), () => HttpResponse.json(items)),
    http.get(apiUrl('v1/inventory/categories'), () => HttpResponse.json(categories)),
    http.get(apiUrl('v1/inventory/locations'), () => HttpResponse.json(locations)),
    http.post(apiUrl('v1/inventory/items/:id/adjust-quantity'), async ({ request }) => {
      await record('ADJUST', request)
      return HttpResponse.json(anItem())
    }),
    http.post(apiUrl('v1/inventory/items'), async ({ request }) => {
      await record('POST', request)
      return HttpResponse.json(anItem({ itemId: 'item-new' }))
    }),
    http.put(apiUrl('v1/inventory/items/:id'), async ({ request }) => {
      await record('PUT', request)
      return HttpResponse.json(anItem())
    }),
    http.delete(apiUrl('v1/inventory/items/:id'), async ({ request }) => {
      await record('DELETE', request)
      return HttpResponse.json({})
    }),
    http.post(apiUrl('v1/inventory/categories'), async ({ request }) => {
      await record('POST', request)
      return HttpResponse.json(aCategory({ categoryId: 'cat-new' }))
    }),
    http.put(apiUrl('v1/inventory/categories/:id'), async ({ request }) => {
      await record('PUT', request)
      return HttpResponse.json(aCategory())
    }),
    http.post(apiUrl('v1/inventory/locations'), async ({ request }) => {
      await record('POST', request)
      return HttpResponse.json(aLocation({ locationId: 'loc-new' }))
    }),
    http.delete(apiUrl('v1/inventory/locations/:id'), async ({ request }) => {
      await record('DELETE', request)
      return HttpResponse.json({})
    }),
    http.get(apiUrl('v1/inventory/items/:id/units'), () => HttpResponse.json(units)),
    http.post(apiUrl('v1/inventory/items/:id/units'), async ({ request }) => {
      await record('POST', request)
      return HttpResponse.json(anItemUnit({ unitId: 'unit-new' }))
    }),
    http.put(apiUrl('v1/inventory/units/:unitId'), async ({ request }) => {
      await record('PUT', request)
      return HttpResponse.json(anItemUnit())
    }),
    http.post(apiUrl('v1/inventory/units/:unitId/status'), async ({ request }) => {
      await record('POST', request)
      return HttpResponse.json(anItemUnit({ status: 'MAINTENANCE' }))
    }),
  )

  return state
}

const openItemDialog = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Add Item' }))
  return screen.findByRole('dialog')
}

const goToTab = async (user: ReturnType<typeof renderWithProviders>['user'], name: string) => {
  await user.click(screen.getByRole('tab', { name }))
}

describe('InventoryAdminPage items listing', () => {
  it('lists items with their category, location and type', async () => {
    inventoryApi()

    renderWithProviders(<InventoryAdminPage />)

    const row = (await screen.findByText('Oil 15W50')).closest('tr')!
    expect(within(row).getByText('Headsets')).toBeInTheDocument()
    expect(within(row).getByText('Hangar')).toBeInTheDocument()
    expect(within(row).getByText('Consumable')).toBeInTheDocument()
  })

  it('flags a consumable that has fallen to its low-stock threshold', async () => {
    inventoryApi([anItem({ quantity: 8, lowStockThreshold: 10 })])

    renderWithProviders(<InventoryAdminPage />)

    // The quantity and the warning glyph are separate text nodes in the cell.
    expect(await screen.findByText(/8\s*⚠/)).toBeInTheDocument()
  })

  it('leaves a consumable above its threshold unflagged', async () => {
    inventoryApi([anItem({ quantity: 20, lowStockThreshold: 10 })])

    renderWithProviders(<InventoryAdminPage />)

    expect(await screen.findByText('20')).toBeInTheDocument()
    expect(screen.queryByText(/⚠/)).toBeNull()
  })

  it('shows an asset’s condition in place of a quantity', async () => {
    inventoryApi([anItem({ itemType: 'ASSET', condition: 'GOOD' })])

    renderWithProviders(<InventoryAdminPage />)

    expect(await screen.findByText('Good')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    inventoryApi()
    server.use(http.get(apiUrl('v1/inventory/items'), () => problemResponse(500, 'Down')))

    renderWithProviders(<InventoryAdminPage />)

    expect(await screen.findByText(/Down/)).toBeInTheDocument()
  })

  it('copes with an item whose category and location were not expanded', async () => {
    inventoryApi([anItem({ category: undefined, location: undefined })])

    renderWithProviders(<InventoryAdminPage />)

    // Blank cells rather than a crash on the missing relation.
    expect(await screen.findByText('Oil 15W50')).toBeInTheDocument()
  })
})

describe('InventoryAdminPage item form', () => {
  it('only offers a condition and serial number once the type is Asset', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)
    const q = within(dialog)

    expect(q.queryByRole('combobox', { name: 'Condition' })).toBeNull()
    expect(q.getByRole('spinbutton', { name: 'Low Stock Threshold' })).toBeInTheDocument()

    await user.click(q.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'Asset' }))

    expect(q.getByRole('combobox', { name: 'Condition' })).toBeInTheDocument()
    expect(q.getByRole('textbox', { name: 'Serial Number' })).toBeInTheDocument()
    expect(q.queryByRole('spinbutton', { name: 'Low Stock Threshold' })).toBeNull()
  })

  it('offers an opening quantity when creating a consumable', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)

    expect(within(dialog).getByRole('spinbutton', { name: 'Qty' })).toHaveValue(0)
  })

  it('will not let an existing consumable’s quantity be edited straight into the form', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit Oil 15W50' }))

    // Editing it here would bypass the audit log, so the field is withheld and
    // the adjust dialog is the only route.
    expect(
      within(await screen.findByRole('dialog')).queryByRole('spinbutton', { name: 'Qty' }),
    ).toBeNull()
  })

  it('only complains about a missing name once save has been attempted', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)
    const q = within(dialog)

    expect(q.queryByText('This field is required')).toBeNull()

    await user.click(q.getByRole('button', { name: 'Save' }))

    expect(await q.findAllByText('This field is required')).toHaveLength(2)
    expect(q.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('rejects an image URL that is not http(s) as soon as it is typed', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: 'Image URL' }), 'ftp://example.com/a.png')

    expect(q.getByText('Enter a valid http(s) URL')).toBeInTheDocument()
  })

  it('accepts a blank image URL, since it is optional', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)

    expect(within(dialog).queryByText('Enter a valid http(s) URL')).toBeNull()
  })

  it('posts the item with its localised name and parsed numbers', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: /Name \(EN\)/ }), 'Spark plugs')
    await user.type(q.getByRole('textbox', { name: 'Name (FI)' }), 'Sytytystulpat')
    await user.click(q.getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Headsets' }))
    await user.type(q.getByRole('spinbutton', { name: 'Qty' }), '24')
    await user.type(q.getByRole('textbox', { name: 'Tags (comma-separated)' }), ' engine , spares ')
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: {
        name: { en: 'Spark plugs', fi: 'Sytytystulpat', sv: '' },
        categoryId: 'cat-1',
        itemType: 'CONSUMABLE',
        quantity: 24,
        lowStockThreshold: null,
        tags: ['engine', 'spares'],
      },
    })
  })

  it('leaves the location out entirely when none is chosen', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: /Name \(EN\)/ }), 'Spark plugs')
    await user.click(q.getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Headsets' }))
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).not.toHaveProperty('locationId')
  })

  it('puts the change against the item it was editing', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit Oil 15W50' }))
    const q = within(await screen.findByRole('dialog'))

    const threshold = q.getByRole('spinbutton', { name: 'Low Stock Threshold' })
    await user.clear(threshold)
    await user.type(threshold, '25')
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      url: '/api/v1/inventory/items/item-1',
      body: { lowStockThreshold: 25 },
    })
  })

  it('surfaces the API’s own message when a save is rejected', async () => {
    inventoryApi()
    server.use(
      http.post(apiUrl('v1/inventory/items'), () => problemResponse(409, 'Serial already in use')),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)
    const q = within(dialog)

    await user.type(q.getByRole('textbox', { name: /Name \(EN\)/ }), 'Spark plugs')
    await user.click(q.getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Headsets' }))
    await user.click(q.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Serial already in use')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('InventoryAdminPage adjusting quantity', () => {
  const openAdjust = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Adjust Quantity Oil 15W50' }))
    return screen.findByRole('dialog')
  }

  it('is offered for consumables only', async () => {
    inventoryApi([anItem({ itemType: 'ASSET' })])

    renderWithProviders(<InventoryAdminPage />)
    await screen.findByText('Oil 15W50')

    expect(screen.queryByRole('button', { name: /Adjust Quantity/ })).toBeNull()
  })

  it('names the item being adjusted', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openAdjust(user)

    expect(within(dialog).getByText('Adjust Quantity: Oil 15W50')).toBeInTheDocument()
  })

  it('needs a numeric change before it will save', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openAdjust(user)

    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('posts the delta to the item’s own adjust endpoint', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openAdjust(user)
    const q = within(dialog)

    await user.type(q.getByRole('spinbutton', { name: /Change/ }), '-3')
    await user.type(q.getByRole('textbox', { name: 'Notes' }), 'Used on OH-ABC')
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'ADJUST',
      url: '/api/v1/inventory/items/item-1/adjust-quantity',
      body: { delta: -3, notes: 'Used on OH-ABC' },
    })
  })

  it('sends a null note rather than an empty string', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openAdjust(user)

    await user.type(within(dialog).getByRole('spinbutton', { name: /Change/ }), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body.notes).toBeNull()
  })

  it('clears the fields once an adjustment goes through', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    let dialog = await openAdjust(user)

    await user.type(within(dialog).getByRole('spinbutton', { name: /Change/ }), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openAdjust(user)
    expect(within(dialog).getByRole('spinbutton', { name: /Change/ })).toHaveValue(null)
  })

  it('keeps the dialog open when the adjustment is rejected', async () => {
    inventoryApi()
    server.use(
      http.post(apiUrl('v1/inventory/items/:id/adjust-quantity'), () =>
        problemResponse(409, 'Would go negative'),
      ),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openAdjust(user)

    await user.type(within(dialog).getByRole('spinbutton', { name: /Change/ }), '-99')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('InventoryAdminPage deleting', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('asks for confirmation first', async () => {
    const state = inventoryApi()
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Delete Oil 15W50' }))

    expect(confirm).toHaveBeenCalled()
    expect(state.writes).toHaveLength(0)
  })

  it('deletes once confirmed', async () => {
    const state = inventoryApi()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Delete Oil 15W50' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'DELETE',
      url: '/api/v1/inventory/items/item-1',
    })
  })

  it('offers no delete for an item already inactive', async () => {
    inventoryApi([anItem({ isActive: false })])

    renderWithProviders(<InventoryAdminPage />)
    await screen.findByText('Oil 15W50')

    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  })
})

describe('InventoryAdminPage categories and locations tabs', () => {
  it('lists categories on their own tab', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await screen.findByText('Oil 15W50')

    await goToTab(user, 'Categories')

    expect(await screen.findByText('Headsets')).toBeInTheDocument()
    expect(screen.getByText('Kuulokkeet')).toBeInTheDocument()
  })

  it('will not save a category without an English name', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Categories')
    await user.click(await screen.findByRole('button', { name: 'Add Category' }))

    const q = within(await screen.findByRole('dialog'))
    expect(q.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.type(q.getByRole('textbox', { name: /Name \(EN\)/ }), 'Avionics')
    expect(q.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('posts a new category as a localised name/description pair', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Categories')
    await user.click(await screen.findByRole('button', { name: 'Add Category' }))

    const q = within(await screen.findByRole('dialog'))
    await user.type(q.getByRole('textbox', { name: /Name \(EN\)/ }), 'Avionics')
    await user.type(q.getByRole('textbox', { name: 'Description (EN)' }), 'Radios and such')
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/inventory/categories',
      body: {
        name: { en: 'Avionics', fi: '', sv: '' },
        description: { en: 'Radios and such', fi: '', sv: '' },
      },
    })
  })

  it('puts an edited category against its own id', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Categories')
    await user.click(await screen.findByRole('button', { name: 'Edit Headsets' }))

    const q = within(await screen.findByRole('dialog'))
    const name = q.getByRole('textbox', { name: /Name \(EN\)/ })
    await user.clear(name)
    await user.type(name, 'Headsets & intercoms')
    await user.click(q.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      url: '/api/v1/inventory/categories/cat-1',
    })
  })

  it('offers no deactivate on categories, only on locations', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)

    await goToTab(user, 'Categories')
    await screen.findByText('Headsets')
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()

    await goToTab(user, 'Locations')
    expect(await screen.findByRole('button', { name: 'Delete Hangar' })).toBeInTheDocument()
  })

  it('deactivates a location once confirmed', async () => {
    const state = inventoryApi()
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Locations')
    await user.click(await screen.findByRole('button', { name: 'Delete Hangar' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'DELETE',
      url: '/api/v1/inventory/locations/loc-1',
    })
    vi.restoreAllMocks()
  })

  it('offers no deactivate for a location that is already inactive', async () => {
    inventoryApi([anItem()], [aCategory()], [aLocation({ isActive: false })])

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Locations')
    await screen.findByText('Hangar')

    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  })
})

/**
 * Units tab (#1139).
 *
 * The tab exists because per-unit identity is what makes an item reservable at
 * all: capacity is a count of units in service, so an item with no unit rows
 * can never be reserved however large its `quantity` says it is.
 */
describe('InventoryAdminPage units tab', () => {
  const aReservable = (overrides: Partial<InventoryItem> = {}) =>
    anItem({
      itemId: 'INV_VEST',
      name: { en: 'Life Vest', fi: 'Pelastusliivi', sv: 'Flytväst' },
      itemType: 'ASSET',
      isReservable: true,
      ...overrides,
    })

  it('asks the member to pick an item before showing any units', async () => {
    inventoryApi([aReservable()])

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Units')

    expect(await screen.findByText('Choose an item to manage its units.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Unit' })).toBeDisabled()
  })

  it('lists the chosen item’s units and how many of them hold capacity', async () => {
    inventoryApi(
      [aReservable()],
      [aCategory()],
      [aLocation()],
      anItemUnitListResponse(
        [
          anItemUnit({ tag: 'LV-001' }),
          anItemUnit({ unitId: 'VEST5', tag: 'LV-005', status: 'MAINTENANCE' }),
        ],
        1,
      ),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Units')
    await user.click(await screen.findByRole('combobox', { name: 'Item' }))
    await user.click(await screen.findByRole('option', { name: 'Life Vest' }))

    expect(await screen.findByText('LV-001')).toBeInTheDocument()
    expect(screen.getByText('LV-005')).toBeInTheDocument()
    expect(screen.getByText('In maintenance')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 units in service')).toBeInTheDocument()
  })

  it('says an item has no units rather than showing an empty table', async () => {
    inventoryApi([aReservable()], [aCategory()], [aLocation()], anItemUnitListResponse([], 0))

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Units')
    await user.click(await screen.findByRole('combobox', { name: 'Item' }))
    await user.click(await screen.findByRole('option', { name: 'Life Vest' }))

    expect(await screen.findByText(/This item has no individual units yet/)).toBeInTheDocument()
  })

  it('creates a unit under the chosen item', async () => {
    const state = inventoryApi([aReservable()])

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Units')
    await user.click(await screen.findByRole('combobox', { name: 'Item' }))
    await user.click(await screen.findByRole('option', { name: 'Life Vest' }))

    await user.click(await screen.findByRole('button', { name: 'Add Unit' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Tag' }), 'LV-009')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/inventory/items/INV_VEST/units',
      body: { tag: 'LV-009' },
    })
  })

  it('sends a status change to its own endpoint, with the note', async () => {
    const state = inventoryApi(
      [aReservable()],
      [aCategory()],
      [aLocation()],
      anItemUnitListResponse([anItemUnit({ tag: 'LV-001' })], 1),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Units')
    await user.click(await screen.findByRole('combobox', { name: 'Item' }))
    await user.click(await screen.findByRole('option', { name: 'Life Vest' }))

    await user.click(await screen.findByRole('button', { name: 'Change Unit Status LV-001' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'In maintenance' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), 'Whistle missing')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/inventory/units/VEST1/status',
      body: { status: 'MAINTENANCE', notes: 'Whistle missing' },
    })
  })

  it('patches a unit through the unit endpoint rather than the item’s', async () => {
    const state = inventoryApi(
      [aReservable()],
      [aCategory()],
      [aLocation()],
      anItemUnitListResponse([anItemUnit({ tag: 'LV-001' })], 1),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Units')
    await user.click(await screen.findByRole('combobox', { name: 'Item' }))
    await user.click(await screen.findByRole('option', { name: 'Life Vest' }))

    await user.click(await screen.findByRole('button', { name: 'Edit LV-001' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), 'Repacked')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      url: '/api/v1/inventory/units/VEST1',
      body: { notes: 'Repacked' },
    })
  })

  it('offers only reservable items, so a consumable never gets units', async () => {
    let reservableOnly: string | null = null
    inventoryApi([aReservable()])
    server.use(
      http.get(apiUrl('v1/inventory/items'), ({ request }) => {
        reservableOnly = new URL(request.url).searchParams.get('reservableOnly')
        return HttpResponse.json([aReservable()])
      }),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await goToTab(user, 'Units')

    await waitFor(() => expect(reservableOnly).toBe('true'))
    expect(screen.getByText('Only items marked reservable are listed.')).toBeInTheDocument()
  })
})

describe('InventoryAdminPage reservable flag', () => {
  it('sends the item to the reservation calendar when the box is ticked', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Name (EN)' }), 'Life Vest')
    await user.click(within(dialog).getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Headsets' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Reservable' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ isReservable: true })
  })

  it('leaves an item out of the calendar by default', async () => {
    const state = inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Name (EN)' }), 'Printer Paper')
    await user.click(within(dialog).getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Headsets' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ isReservable: false })
  })

  /**
   * Ticking the box is only half of making an item reservable — capacity comes
   * from its units. An item ticked but unstocked is offered in the reservation
   * calendar's picker and then refuses every reservation with "0 of 0 units are
   * free", and nothing on this side of the app said so (#1260 review).
   */
  it('warns that a reservable item with no units can never be reserved', async () => {
    inventoryApi(
      [anItem({ isReservable: true })],
      [aCategory()],
      [aLocation()],
      anItemUnitListResponse([], 0),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit Oil 15W50' }))

    expect(await screen.findByText(/no units in service/)).toBeInTheDocument()
  })

  it('stays quiet when the reservable item does have units', async () => {
    inventoryApi(
      [anItem({ isReservable: true })],
      [aCategory()],
      [aLocation()],
      anItemUnitListResponse([anItemUnit({ tag: 'LV-001' })], 1),
    )

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit Oil 15W50' }))

    await screen.findByRole('dialog')
    await waitFor(() => expect(screen.queryByText(/no units in service/)).toBeNull())
  })

  it('says nothing about units for an item nobody can reserve', async () => {
    inventoryApi([anItem({ isReservable: false })], [aCategory()], [aLocation()])

    const { user } = renderWithProviders(<InventoryAdminPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit Oil 15W50' }))

    await screen.findByRole('dialog')
    expect(screen.queryByText(/no units in service/)).toBeNull()
    expect(screen.queryByText(/Save the item first/)).toBeNull()
  })

  it('tells the admin where to add units when ticking the box on a new item', async () => {
    inventoryApi()

    const { user } = renderWithProviders(<InventoryAdminPage />)
    const dialog = await openItemDialog(user)

    expect(within(dialog).queryByText(/Save the item first/)).toBeNull()

    await user.click(within(dialog).getByRole('checkbox', { name: 'Reservable' }))

    expect(await within(dialog).findByText(/Save the item first/)).toBeInTheDocument()
  })
})
