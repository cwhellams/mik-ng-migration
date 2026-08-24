import type { MemberPackage, PrepaidPackage } from '@mik/contracts/prepaid-hours'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import FlightPackagesAdmin from './FlightPackagesAdmin'

/**
 * Prepaid flight-hour packages (#1115 §9). Two things make this page worth
 * pinning: the filters are applied client-side (so their options are derived
 * from the loaded packages, not a fixed list), and the bulk "extend expiry"
 * action rewrites the expiry of every package for an aircraft at once.
 */
const aPackage = (overrides: Partial<PrepaidPackage> = {}) =>
  ({
    productId: 'pkg-1',
    aircraftRegistration: 'OH-ABC',
    nameEn: 'OH-ABC 10 hours',
    nameFi: 'OH-ABC 10 tuntia',
    nameSv: null,
    descriptionEn: 'Ten prepaid hours',
    descriptionFi: null,
    descriptionSv: null,
    minutesPerPackage: 600,
    perMinRate: 2.5,
    totalPackagesAvailable: 10,
    soldCount: 3,
    maxPerMember: null,
    simplbooksItemId: null,
    vatPercent: 0,
    lowStockThreshold: null,
    expiresAt: '2027-12-31T00:00:00.000Z',
    isActive: true,
    ...overrides,
  }) as PrepaidPackage

const aMemberPackage = (overrides: Partial<MemberPackage> = {}) =>
  ({
    memberPackageId: 1,
    memberId: 'mem-1',
    member: {
      firstName: 'Chris',
      lastName: 'Whellams',
      email: 'chris.whellams@gmail.com',
      phoneNumber: '+358401234567',
    },
    package: { aircraftRegistration: 'OH-ABC' },
    remainingMinutes: 300,
    totalMinutes: 600,
    expiresAt: '2027-12-31T00:00:00.000Z',
    isExpired: false,
    ...overrides,
  }) as MemberPackage

type Write = { method: string; id: string; body: Record<string, unknown> }

const packagesApi = (
  packages: PrepaidPackage[] = [aPackage()],
  memberPackages: MemberPackage[] = [aMemberPackage()],
) => {
  const state = { writes: [] as Write[] }

  server.use(
    http.get(apiUrl('v1/prepaid-hours/packages'), () => HttpResponse.json(packages)),
    http.get(apiUrl('v1/prepaid-hours/member-packages'), () => HttpResponse.json(memberPackages)),
    http.get(apiUrl('v1/aircrafts'), () =>
      HttpResponse.json({
        aircrafts: [{ registration: 'OH-ABC' }, { registration: 'OH-XYZ' }],
      }),
    ),
    http.get(apiUrl('v1/invoices/items'), () =>
      HttpResponse.json({
        items: [
          { id: 7, code: 'FLY', name: 'Flight hours', active: true },
          { id: 8, code: 'OLD', name: 'Retired item', active: false },
        ],
      }),
    ),
    http.post(apiUrl('v1/prepaid-hours/packages'), async ({ request }) => {
      state.writes.push({
        method: 'POST',
        id: '',
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json(aPackage({ productId: 'pkg-new' }))
    }),
    http.put(apiUrl('v1/prepaid-hours/packages/:id'), async ({ request, params }) => {
      state.writes.push({
        method: 'PUT',
        id: String(params.id),
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json(aPackage())
    }),
    http.post(apiUrl('v1/prepaid-hours/extend-expiry'), async ({ request }) => {
      state.writes.push({
        method: 'EXTEND',
        id: '',
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json({ updated: 4 })
    }),
  )

  return state
}

const openCreate = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Add Package' }))
  return screen.findByRole('dialog')
}

/** Fills every field the Save button gates on, inside the given dialog. */
const fillRequired = async (
  user: ReturnType<typeof renderWithProviders>['user'],
  dialog: HTMLElement,
) => {
  const q = within(dialog)
  await user.type(q.getByRole('textbox', { name: 'Name (EN)' }), 'OH-XYZ 5 hours')
  await user.click(q.getByRole('combobox', { name: 'Aircraft' }))
  await user.click(await screen.findByRole('option', { name: 'OH-XYZ' }))
  await user.type(q.getByRole('spinbutton', { name: /Minutes\/Package/ }), '300')
  await user.type(q.getByRole('spinbutton', { name: /Price\/min/ }), '2.5')
  await user.type(q.getByRole('spinbutton', { name: /Total Qty/ }), '5')
}

describe('FlightPackagesAdmin listing', () => {
  it('lists each package with its aircraft, rate and sold count', async () => {
    packagesApi()

    renderWithProviders(<FlightPackagesAdmin />)

    const row = (await screen.findByText('OH-ABC 10 tuntia')).closest('tr')!
    expect(within(row).getByText('OH-ABC')).toBeInTheDocument()
    expect(within(row).getByText('600 min')).toBeInTheDocument()
    expect(within(row).getByText('€2.5/min')).toBeInTheDocument()
    expect(within(row).getByText('3 / 10')).toBeInTheDocument()
  })

  it('prefers the Finnish name, falling back to English', async () => {
    packagesApi([aPackage({ nameFi: undefined })])

    renderWithProviders(<FlightPackagesAdmin />)

    expect(await screen.findByText('OH-ABC 10 hours')).toBeInTheDocument()
  })

  it('marks a package whose whole allocation has sold', async () => {
    packagesApi([aPackage({ soldCount: 10 })])

    renderWithProviders(<FlightPackagesAdmin />)

    expect(await screen.findByText('Sold Out')).toBeInTheDocument()
  })

  it('says when no SimplBooks item is linked rather than leaving the cell blank', async () => {
    packagesApi()

    renderWithProviders(<FlightPackagesAdmin />)

    expect(await screen.findByText('None')).toBeInTheDocument()
  })

  it('reports a failed package load', async () => {
    packagesApi()
    server.use(http.get(apiUrl('v1/prepaid-hours/packages'), () => problemResponse(500, 'Down')))

    renderWithProviders(<FlightPackagesAdmin />)

    expect(await screen.findByText(/Down/)).toBeInTheDocument()
  })

  it('still shows the packages when only the member-package load fails', async () => {
    packagesApi()
    server.use(
      http.get(apiUrl('v1/prepaid-hours/member-packages'), () =>
        problemResponse(500, 'No members'),
      ),
    )

    renderWithProviders(<FlightPackagesAdmin />)

    expect(await screen.findByText('OH-ABC 10 tuntia')).toBeInTheDocument()
    // Both member-package tables sit behind their own RemoteContent, so the
    // one failed load surfaces twice.
    expect(await screen.findAllByText(/No members/)).toHaveLength(2)
  })
})

describe('FlightPackagesAdmin member packages', () => {
  it('identifies the member by name, email and phone', async () => {
    packagesApi()

    renderWithProviders(<FlightPackagesAdmin />)

    expect(
      await screen.findByText('Chris Whellams | chris.whellams@gmail.com | +358401234567'),
    ).toBeInTheDocument()
  })

  it('falls back to the member id when the member could not be resolved', async () => {
    packagesApi([aPackage()], [aMemberPackage({ member: undefined })])

    renderWithProviders(<FlightPackagesAdmin />)

    expect(await screen.findByText('mem-1')).toBeInTheDocument()
  })

  it('shows remaining against total minutes', async () => {
    packagesApi()

    renderWithProviders(<FlightPackagesAdmin />)

    expect(await screen.findAllByText('300 min / 600 min')).not.toHaveLength(0)
  })

  it('totals the member packages per aircraft, splitting active from expired', async () => {
    packagesApi(
      [aPackage()],
      [
        aMemberPackage({ memberPackageId: 1, remainingMinutes: 300, totalMinutes: 600 }),
        aMemberPackage({ memberPackageId: 2, remainingMinutes: 100, totalMinutes: 600 }),
        aMemberPackage({ memberPackageId: 3, isExpired: true, remainingMinutes: 60 }),
      ],
    )

    renderWithProviders(<FlightPackagesAdmin />)

    // Active rows are summed together (300 + 100 of 1200); the expired one is
    // kept in its own row rather than being folded into the active total.
    expect(await screen.findByText('400 min / 1200 min')).toBeInTheDocument()
    // Once in the per-member table, once as the expired total.
    expect(screen.getAllByText('60 min / 600 min')).toHaveLength(2)
  })
})

describe('FlightPackagesAdmin filtering', () => {
  const twoAircraft = () =>
    packagesApi([
      aPackage(),
      aPackage({
        productId: 'pkg-2',
        aircraftRegistration: 'OH-XYZ',
        nameFi: 'OH-XYZ 5 tuntia',
        isActive: false,
        expiresAt: '2028-06-30T00:00:00.000Z',
      }),
    ])

  it('offers only the aircraft that actually have packages', async () => {
    twoAircraft()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await screen.findByText('OH-ABC 10 tuntia')

    await user.click(screen.getByRole('combobox', { name: 'Aircraft' }))

    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['All', 'OH-ABC', 'OH-XYZ'])
  })

  it('narrows the table to the chosen aircraft', async () => {
    twoAircraft()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await screen.findByText('OH-ABC 10 tuntia')

    await user.click(screen.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-XYZ' }))

    expect(screen.getByText('OH-XYZ 5 tuntia')).toBeInTheDocument()
    expect(screen.queryByText('OH-ABC 10 tuntia')).toBeNull()
  })

  it('narrows the table to inactive packages', async () => {
    twoAircraft()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await screen.findByText('OH-ABC 10 tuntia')

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Inactive' }))

    expect(screen.getByText('OH-XYZ 5 tuntia')).toBeInTheDocument()
    expect(screen.queryByText('OH-ABC 10 tuntia')).toBeNull()
  })

  it('derives the expiry-year options from the packages on hand', async () => {
    twoAircraft()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await screen.findByText('OH-ABC 10 tuntia')

    await user.click(screen.getByRole('combobox', { name: 'Expires' }))

    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['All', '2027', '2028'])
  })

  it('combines the filters rather than replacing one with the next', async () => {
    twoAircraft()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await screen.findByText('OH-ABC 10 tuntia')

    await user.click(screen.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-ABC' }))
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Inactive' }))

    // OH-ABC is active, so combining "OH-ABC" with "inactive" leaves nothing.
    expect(screen.queryByText('OH-ABC 10 tuntia')).toBeNull()
    expect(screen.queryByText('OH-XYZ 5 tuntia')).toBeNull()
  })
})

describe('FlightPackagesAdmin creating', () => {
  it('will not save until every required field is filled', async () => {
    packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openCreate(user)
    const save = within(dialog).getByRole('button', { name: 'Save' })

    expect(save).toBeDisabled()
    await fillRequired(user, dialog)
    expect(save).toBeEnabled()
  })

  it('posts the package with its numbers parsed out of the form strings', async () => {
    const state = packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openCreate(user)

    await fillRequired(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: {
        nameEn: 'OH-XYZ 5 hours',
        aircraftRegistration: 'OH-XYZ',
        minutesPerPackage: 300,
        perMinRate: 2.5,
        totalPackagesAvailable: 5,
        isActive: true,
      },
    })
  })

  it('leaves the optional fields as null or undefined rather than sending zeroes', async () => {
    const state = packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openCreate(user)

    await fillRequired(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    const body = state.writes[0].body
    expect(body.maxPerMember).toBeNull()
    expect(body.simplbooksItemId).toBeNull()
    expect(body.lowStockThreshold).toBeNull()
    // JSON drops the undefined descriptions entirely rather than sending ''.
    expect(body).not.toHaveProperty('descriptionEn')
  })

  it('shows the package price it will charge, derived from rate × minutes', async () => {
    packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openCreate(user)
    const q = within(dialog)

    expect(q.getByRole('textbox', { name: /Total Package Price/ })).toHaveValue('–')

    await user.type(q.getByRole('spinbutton', { name: /Minutes\/Package/ }), '300')
    await user.type(q.getByRole('spinbutton', { name: /Price\/min/ }), '2.5')

    expect(q.getByRole('textbox', { name: /Total Package Price/ })).toHaveValue('€750.00')
  })

  it('offers only the active SimplBooks items', async () => {
    packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openCreate(user)

    await user.click(within(dialog).getByRole('combobox', { name: 'SimplBooks Item ID' }))

    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['None', '[FLY] Flight hours'])
  })

  it('sends the SimplBooks item id as a string', async () => {
    const state = packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openCreate(user)

    await fillRequired(user, dialog)
    await user.click(within(dialog).getByRole('combobox', { name: 'SimplBooks Item ID' }))
    await user.click(await screen.findByRole('option', { name: '[FLY] Flight hours' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ simplbooksItemId: '7' })
  })

  it('reports a rejected save without closing the dialog', async () => {
    packagesApi()
    server.use(
      http.post(apiUrl('v1/prepaid-hours/packages'), () => problemResponse(409, 'Duplicate')),
    )

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openCreate(user)

    await fillRequired(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('FlightPackagesAdmin editing', () => {
  it('pre-fills the dialog from the package, dates included', async () => {
    packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit OH-ABC' }))

    const q = within(await screen.findByRole('dialog'))
    expect(q.getByRole('textbox', { name: 'Name (EN)' })).toHaveValue('OH-ABC 10 hours')
    expect(q.getByRole('textbox', { name: 'Name (FI)' })).toHaveValue('OH-ABC 10 tuntia')
    expect(q.getByRole('spinbutton', { name: /Minutes\/Package/ })).toHaveValue(600)
    // The API sends a full timestamp; the date input only accepts YYYY-MM-DD.
    expect(q.getByLabelText(/Expires/)).toHaveValue('2027-12-31')
  })

  it('puts the change against the package it was editing', async () => {
    const state = packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit OH-ABC' }))
    const dialog = await screen.findByRole('dialog')

    const total = within(dialog).getByRole('spinbutton', { name: /Total Qty/ })
    await user.clear(total)
    await user.type(total, '20')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'PUT',
      id: 'pkg-1',
      body: { totalPackagesAvailable: 20 },
    })
  })

  it('confirms and closes once the save succeeds', async () => {
    packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit OH-ABC' }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('FlightPackagesAdmin extending expiry', () => {
  const openExtend = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Extend Expiry' }))
    return screen.findByRole('dialog')
  }

  it('defaults to 30 days but needs an aircraft picked first', async () => {
    packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openExtend(user)
    const q = within(dialog)

    expect(q.getByRole('spinbutton', { name: 'Days to add' })).toHaveValue(30)
    expect(q.getByRole('button', { name: 'Extend' })).toBeDisabled()
  })

  it('extends every package for the chosen aircraft and says how many moved', async () => {
    const state = packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openExtend(user)
    const q = within(dialog)

    await user.click(q.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-ABC' }))
    await user.click(q.getByRole('button', { name: 'Extend' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'EXTEND',
      body: { aircraftRegistration: 'OH-ABC', daysToAdd: 30 },
    })
    expect(await screen.findByText('Extended 4 packages')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('sends the day count as a number, not the string from the field', async () => {
    const state = packagesApi()

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openExtend(user)
    const q = within(dialog)

    await user.click(q.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-ABC' }))
    const days = q.getByRole('spinbutton', { name: 'Days to add' })
    await user.clear(days)
    await user.type(days, '90')
    await user.click(q.getByRole('button', { name: 'Extend' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body.daysToAdd).toBe(90)
  })

  it('reports a rejected extend without closing the dialog', async () => {
    packagesApi()
    server.use(
      http.post(apiUrl('v1/prepaid-hours/extend-expiry'), () => problemResponse(500, 'Nope')),
    )

    const { user } = renderWithProviders(<FlightPackagesAdmin />)
    const dialog = await openExtend(user)
    const q = within(dialog)

    await user.click(q.getByRole('combobox', { name: 'Aircraft' }))
    await user.click(await screen.findByRole('option', { name: 'OH-ABC' }))
    await user.click(q.getByRole('button', { name: 'Extend' }))

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
