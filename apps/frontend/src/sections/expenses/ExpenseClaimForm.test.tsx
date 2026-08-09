import type { ExpenseCategory, ExpenseClaim } from '@backend/routes/expenses/models'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import ExpenseClaimForm from './ExpenseClaimForm'

/**
 * The expense claim editor (#1115 §10). Everything a member types is validated
 * client-side before the claim is saved — a wrong IBAN or a missing HETU means
 * a reimbursement that never arrives — so the tests are mostly about which
 * fields block the save, and about the branch between an ordinary claim and a
 * mileage one (no receipt, no currency, HETU required).
 */
const CATEGORIES: ExpenseCategory[] = [
  // `misc` rather than `other`: the label comes from `expenses.category.<code>`,
  // and only the codes in that block have a translation to show.
  { id: 1, code: 'misc', nameEn: 'Other', nameFi: 'Muu', nameSv: 'Annat' },
  { id: 2, code: 'mileage', nameEn: 'Mileage', nameFi: 'Kilometrit', nameSv: 'Kilometer' },
  { id: 3, code: 'fuel', nameEn: 'Fuel', nameFi: 'Polttoaine', nameSv: 'Bränsle' },
] as unknown as ExpenseCategory[]

const aClaim = (overrides: Partial<ExpenseClaim> = {}) =>
  ({
    id: 'claim-1',
    categoryId: 1,
    title: 'Hangar padlock',
    description: 'Replacement padlock',
    expenseDate: '2027-03-01',
    currency: 'EUR',
    fxRate: null,
    iban: 'FI2112345600000785',
    ibanAccountName: 'Matti Virtanen',
    status: 'DRAFT',
    lineItems: [
      {
        id: 11,
        itemId: null,
        description: 'Padlock',
        date: '2027-03-01',
        quantity: 1,
        unit: 'pcs',
        unitPrice: 24,
        totalCost: 24,
        sortOrder: 0,
        costCentreCode: null,
        fuelType: null,
        airport: null,
        paidWithClubCard: false,
      },
    ],
    attachments: [{ id: 5, filename: 'receipt.pdf' }],
    mileageLegs: [],
    ...overrides,
  }) as unknown as ExpenseClaim

type Write = { method: string; path: string; body: unknown }

const expensesApi = (claim?: ExpenseClaim) => {
  const state = { writes: [] as Write[] }

  server.use(
    http.get(apiUrl('v1/expenses/categories'), () => HttpResponse.json(CATEGORIES)),
    http.get(apiUrl('v1/mileage-allowances/current'), () =>
      HttpResponse.json({ effectiveRatePerKm: 0.28 }),
    ),
    http.get(apiUrl('v1/cost-centres'), () =>
      HttpResponse.json([{ code: 'OH-ABC', description: 'OH-ABC' }]),
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
    http.get(apiUrl('v1/expenses/:id'), () =>
      claim ? HttpResponse.json(claim) : problemResponse(404, 'Not found'),
    ),
    http.post(apiUrl('v1/expenses/:id/submit'), async ({ params }) => {
      state.writes.push({ method: 'SUBMIT', path: String(params.id), body: null })
      return HttpResponse.json(aClaim({ status: 'SUBMITTED' } as Partial<ExpenseClaim>))
    }),
    http.post(apiUrl('v1/expenses'), async ({ request }) => {
      state.writes.push({ method: 'POST', path: '', body: await request.json() })
      return HttpResponse.json(aClaim({ id: 'claim-new' } as Partial<ExpenseClaim>))
    }),
    http.put(apiUrl('v1/expenses/:id'), async ({ request, params }) => {
      state.writes.push({ method: 'PUT', path: String(params.id), body: await request.json() })
      return HttpResponse.json(claim ?? aClaim())
    }),
    http.delete(apiUrl('v1/expenses/:id'), ({ params }) => {
      state.writes.push({ method: 'DELETE', path: String(params.id), body: null })
      return HttpResponse.json({})
    }),
  )

  return state
}

const renderNew = () => renderWithProviders(<ExpenseClaimForm />)
const renderExisting = (id = 'claim-1') =>
  renderWithProviders(<ExpenseClaimForm claimId={id} />, {
    route: `/expenses/${id}/edit`,
    path: '/expenses/:id/edit',
  })

const pickCategory = async (user: ReturnType<typeof renderWithProviders>['user'], name: string) => {
  await user.click(await screen.findByRole('combobox', { name: /Category/ }))
  await user.click(await screen.findByRole('option', { name }))
}

const saveDraft = (user: ReturnType<typeof renderWithProviders>['user']) =>
  user.click(screen.getByRole('button', { name: 'Save draft' }))

describe('ExpenseClaimForm new claim', () => {
  it('starts empty, on the new-claim title', async () => {
    expensesApi()

    renderNew()

    expect(await screen.findByRole('heading', { name: 'New Expense Claim' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Title/ })).toHaveValue('')
  })

  it('reports a failed category load rather than an empty picker', async () => {
    expensesApi()
    server.use(http.get(apiUrl('v1/expenses/categories'), () => problemResponse(500, 'Down')))

    renderNew()

    expect(await screen.findByText(/Down/)).toBeInTheDocument()
  })

  it('flags every missing required field at once rather than one at a time', async () => {
    expensesApi()

    const { user } = renderNew()
    await screen.findByRole('combobox', { name: /Category/ })

    await saveDraft(user)

    expect(await screen.findByText('Category is required')).toBeInTheDocument()
    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('IBAN is required for reimbursement')).toBeInTheDocument()
    expect(screen.getByText('Account holder name is required')).toBeInTheDocument()
    expect(screen.getByText('Expense date is required')).toBeInTheDocument()
  })

  it('sends nothing while the form is invalid', async () => {
    const state = expensesApi()

    const { user } = renderNew()
    await screen.findByRole('combobox', { name: /Category/ })

    await saveDraft(user)

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(state.writes).toHaveLength(0)
  })

  it('points the member at the highlighted fields', async () => {
    expensesApi()

    const { user } = renderNew()
    await screen.findByRole('combobox', { name: /Category/ })

    await saveDraft(user)

    expect(
      await screen.findByText('Please review the highlighted fields below before saving.'),
    ).toBeInTheDocument()
  })

  it('clears a field’s error as soon as it is filled in', async () => {
    expensesApi()

    const { user } = renderNew()
    await screen.findByRole('combobox', { name: /Category/ })
    await saveDraft(user)
    await screen.findByText('Title is required')

    await user.type(screen.getByRole('textbox', { name: /Title/ }), 'Hangar padlock')

    expect(screen.queryByText('Title is required')).toBeNull()
  })

  it('will not save a claim whose lines total zero', async () => {
    expensesApi()

    const { user } = renderNew()
    await pickCategory(user, 'Other')
    await user.type(screen.getByRole('textbox', { name: /Title/ }), 'Hangar padlock')
    await saveDraft(user)

    expect(await screen.findByText('Total amount must be greater than zero')).toBeInTheDocument()
  })
})

describe('ExpenseClaimForm editing an existing claim', () => {
  it('pre-fills the claim, bank details included', async () => {
    expensesApi(aClaim())

    renderExisting()

    expect(await screen.findByDisplayValue('Hangar padlock')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /IBAN/ })).toHaveValue('FI2112345600000785')
    expect(screen.getByRole('textbox', { name: /Account holder name/ })).toHaveValue(
      'Matti Virtanen',
    )
    expect(screen.getByDisplayValue('Padlock')).toBeInTheDocument()
  })

  it('puts the claim against its own id and keeps the line items', async () => {
    const state = expensesApi(aClaim())

    const { user } = renderExisting()
    const title = await screen.findByDisplayValue('Hangar padlock')

    await user.clear(title)
    await user.type(title, 'Hangar padlock ×2')
    await saveDraft(user)

    await waitFor(() => expect(state.writes).toHaveLength(1))
    const body = state.writes[0].body as { title: string; lineItems: unknown[] }
    expect(state.writes[0]).toMatchObject({ method: 'PUT', path: 'claim-1' })
    expect(body.title).toBe('Hangar padlock ×2')
    expect(body.lineItems).toHaveLength(1)
  })

  it('numbers the line items by their position so a reorder survives the round trip', async () => {
    const state = expensesApi(aClaim())

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    await user.click(screen.getByRole('button', { name: 'Add item' }))
    await saveDraft(user)

    await waitFor(() => expect(state.writes).toHaveLength(1))
    const body = state.writes[0].body as { lineItems: { sortOrder: number }[] }
    expect(body.lineItems.map((li) => li.sortOrder)).toEqual([0, 1])
  })

  it('says a claim past draft can no longer be edited', async () => {
    expensesApi(aClaim({ status: 'APPROVED' } as Partial<ExpenseClaim>))

    renderExisting()

    expect(await screen.findByText('This claim is no longer editable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  })

  it('tells a member whose claim came back for more information', async () => {
    expensesApi(aClaim({ status: 'PENDING_INFO' } as Partial<ExpenseClaim>))

    renderExisting()

    // Re-submit rather than submit — this claim has been round the loop once.
    expect(await screen.findByRole('button', { name: 'Re-submit claim' })).toBeInTheDocument()
  })

  it('surfaces the API’s reason when a save is rejected', async () => {
    expensesApi(aClaim())
    server.use(http.put(apiUrl('v1/expenses/:id'), () => problemResponse(409, 'Period is closed')))

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    await saveDraft(user)

    expect(await screen.findByText('Period is closed')).toBeInTheDocument()
  })

  it('confirms a saved draft', async () => {
    expensesApi(aClaim())

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    await saveDraft(user)

    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
  })
})

describe('ExpenseClaimForm submitting', () => {
  const openSubmit = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(screen.getByRole('button', { name: 'Submit claim' }))
    return screen.findByRole('dialog')
  }

  it('warns that submitting is one-way before it happens', async () => {
    const state = expensesApi(aClaim())

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    const dialog = await openSubmit(user)

    expect(
      within(dialog).getByText(/Once submitted you cannot edit this claim/),
    ).toBeInTheDocument()
    expect(state.writes).toHaveLength(0)
  })

  it('saves and then submits, in that order', async () => {
    const state = expensesApi(aClaim())

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    const dialog = await openSubmit(user)
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(state.writes).toHaveLength(2))
    expect(state.writes[0].method).toBe('PUT')
    expect(state.writes[1]).toMatchObject({ method: 'SUBMIT', path: 'claim-1' })
  })

  it('leaves the claim as a draft when the submit call is refused', async () => {
    expensesApi(aClaim())
    server.use(
      http.post(apiUrl('v1/expenses/:id/submit'), () => problemResponse(422, 'Receipt missing')),
    )

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    const dialog = await openSubmit(user)
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Receipt missing')).toBeInTheDocument()
  })

  it('abandons the submit on cancel', async () => {
    const state = expensesApi(aClaim())

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    const dialog = await openSubmit(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.writes).toHaveLength(0)
  })

  it('will not let a claim be submitted with nothing attached', async () => {
    expensesApi(aClaim({ attachments: [] } as Partial<ExpenseClaim>))

    renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    expect(screen.getByRole('button', { name: 'Submit claim' })).toBeDisabled()
  })

  it('needs no attachment on a mileage claim, which has no receipt to give', async () => {
    expensesApi(aClaim({ categoryId: 2, attachments: [] } as Partial<ExpenseClaim>))

    renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    expect(screen.getByRole('button', { name: 'Submit claim' })).toBeEnabled()
  })
})

describe('ExpenseClaimForm deleting', () => {
  it('offers a delete only on a draft that has been saved', async () => {
    expensesApi(aClaim({ status: 'SUBMITTED' } as Partial<ExpenseClaim>))

    renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('warns before deleting a draft', async () => {
    const state = expensesApi(aClaim())

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/permanently delete the draft/)).toBeInTheDocument()
    expect(state.writes).toHaveLength(0)
  })

  it('deletes the claim once confirmed', async () => {
    const state = expensesApi(aClaim())

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ method: 'DELETE', path: 'claim-1' })
  })

  it('reports a rejected delete', async () => {
    expensesApi(aClaim())
    server.use(http.delete(apiUrl('v1/expenses/:id'), () => problemResponse(409, 'Already paid')))

    const { user } = renderExisting()
    await screen.findByDisplayValue('Hangar padlock')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Already paid')).toBeInTheDocument()
  })
})

describe('ExpenseClaimForm mileage claims', () => {
  it('drops the currency picker, the line items and the receipt zone', async () => {
    expensesApi()

    const { user } = renderNew()
    await pickCategory(user, 'Mileage')

    expect(screen.queryByRole('combobox', { name: 'Currency' })).toBeNull()
    expect(screen.queryByText('Line items')).toBeNull()
    expect(screen.queryByText('Receipt')).toBeNull()
  })

  it('asks for the HETU, which an ordinary claim never does', async () => {
    expensesApi()

    const { user } = renderNew()

    await pickCategory(user, 'Other')
    expect(screen.queryByLabelText(/HETU/)).toBeNull()

    await pickCategory(user, 'Mileage')
    expect(screen.getByLabelText(/HETU/)).toBeInTheDocument()
  })

  it('masks the HETU as it is typed, since it is personal data', async () => {
    expensesApi()

    const { user } = renderNew()
    await pickCategory(user, 'Mileage')

    expect(screen.getByLabelText(/HETU/)).toHaveAttribute('type', 'password')
  })

  it('never pre-fills the HETU from a saved claim — the API returns it masked', async () => {
    expensesApi(aClaim({ categoryId: 2 } as Partial<ExpenseClaim>))

    renderExisting()

    expect(await screen.findByLabelText(/HETU/)).toHaveValue('')
  })

  it('upper-cases the HETU’s century marker and check character', async () => {
    expensesApi()

    const { user } = renderNew()
    await pickCategory(user, 'Mileage')

    await user.type(screen.getByLabelText(/HETU/), '010180-900k')

    expect(screen.getByLabelText(/HETU/)).toHaveValue('010180-900K')
  })

  it('blocks the save until the journey details are complete', async () => {
    const state = expensesApi()

    const { user } = renderNew()
    await pickCategory(user, 'Mileage')
    await user.type(screen.getByRole('textbox', { name: /Title/ }), 'Trip to EFHF')
    await saveDraft(user)

    expect(
      await screen.findByText(/Start address, end address, journey date and distance are required/),
    ).toBeInTheDocument()
    expect(state.writes).toHaveLength(0)
  })
})
