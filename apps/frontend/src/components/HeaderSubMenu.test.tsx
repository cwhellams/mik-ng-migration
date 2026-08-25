import { MIKPermissions } from '@mik/contracts/members'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Route, Routes, useLocation } from 'react-router'

import { menuItems, type MenuItem } from '../config/menuItems'
import { signInAs, signInWithPermissions } from '../test/auth'
import { aMemberWithoutPermissions } from '../test/fixtures'
import { renderWithProviders } from '../test/renderWithProviders'
import { HeaderSubMenu } from './HeaderSubMenu'

const parent: MenuItem = {
  path: '/fly',
  label: 'header.fly',
  subItems: [
    { path: '', label: 'header.aircraft' },
    { path: 'mass-balance', label: 'header.massBalance' },
    {
      path: 'access-codes',
      label: 'header.accessCodes',
      requiredRoles: [MIKPermissions.ACCESS_CODES_USER],
    },
    { path: 'fuel-prices', label: 'header.fuelPrices', adminModeOnly: true },
  ],
}

const Landing = () => <span>at {useLocation().pathname}</span>

const renderMenu = (
  item: MenuItem = parent,
  options: Parameters<typeof renderWithProviders>[1] = {},
) =>
  renderWithProviders(
    <>
      <HeaderSubMenu parent={item} />
      <Routes>
        <Route path='*' element={<Landing />} />
      </Routes>
    </>,
    { route: '/fly', ...options },
  )

describe('HeaderSubMenu visibility', () => {
  it('shows the sub-items the member may reach', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu()

    expect(await screen.findByRole('tab', { name: /aircraft/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /codes/i })).toBeInTheDocument()
  })

  it('hides a sub-item the member has no permission for', async () => {
    signInAs(aMemberWithoutPermissions())

    renderMenu()

    await screen.findByRole('tab', { name: /aircraft/i })
    expect(screen.queryByRole('tab', { name: /codes/i })).toBeNull()
  })

  it('hides admin-mode-only sub-items while admin mode is off', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu(parent, { sudo: false })

    await screen.findByRole('tab', { name: /aircraft/i })
    expect(screen.queryByRole('tab', { name: /fuel/i })).toBeNull()
  })

  it('reveals them once admin mode is on', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu(parent, { sudo: true })

    expect(await screen.findByRole('tab', { name: /fuel/i })).toBeInTheDocument()
  })

  it('renders nothing when every sub-item is filtered out', async () => {
    signInAs(aMemberWithoutPermissions())

    renderMenu({
      path: '/fly',
      label: 'header.fly',
      subItems: [
        {
          path: 'access-codes',
          label: 'header.accessCodes',
          requiredRoles: [MIKPermissions.ACCESS_CODES_USER],
        },
      ],
    })

    await waitFor(() => expect(screen.queryByRole('tablist')).toBeNull())
  })

  it('renders nothing for a menu item with no sub-items', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu({ path: '/fly', label: 'header.fly' })

    await waitFor(() => expect(screen.queryByRole('tablist')).toBeNull())
  })

  it('stays hidden while the user is somewhere else entirely', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu(parent, { route: '/club' })

    await waitFor(() => expect(screen.queryByRole('tablist')).toBeNull())
  })
})

describe('HeaderSubMenu DTO access', () => {
  const dtoParent: MenuItem = {
    path: '/dto',
    label: 'header.dto',
    subItems: [
      { path: 'my-training', label: 'header.myTraining' },
      { path: 'verify', label: 'header.verify', requiresDtoElevatedAccess: true },
    ],
  }

  it('shows the instructor-only item to a DTO instructor', async () => {
    signInWithPermissions(MIKPermissions.DTO_INSTRUCTOR)

    renderMenu(dtoParent, { route: '/dto' })

    expect(await screen.findByRole('tab', { name: /verify/i })).toBeInTheDocument()
  })

  it('hides it from a DTO admin whose admin mode is off', async () => {
    // A pure admin without sudo is treated as a student here.
    signInWithPermissions(MIKPermissions.DTO_ADMIN)

    renderMenu(dtoParent, { route: '/dto', sudo: false })

    await screen.findByRole('tab', { name: /training/i })
    expect(screen.queryByRole('tab', { name: /verify/i })).toBeNull()
  })

  it('shows it to a DTO admin in admin mode', async () => {
    signInWithPermissions(MIKPermissions.DTO_ADMIN)

    renderMenu(dtoParent, { route: '/dto', sudo: true })

    expect(await screen.findByRole('tab', { name: /verify/i })).toBeInTheDocument()
  })

  it('hides it from a plain DTO user', async () => {
    signInWithPermissions(MIKPermissions.DTO_USER)

    renderMenu(dtoParent, { route: '/dto' })

    await screen.findByRole('tab', { name: /training/i })
    expect(screen.queryByRole('tab', { name: /verify/i })).toBeNull()
  })
})

/**
 * The Schedule group, driven by the real `menuItems` entry rather than a fixture.
 *
 * It is the one group whose second tab is an *absolute* path — the item
 * reservation calendar kept the URL it already had when it moved out of the top
 * row — so it exercises `resolvePath` and `isUnderAbsoluteSubItem` on live
 * config. A fixture would only prove the component works on the shape this file
 * happens to write down.
 */
describe('HeaderSubMenu schedule group', () => {
  const schedule = menuItems.find((item) => item.path === '/schedule')!

  it('offers both calendars to a member who may reserve either', async () => {
    signInWithPermissions(MIKPermissions.BOOKING_USER, MIKPermissions.INVENTORY_RESERVATION_USER)

    renderMenu(schedule, { route: '/schedule' })

    expect(await screen.findByRole('tab', { name: /aircraft reservations/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /item reservations/i })).toBeInTheDocument()
  })

  it('lands on the aircraft calendar by default', async () => {
    signInWithPermissions(MIKPermissions.BOOKING_USER, MIKPermissions.INVENTORY_RESERVATION_USER)

    renderMenu(schedule, { route: '/schedule' })

    expect(await screen.findByRole('tab', { name: /aircraft reservations/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('stays open, with the item tab selected, on the absolute sub-item path', async () => {
    signInWithPermissions(MIKPermissions.BOOKING_USER, MIKPermissions.INVENTORY_RESERVATION_USER)

    renderMenu(schedule, { route: '/inventory-reservations' })

    expect(await screen.findByRole('tab', { name: /item reservations/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('navigates to the item calendar without nesting it under /schedule', async () => {
    signInWithPermissions(MIKPermissions.BOOKING_USER, MIKPermissions.INVENTORY_RESERVATION_USER)

    const { user } = renderMenu(schedule, { route: '/schedule' })

    await user.click(await screen.findByRole('tab', { name: /item reservations/i }))

    expect(await screen.findByText('at /inventory-reservations')).toBeInTheDocument()
  })

  it('shows only the equipment tab to a member who may not book aircraft', async () => {
    // MEMBER holds inventory_reservation.user without booking.user (V2010), and
    // the aircraft calendar is not theirs to see.
    signInWithPermissions(MIKPermissions.INVENTORY_RESERVATION_USER)

    renderMenu(schedule, { route: '/inventory-reservations' })

    expect(await screen.findByRole('tab', { name: /item reservations/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /aircraft reservations/i })).toBeNull()
  })

  it('shows only the aircraft tab to a member who may not reserve equipment', async () => {
    signInWithPermissions(MIKPermissions.BOOKING_USER)

    renderMenu(schedule, { route: '/schedule' })

    expect(await screen.findByRole('tab', { name: /aircraft reservations/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /item reservations/i })).toBeNull()
  })
})

describe('HeaderSubMenu navigation', () => {
  it('navigates to a sub-item when its tab is pressed', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    const { user } = renderMenu()

    await user.click(await screen.findByRole('tab', { name: /mass/i }))

    expect(await screen.findByText('at /fly/mass-balance')).toBeInTheDocument()
  })

  it('selects the index tab on the parent path itself', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu(parent, { route: '/fly' })

    expect(await screen.findByRole('tab', { name: /aircraft/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('selects the sub-item matching the current path', async () => {
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu(parent, { route: '/fly/mass-balance' })

    expect(await screen.findByRole('tab', { name: /mass/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('does not leave the index tab selected on a nested route', async () => {
    // The index tab matches the parent path exactly, so it must not light up
    // for every route underneath it.
    signInWithPermissions(MIKPermissions.ACCESS_CODES_USER)

    renderMenu(parent, { route: '/fly/mass-balance' })

    expect(await screen.findByRole('tab', { name: /aircraft/i })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })
})
