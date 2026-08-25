import { MIKPermissions } from '@mik/contracts/members'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { authScenarios, renderAs, type AuthScenario } from '../../test/auth'
import {
  aMemberWithPermissions,
  anItemReservation,
  anItemReservationListResponse,
  anItemUnitListResponse,
  aReservableItem,
  OXYGEN_TANK_ITEM_ID,
} from '../../test/fixtures'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import ItemReservationCalendar from './ItemReservationCalendar'

/**
 * The item reservation calendar (#1139).
 *
 * The page itself is ungated, like `/schedule` — anyone signed in may look at
 * who has the vests. What the tests below pin down is the line between looking
 * and booking: the button that opens the editor is off for a member without the
 * reservation permission and for one whose reservation rights are suspended,
 * and the API is the real gate behind both.
 */

/** Inside the reservation window the fixtures use (2025-06-02 09:00–11:00 UTC). */
const NOW = new Date('2025-06-02T10:00:00.000Z')

/**
 * A member holding the reservation permission. Written as a scenario rather
 * than a `signInWithPermissions()` call, because `renderAs` signs in as the
 * scenario's member — a `signInWithPermissions` before it is overwritten and
 * the test silently runs as the ordinary member instead.
 */
const reserver: AuthScenario = {
  name: 'member who may reserve items',
  member: aMemberWithPermissions([MIKPermissions.INVENTORY_RESERVATION_USER]),
  sudo: false,
}

const OXYGEN_TANK = aReservableItem({
  itemId: OXYGEN_TANK_ITEM_ID,
  name: { en: 'Oxygen Tank', fi: 'Happipullo', sv: 'Syrgastub' },
})

const stubItems = (items = [aReservableItem(), OXYGEN_TANK]) =>
  server.use(http.get(apiUrl('v1/inventory/items'), () => HttpResponse.json(items)))

const stubReservations = (response = anItemReservationListResponse()) =>
  server.use(http.get(apiUrl('v1/inventory-reservations'), () => HttpResponse.json(response)))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)

  stubItems()
  stubReservations()
  server.use(
    http.get(apiUrl('v1/inventory/items/:itemId/units'), () =>
      HttpResponse.json(anItemUnitListResponse()),
    ),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ItemReservationCalendar', () => {
  it('shows the reservations for the visible window', async () => {
    renderAs(reserver, <ItemReservationCalendar />)

    // The member's own reservation reads as "you", not as their own name.
    expect(await screen.findByTitle(/2× Life Vest — you/)).toBeInTheDocument()
  })

  it('names the member who holds someone else’s reservation', async () => {
    stubReservations(
      anItemReservationListResponse([
        anItemReservation({
          reservationId: 'resv9',
          memberId: 'Liisa1',
          member: { firstName: 'Liisa', lastName: 'Korhonen', phoneNumber: null },
        }),
      ]),
    )
    renderAs(reserver, <ItemReservationCalendar />)

    expect(await screen.findByTitle(/Liisa Korhonen/)).toBeInTheDocument()
  })

  it('offers a filter button per reservable item, plus All', async () => {
    renderAs(reserver, <ItemReservationCalendar />)

    const filters = await screen.findByRole('group', { name: 'Items' })
    expect(within(filters).getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Life Vest' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Oxygen Tank' })).toBeInTheDocument()
  })

  it('narrows the request to one item when its filter is pressed', async () => {
    const requested: string[] = []
    server.use(
      http.get(apiUrl('v1/inventory-reservations'), ({ request }) => {
        requested.push(new URL(request.url).searchParams.getAll('itemId').join(','))
        return HttpResponse.json(anItemReservationListResponse())
      }),
    )
    const { user } = renderAs(reserver, <ItemReservationCalendar />)

    await user.click(await screen.findByRole('button', { name: 'Oxygen Tank' }))

    await waitFor(() => expect(requested).toContain(OXYGEN_TANK_ITEM_ID))
  })

  it('asks for cancelled reservations only once the box is ticked', async () => {
    const requested: (string | null)[] = []
    server.use(
      http.get(apiUrl('v1/inventory-reservations'), ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('showCancelled'))
        return HttpResponse.json(anItemReservationListResponse())
      }),
    )
    const { user } = renderAs(reserver, <ItemReservationCalendar />)

    await waitFor(() => expect(requested.length).toBeGreaterThan(0))
    expect(requested.every((value) => value !== 'true')).toBe(true)

    await user.click(screen.getByRole('checkbox', { name: 'Show cancelled' }))

    await waitFor(() => expect(requested).toContain('true'))
  })

  it('opens the editor for a new reservation', async () => {
    const { user } = renderAs(reserver, <ItemReservationCalendar />)

    await user.click(await screen.findByRole('button', { name: 'New Reservation' }))

    expect(await screen.findByRole('dialog', { name: /New Reservation/ })).toBeInTheDocument()
  })

  it('opens the editor on an existing reservation when its event is clicked', async () => {
    const { user } = renderAs(reserver, <ItemReservationCalendar />)

    await user.click(await screen.findByTitle(/2× Life Vest/))

    expect(await screen.findByRole('dialog', { name: /Edit Reservation/ })).toBeInTheDocument()
  })

  it('will not let a member whose reservation rights are suspended start one', async () => {
    renderAs(
      {
        ...reserver,
        member: aMemberWithPermissions([MIKPermissions.INVENTORY_RESERVATION_USER], {
          canMakeReservations: false,
        }),
      },
      <ItemReservationCalendar />,
    )

    expect(await screen.findByRole('button', { name: 'New Reservation' })).toBeDisabled()
  })

  it('will not let a member without the reservation permission start one', async () => {
    renderAs(authScenarios.none, <ItemReservationCalendar />)

    expect(await screen.findByRole('button', { name: 'New Reservation' })).toBeDisabled()
  })

  it('says so, rather than showing an empty picker, when nothing is reservable yet', async () => {
    stubItems([])
    renderAs(reserver, <ItemReservationCalendar />)

    expect(await screen.findByText(/No items are marked reservable yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Reservation' })).toBeDisabled()
  })

  it('reports the API’s refusal rather than an empty calendar', async () => {
    server.use(
      http.get(apiUrl('v1/inventory-reservations'), () => problemResponse(403, 'Forbidden')),
    )
    renderAs(authScenarios.none, <ItemReservationCalendar />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no access|forbidden/i)
  })

  it('asks only for reservable items, so consumables stay out of the picker', async () => {
    let reservableOnly: string | null = null
    server.use(
      http.get(apiUrl('v1/inventory/items'), ({ request }) => {
        reservableOnly = new URL(request.url).searchParams.get('reservableOnly')
        return HttpResponse.json([aReservableItem()])
      }),
    )
    renderAs(reserver, <ItemReservationCalendar />)

    await waitFor(() => expect(reservableOnly).toBe('true'))
  })
})
