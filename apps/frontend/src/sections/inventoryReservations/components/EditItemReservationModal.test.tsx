import type { ItemReservation } from '@mik/contracts/inventory-reservations'
import { MIKPermissions } from '@mik/contracts/members'
import type { Upsert } from '@mik/contracts/schema'
import { screen, waitFor, within } from '@testing-library/react'
import dayjs from 'dayjs'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderAs, type AuthScenario } from '../../../test/auth'
import {
  aBooking,
  aBookingListResponse,
  aMemberWithPermissions,
  anItemReservation,
  anItemUnit,
  anItemUnitListResponse,
  anItemReservationListResponse,
  aReservableItem,
} from '../../../test/fixtures'
import { apiUrl } from '../../../test/msw/handlers'
import { server } from '../../../test/msw/server'
import { ItemReservationEditor, type ItemReservationFlags } from './EditItemReservationModal'

/**
 * The item reservation editor (#1139).
 *
 * The decisions worth pinning down are the ones a member can get wrong and the
 * ones that would over-book the club: what the availability line says, when
 * Save is refused, and that naming a specific unit pins the quantity to one.
 */

const NOW = new Date('2026-05-29T06:00:00.000Z')

const reserver: AuthScenario = {
  name: 'member who may reserve items',
  member: aMemberWithPermissions([MIKPermissions.INVENTORY_RESERVATION_USER]),
  sudo: false,
}

/**
 * A window in the future, so nothing is read-only for being in the past, and on
 * a 15-minute boundary — the pickers use `minutesStep={15}`, and an unaligned
 * time puts them in an error state that (correctly) suspends the availability
 * lookup, which would make every assertion below about capacity vacuous.
 */
const FUTURE = {
  startTimeEpoch: '1780045200',
  startTime: '2026-05-29T09:00:00.000Z',
  endTimeEpoch: '1780052400',
  endTime: '2026-05-29T11:00:00.000Z',
}

const anEditableReservation = (
  overrides: Partial<ItemReservation> = {},
): Upsert<ItemReservation & ItemReservationFlags> => ({
  ...anItemReservation({ ...FUTURE, ...overrides }),
  isNewReservation: false,
  isReadonly: false,
  minDate: dayjs(NOW),
})

const stubUnits = (response = anItemUnitListResponse()) =>
  server.use(
    http.get(apiUrl('v1/inventory/items/:itemId/units'), () => HttpResponse.json(response)),
  )

const stubOverlaps = (response = anItemReservationListResponse([])) =>
  server.use(http.get(apiUrl('v1/inventory-reservations'), () => HttpResponse.json(response)))

beforeEach(() => {
  stubUnits()
  stubOverlaps()
  server.use(
    http.get(apiUrl('v1/bookings'), () => HttpResponse.json(aBookingListResponse([aBooking()]))),
  )
})

const renderEditor = (
  reservation: Upsert<ItemReservation & ItemReservationFlags> | undefined,
  items = [aReservableItem()],
) =>
  renderAs(
    reserver,
    <ItemReservationEditor reservation={reservation} items={items} onClose={() => {}} />,
  )

describe('ItemReservationEditor', () => {
  it('renders nothing at all while no reservation is being edited', () => {
    renderEditor(undefined)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reports how many units are free for the chosen window', async () => {
    // Two units in service, one already committed by another reservation.
    stubUnits(anItemUnitListResponse([anItemUnit(), anItemUnit({ unitId: 'VEST2' })], 2))
    stubOverlaps(anItemReservationListResponse([anItemReservation({ ...FUTURE, quantity: 1 })]))

    renderEditor(anEditableReservation({ quantity: 1 }))

    expect(await screen.findByText('1 of 2 in service free for this time')).toBeInTheDocument()
  })

  it('says so when nothing is free, rather than a bare zero', async () => {
    stubUnits(anItemUnitListResponse([anItemUnit()], 1))
    stubOverlaps(anItemReservationListResponse([anItemReservation({ ...FUTURE, quantity: 1 })]))

    renderEditor(anEditableReservation({ quantity: 1 }))

    expect(
      await screen.findByText('None of the 1 units in service are free for this time'),
    ).toBeInTheDocument()
  })

  it('refuses to save a quantity the club cannot cover', async () => {
    stubUnits(anItemUnitListResponse([anItemUnit(), anItemUnit({ unitId: 'VEST2' })], 2))
    stubOverlaps(anItemReservationListResponse([anItemReservation({ ...FUTURE, quantity: 2 })]))

    renderEditor(anEditableReservation({ quantity: 1 }))

    await waitFor(() => expect(screen.getByRole('button', { name: /save/i })).toBeDisabled())
  })

  it('warns and blocks saving when the item has no units in service', async () => {
    stubUnits(anItemUnitListResponse([], 0))

    renderEditor(anEditableReservation())

    expect(
      await screen.findByText(/This item has no units in service, so it cannot be reserved yet/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('pins the quantity to one and locks the field once a unit is named', async () => {
    stubUnits(anItemUnitListResponse([anItemUnit({ tag: 'LV-001' })], 1))

    const { user } = renderEditor(anEditableReservation({ quantity: 1 }))

    await user.click(await screen.findByRole('combobox', { name: 'Specific unit' }))
    await user.click(await screen.findByRole('option', { name: /LV-001/ }))

    const quantity = screen.getByRole('spinbutton', { name: 'Quantity' })
    await waitFor(() => expect(quantity).toBeDisabled())
    expect(quantity).toHaveValue(1)
    expect(
      screen.getByText('A specific unit can only be picked when reserving one.'),
    ).toBeInTheDocument()
  })

  it('offers "any available unit" as well as the tagged ones', async () => {
    stubUnits(
      anItemUnitListResponse(
        [anItemUnit({ tag: 'LV-001' }), anItemUnit({ unitId: 'VEST2', tag: null })],
        2,
      ),
    )

    const { user } = renderEditor(anEditableReservation())

    await user.click(await screen.findByRole('combobox', { name: 'Specific unit' }))

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Any available unit')]),
    )
  })

  it('leaves a retired unit out of the picker', async () => {
    stubUnits(
      anItemUnitListResponse(
        [
          anItemUnit({ tag: 'LV-001' }),
          anItemUnit({ unitId: 'VEST6', tag: 'LV-006', isActive: false }),
        ],
        1,
      ),
    )

    const { user } = renderEditor(anEditableReservation())

    await user.click(await screen.findByRole('combobox', { name: 'Specific unit' }))

    expect(screen.queryByRole('option', { name: /LV-006/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /LV-001/ })).toBeInTheDocument()
  })

  it('offers the member’s own upcoming flights to link to, plus no flight at all', async () => {
    const { user } = renderEditor(anEditableReservation())

    await user.click(await screen.findByRole('combobox', { name: 'Flight booking' }))

    expect(screen.getByRole('option', { name: 'Not linked to a flight' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /OH-STL/ })).toBeInTheDocument()
  })

  it('posts a new reservation to the collection', async () => {
    let posted: unknown
    server.use(
      http.post(apiUrl('v1/inventory-reservations'), async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(anItemReservation())
      }),
    )
    stubUnits(anItemUnitListResponse([anItemUnit(), anItemUnit({ unitId: 'VEST2' })], 2))

    const { user } = renderEditor({
      ...anEditableReservation({ quantity: 1 }),
      reservationId: '',
      isNewReservation: true,
    })

    await user.click(await screen.findByRole('button', { name: /save/i }))

    await waitFor(() => expect(posted).toMatchObject({ itemId: 'INV_VEST', quantity: 1 }))
  })

  it('patches an existing reservation rather than creating a second one', async () => {
    let patchedId: string | undefined
    server.use(
      http.patch(apiUrl('v1/inventory-reservations/:id'), ({ params }) => {
        patchedId = params.id as string
        return HttpResponse.json(anItemReservation())
      }),
    )
    stubUnits(anItemUnitListResponse([anItemUnit(), anItemUnit({ unitId: 'VEST2' })], 2))

    const { user } = renderEditor(anEditableReservation())

    await user.click(await screen.findByRole('button', { name: /save/i }))

    await waitFor(() => expect(patchedId).toBe('resv1'))
  })

  it('cancels through the cancel endpoint, carrying the note', async () => {
    let cancelBody: unknown
    server.use(
      http.post(apiUrl('v1/inventory-reservations/:id/cancel'), async ({ request }) => {
        cancelBody = await request.json()
        return HttpResponse.json(anItemReservation())
      }),
    )

    const { user } = renderEditor(anEditableReservation())

    await user.click(await screen.findByRole('button', { name: /delete|remove/i }))

    const dialog = await screen.findByRole('dialog', { name: /Cancel reservation/ })
    await user.type(within(dialog).getByRole('textbox'), 'Weather')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel reservation' }))

    await waitFor(() => expect(cancelBody).toEqual({ note: 'Weather' }))
  })

  it('shows a read-only reservation without a way to save or cancel it', async () => {
    renderEditor({ ...anEditableReservation(), isReadonly: true })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
  })

  it('surfaces the API’s reason when a save is refused', async () => {
    server.use(
      http.patch(apiUrl('v1/inventory-reservations/:id'), () =>
        HttpResponse.json(
          { status: 400, title: 'Bad Request', detail: 'Only 0 of 4 units are free for that time' },
          { status: 400 },
        ),
      ),
    )
    stubUnits(anItemUnitListResponse([anItemUnit(), anItemUnit({ unitId: 'VEST2' })], 2))

    const { user } = renderEditor(anEditableReservation())

    await user.click(await screen.findByRole('button', { name: /save/i }))

    expect(await screen.findByText('Only 0 of 4 units are free for that time')).toBeInTheDocument()
  })
})
