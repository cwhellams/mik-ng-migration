import { MIKPermissions } from '@backend/routes/members/models'
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
