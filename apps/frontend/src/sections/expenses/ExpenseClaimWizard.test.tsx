import type { ExpenseCategory } from '@backend/routes/expenses/models'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { aMember } from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import ExpenseClaimWizard from './ExpenseClaimWizard'

/**
 * The guided expense claim wizard (#1115 §11). Its step list is not fixed —
 * fuel claims gain a flight step, mileage claims swap line items and the
 * receipt for a journey step — so most of the risk is in the steps a member
 * does or doesn't get, and in what each one refuses to advance past.
 */
const DRAFT_KEY = 'wizardDraft:expenseClaim:new'

const CATEGORIES: ExpenseCategory[] = [
  { id: 1, code: 'misc', nameEn: 'Other', nameFi: 'Muu', nameSv: 'Annat' },
  { id: 2, code: 'mileage', nameEn: 'Mileage', nameFi: 'Kilometrit', nameSv: 'Kilometer' },
  { id: 3, code: 'fuel', nameEn: 'Fuel', nameFi: 'Polttoaine', nameSv: 'Bränsle' },
] as unknown as ExpenseCategory[]

type Write = { method: string; path: string; body: unknown }

const wizardApi = () => {
  const state = { writes: [] as Write[] }

  server.use(
    http.get(apiUrl('v1/expenses/categories'), () => HttpResponse.json(CATEGORIES)),
    http.get(apiUrl('v1/mileage-allowances/current'), () =>
      HttpResponse.json({ effectiveRatePerKm: 0.28, discountPct: 50 }),
    ),
    http.get(apiUrl('v1/cost-centres'), () =>
      HttpResponse.json([{ code: 'OH-STL', description: 'OH-STL' }]),
    ),
    http.get(apiUrl('v1/invoices/items'), () =>
      HttpResponse.json({
        items: [
          {
            id: 4,
            code: 'MISC',
            name: 'Miscellaneous',
            active: true,
            expense_claim_item: true,
            is_fuel_item: false,
            is_km_item: false,
            is_other_item: true,
          },
        ],
      }),
    ),
    http.get(apiUrl('v1/flight-log'), () => HttpResponse.json({ flightLogs: [] })),
    http.post(apiUrl('v1/expenses/:id/submit'), async ({ params }) => {
      state.writes.push({ method: 'SUBMIT', path: String(params.id), body: null })
      return HttpResponse.json({ id: String(params.id) })
    }),
    http.post(apiUrl('v1/expenses'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json({ id: 'claim-new' })
    }),
    http.put(apiUrl('v1/expenses/:id'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.id), body: await request.json() })
      return HttpResponse.json({ id: String(params.id) })
    }),
  )

  return state
}

const renderWizard = () => renderWithProviders(<ExpenseClaimWizard />, { route: '/expenses/new' })

const seedDraft = (value: unknown, savedAt = Date.now()) => {
  const tabId = sessionStorage.getItem('wizardDraft:tabId')
  localStorage.setItem(`${DRAFT_KEY}:${tabId}`, JSON.stringify({ savedAt, value }))
}

const draftKeys = () => {
  // The harness's in-memory Storage keeps its entries off the object itself, so
  // they have to be walked through the Storage API.
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(`${DRAFT_KEY}:`)) keys.push(key)
  }
  return keys
}

/**
 * The first of last month — a date that is always in the past, and whose day is
 * always a single leading-zero digit. A two-digit day ("10") typed through
 * user-event lands in the picker's display but never reaches its onChange,
 * which would leave `expenseDate` unset and the wizard stuck on Details.
 */
const PAST_DATE_DDMMYYYY = (() => {
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `01${String(lastMonth.getMonth() + 1).padStart(2, '0')}${lastMonth.getFullYear()}`
})()

const next = (user: ReturnType<typeof renderWithProviders>['user']) =>
  user.click(screen.getByRole('button', { name: 'Next' }))

/** Fills the details step and moves on to whatever comes after it. */
const completeDetails = async (
  user: ReturnType<typeof renderWithProviders>['user'],
  category = 'Other',
) => {
  await next(user)
  await screen.findByRole('combobox', { name: /Category/ })

  await user.click(screen.getByRole('combobox', { name: /Category/ }))
  await user.click(await screen.findByRole('option', { name: category }))
  await user.type(screen.getByRole('textbox', { name: /Title/ }), 'Hangar padlock')
  // The date picker is a sectioned field (role="group"), not a plain textbox —
  // clicking it focuses the first section and the digits fill day/month/year
  // (en-gb, so DD MM YYYY). It is `disableFuture`, hence a past date.
  await user.click(screen.getByRole('group', { name: /Expense date/ }))
  await user.keyboard(PAST_DATE_DDMMYYYY)
  await next(user)
}

describe('ExpenseClaimWizard step list', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('opens on the receipt policy, which never blocks progress', async () => {
    wizardApi()

    renderWizard()

    expect(await screen.findByText('Before you start')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  })

  it('starts with no fuel or journey step, since no category is picked yet', async () => {
    wizardApi()

    renderWizard()
    await screen.findByText('Before you start')

    expect(screen.queryByText('Flight')).toBeNull()
    expect(screen.queryByText('Journey Details')).toBeNull()
    expect(screen.getByText('Line Items')).toBeInTheDocument()
  })

  it('adds a flight step for a fuel claim', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)

    await user.click(await screen.findByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Fuel' }))

    expect(await screen.findByText('Flight')).toBeInTheDocument()
  })

  it('swaps line items and the receipt for a journey step on a mileage claim', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)

    await user.click(await screen.findByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Mileage' }))

    expect(await screen.findByText('Journey Details')).toBeInTheDocument()
    expect(screen.queryByText('Line Items')).toBeNull()
    expect(screen.queryByText('Receipt')).toBeNull()
  })

  it('drops the currency picker on a mileage claim, which is always in euros', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)
    await screen.findByRole('combobox', { name: /Category/ })

    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Mileage' }))

    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Currency' })).toBeNull())
  })
})

describe('ExpenseClaimWizard advancing', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('names the fields still to fill in rather than just refusing', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)
    await screen.findByRole('combobox', { name: /Category/ })

    await next(user)

    expect(
      await screen.findByText(/Before continuing, please fill in: Category, Title, Expense date/),
    ).toBeInTheDocument()
  })

  it('stays on the details step while anything is missing', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)
    await user.type(await screen.findByRole('textbox', { name: /Title/ }), 'Hangar padlock')

    await next(user)

    expect(
      await screen.findByText(/Before continuing, please fill in: Category, Expense date/),
    ).toBeInTheDocument()
  })

  it('moves on once the details are complete', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')

    await completeDetails(user)

    expect(await screen.findByRole('textbox', { name: /IBAN/ })).toBeInTheDocument()
  })

  it('clears the missing-fields warning on the way back', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)
    await screen.findByRole('combobox', { name: /Category/ })
    await next(user)
    await screen.findByText(/Before continuing, please fill in/)

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.queryByText(/Before continuing, please fill in/)).toBeNull()
  })

  it('refuses an IBAN that fails its checksum', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await completeDetails(user)

    await user.type(await screen.findByRole('textbox', { name: /IBAN/ }), 'FI2112345600000786')
    await user.type(screen.getByRole('textbox', { name: /Account holder name/ }), 'Matti Virtanen')
    await next(user)

    expect(await screen.findByText(/please fill in: IBAN/)).toBeInTheDocument()
  })

  it('accepts a valid IBAN and moves on', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await completeDetails(user)

    await user.type(await screen.findByRole('textbox', { name: /IBAN/ }), 'FI2112345600000785')
    await user.type(screen.getByRole('textbox', { name: /Account holder name/ }), 'Matti Virtanen')
    await next(user)

    expect(await screen.findByRole('textbox', { name: 'Description' })).toBeInTheDocument()
  })

  it('will not leave the line-item step with an incomplete row', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await completeDetails(user)
    await user.type(await screen.findByRole('textbox', { name: /IBAN/ }), 'FI2112345600000785')
    await user.type(screen.getByRole('textbox', { name: /Account holder name/ }), 'Matti Virtanen')
    await next(user)
    await screen.findByRole('textbox', { name: 'Description' })

    await next(user)

    expect(await screen.findByText(/please fill in: line item details/)).toBeInTheDocument()
  })
})

describe('ExpenseClaimWizard bank details', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('pre-fills the IBAN from the member’s own profile', async () => {
    wizardApi()
    server.use(
      http.get(apiUrl('v1/members/me'), () =>
        HttpResponse.json(
          aMember({ iban: 'FI2112345600000785', ibanAccountName: 'Matti Virtanen' }),
        ),
      ),
    )

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await completeDetails(user)

    expect(await screen.findByRole('textbox', { name: /IBAN/ })).toHaveValue('FI2112345600000785')
  })
})

describe('ExpenseClaimWizard drafts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('autosaves the claim as it is filled in', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)
    await user.type(await screen.findByRole('textbox', { name: /Title/ }), 'Hangar padlock')

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(draftKeys()[0])!)
      expect(stored.value.form.title).toBe('Hangar padlock')
    })
  })

  it('resumes an unfinished claim, naming it in the banner', async () => {
    wizardApi()
    seedDraft({
      step: 1,
      form: {
        categoryId: 1,
        title: 'Hangar padlock',
        description: '',
        currency: 'EUR',
        iban: '',
        ibanAccountName: '',
        lineItems: [],
      },
      fuelForFlight: null,
      flightMode: 'dropdown',
      attachments: [],
      savedClaimId: null,
      mileageLegs: [],
      hetu: '',
      claimFxRate: null,
    })

    renderWizard()

    expect(await screen.findByText(/Resumed your unfinished claim\./)).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: /Title/ })).toHaveValue('Hangar padlock')
  })

  it('shows no banner when there was nothing to resume', async () => {
    wizardApi()

    renderWizard()
    await screen.findByText('Before you start')

    expect(screen.queryByText(/Resumed your unfinished claim/)).toBeNull()
  })

  it('warns that discarding does not delete an already-saved server draft', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(
      await screen.findByText(/Any part you already saved as a draft on the server is not deleted/),
    ).toBeInTheDocument()
  })

  it('keeps the claim when the member backs out of discarding', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)
    await user.type(await screen.findByRole('textbox', { name: /Title/ }), 'Hangar padlock')
    await waitFor(() => expect(draftKeys()).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(draftKeys()).toHaveLength(1)
  })

  it('clears the saved draft once discarding is confirmed', async () => {
    wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await next(user)
    await user.type(await screen.findByRole('textbox', { name: /Title/ }), 'Hangar padlock')
    await waitFor(() => expect(draftKeys()).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))

    await waitFor(() => expect(draftKeys()).toHaveLength(0))
  })
})

describe('ExpenseClaimWizard saving', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('posts the claim when Save draft is used mid-flow', async () => {
    const state = wizardApi()

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await completeDetails(user)

    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({
      method: 'POST',
      body: { title: 'Hangar padlock', categoryId: 1 },
    })
  })

  it('puts rather than posts once the claim already exists on the server', async () => {
    const state = wizardApi()
    seedDraft({
      step: 1,
      form: {
        categoryId: 1,
        title: 'Hangar padlock',
        description: '',
        expenseDate: '2020-03-01',
        currency: 'EUR',
        iban: 'FI2112345600000785',
        ibanAccountName: 'Matti Virtanen',
        lineItems: [],
      },
      fuelForFlight: null,
      flightMode: 'dropdown',
      attachments: [],
      savedClaimId: 'claim-1',
      mileageLegs: [],
      hetu: '',
      claimFxRate: null,
    })

    const { user } = renderWizard()
    await screen.findByRole('textbox', { name: /Title/ })

    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'PUT', path: 'claim-1' })
  })

  it('reports a rejected save rather than moving on silently', async () => {
    wizardApi()
    server.use(http.post(apiUrl('v1/expenses'), () => problemResponse(400, 'Category is closed')))

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await completeDetails(user)

    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Category is closed')).toBeInTheDocument()
  })

  it('falls back to a generic message when the API gives no reason', async () => {
    wizardApi()
    server.use(http.post(apiUrl('v1/expenses'), () => HttpResponse.json({}, { status: 500 })))

    const { user } = renderWizard()
    await screen.findByText('Before you start')
    await completeDetails(user)

    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText(/Something went wrong saving this claim/)).toBeInTheDocument()
  })
})
