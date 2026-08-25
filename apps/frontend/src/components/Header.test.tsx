import { MIKPermissions } from '@mik/contracts/members'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { signInAs, signInWithPermissions } from '../test/auth'
import { aMember, aMemberWithoutPermissions } from '../test/fixtures'
import { apiUrl } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import Header from './Header'

const cart = (quantities: number[]) =>
  server.use(
    http.get(apiUrl('v1/shop/cart'), () =>
      HttpResponse.json({ items: quantities.map((quantity) => ({ quantity })) }),
    ),
  )

const renderHeader = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(<Header />, options)

describe('Header navigation', () => {
  it('links home from the logo', async () => {
    signInAs(aMember())

    renderHeader()

    await waitFor(() =>
      expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/')).toBe(
        true,
      ),
    )
  })

  it('shows the sections the member may reach', async () => {
    signInWithPermissions(MIKPermissions.BOOKING_USER)

    renderHeader()

    expect(await screen.findByRole('link', { name: /Schedule/i })).toBeInTheDocument()
  })

  it('hides a section the member has no permission for', async () => {
    signInAs(aMemberWithoutPermissions())

    renderHeader()

    await waitFor(() => expect(screen.queryByRole('link', { name: /Schedule/i })).toBeNull())
  })

  it('does not spend a top-row slot on the item reservation calendar', async () => {
    // It lives under Schedule instead — the top row was already full.
    signInWithPermissions(MIKPermissions.INVENTORY_RESERVATION_USER)

    renderHeader()

    await screen.findByRole('link', { name: /Schedule/i })
    expect(screen.queryByRole('link', { name: /Item Reservations/i })).toBeNull()
  })
})

/**
 * Which top-row entry is shown as the current one.
 *
 * Two things made this wrong before the item calendar moved under Schedule:
 * `/inventory` is a string prefix of `/inventory-reservations`, so Inventory lit
 * up on a page that is not under it; and an absolute sub-item was not credited
 * to its parent, so Schedule stayed unlit on the very page its own tab was
 * showing.
 */
describe('Header current section', () => {
  // jsdom resolves the `bold` keyword to its numeric weight but leaves `normal`
  // as written, so both spellings are accepted rather than asserting on one.
  const isBold = (name: RegExp) => {
    const weight = globalThis.getComputedStyle(screen.getByRole('link', { name })).fontWeight
    return weight === 'bold' || weight === '700'
  }

  it('marks the section the member is in', async () => {
    signInWithPermissions(MIKPermissions.BOOKING_USER)

    renderHeader({ route: '/schedule' })

    await screen.findByRole('link', { name: /Schedule/i })
    expect(isBold(/Schedule/i)).toBe(true)
  })

  it('credits an absolute sub-item to its parent section', async () => {
    signInWithPermissions(
      MIKPermissions.BOOKING_USER,
      MIKPermissions.INVENTORY_RESERVATION_USER,
      MIKPermissions.INVENTORY_USER,
    )

    renderHeader({ route: '/inventory-reservations' })

    await screen.findByRole('link', { name: /Schedule/i })
    expect(isBold(/Schedule/i)).toBe(true)
  })

  it('does not mark a section whose path is merely a prefix of the current one', async () => {
    signInWithPermissions(
      MIKPermissions.BOOKING_USER,
      MIKPermissions.INVENTORY_RESERVATION_USER,
      MIKPermissions.INVENTORY_USER,
    )

    renderHeader({ route: '/inventory-reservations' })

    await screen.findByRole('link', { name: /Inventory$/i })
    expect(isBold(/Inventory$/i)).toBe(false)
  })

  it('still marks a section from a route nested under it', async () => {
    signInWithPermissions(MIKPermissions.AIRCRAFT_USER)

    renderHeader({ route: '/fly/mass-balance' })

    await screen.findByRole('link', { name: /Fly/i })
    expect(isBold(/Fly/i)).toBe(true)
  })
})

describe('Header shop basket', () => {
  it('shows no basket for a member without shop access', async () => {
    signInAs(aMemberWithoutPermissions())

    renderHeader({ route: '/shop' })

    await waitFor(() => expect(screen.queryByRole('link', { name: /cart/i })).toBeNull())
  })

  it('totals the quantities in the basket, not the number of lines', async () => {
    signInWithPermissions(MIKPermissions.STORE_USER)
    cart([2, 3])

    renderHeader({ route: '/shop' })

    expect(await screen.findByText('5')).toBeInTheDocument()
  })

  it('shows no badge for an empty basket', async () => {
    signInWithPermissions(MIKPermissions.STORE_USER)
    cart([])

    renderHeader({ route: '/shop' })

    await screen.findByRole('link', { name: /cart/i })
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows the basket only inside the shop', async () => {
    // It is deliberately scoped to /shop rather than following the user around.
    signInWithPermissions(MIKPermissions.STORE_USER)
    cart([2])

    renderHeader({ route: '/club' })

    await waitFor(() => expect(screen.queryByRole('link', { name: /cart/i })).toBeNull())
  })
})

describe('Header controls', () => {
  it('offers the theme toggle', async () => {
    signInAs(aMember())

    renderHeader()

    expect(await screen.findByRole('button', { name: 'toggle theme' })).toBeInTheDocument()
  })

  it('offers the admin toggle only to a member who can use admin mode', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderHeader()

    expect(await screen.findByRole('button', { name: 'Toggle admin mode' })).toBeInTheDocument()
  })

  it('hides the admin toggle from an ordinary member', async () => {
    signInAs(aMember())

    renderHeader()

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Toggle admin mode' })).toBeNull(),
    )
  })
})
