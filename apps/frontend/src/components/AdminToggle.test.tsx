import { MIKPermissions } from '@backend/routes/members/models'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { signInAs, signInWithPermissions } from '../test/auth'
import { aMember } from '../test/fixtures'
import { renderWithProviders } from '../test/renderWithProviders'
import AdminToggle from './AdminToggle'

const TOGGLE = 'Toggle admin mode'

describe('AdminToggle visibility', () => {
  it('stays hidden for an ordinary member', async () => {
    signInAs(aMember())

    renderWithProviders(<AdminToggle />)

    // Nothing to wait for when it never appears, so give the fetch a chance to
    // land before concluding.
    await waitFor(() => expect(screen.queryByRole('button', { name: TOGGLE })).toBeNull())
  })

  it.each([
    MIKPermissions.MEMBER_ADMIN,
    MIKPermissions.FLIGHTLOG_ADMIN,
    MIKPermissions.BOOKING_ADMIN,
    MIKPermissions.AIRCRAFT_ADMIN,
    MIKPermissions.INVOICING_ADMIN,
    MIKPermissions.ACCESS_CODES_ADMIN,
    MIKPermissions.FUEL_PRICES_ADMIN,
    MIKPermissions.DOCUMENT_ADMIN,
    MIKPermissions.SMS_PROCESSOR,
    MIKPermissions.SMS_MANAGER,
    MIKPermissions.STORE_ADMIN,
    MIKPermissions.EXAM_ADMIN,
    MIKPermissions.DTO_ADMIN,
    MIKPermissions.EVENTS_ADMIN,
    MIKPermissions.EXPENSE_ADMIN,
    MIKPermissions.EXPENSE_HETU_ADMIN,
    MIKPermissions.INVENTORY_ADMIN,
    MIKPermissions.AME_ADMIN,
    MIKPermissions.MEETING_ADMIN,
    MIKPermissions.OUTBOX_ADMIN,
  ])('appears for a member holding %s', async (permission) => {
    signInWithPermissions(permission)

    renderWithProviders(<AdminToggle />)

    expect(await screen.findByRole('button', { name: TOGGLE })).toBeInTheDocument()
  })
})

describe('AdminToggle behaviour', () => {
  it('shows the plain user icon while admin mode is off', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(<AdminToggle />, { sudo: false })

    await screen.findByRole('button', { name: TOGGLE })
    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:user')
  })

  it('shows the administrator icon while admin mode is on', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(<AdminToggle />, { sudo: true })

    await screen.findByRole('button', { name: TOGGLE })
    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:administrator')
  })

  it('turns admin mode on when pressed', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    const { user } = renderWithProviders(<AdminToggle />, { sudo: false })

    await user.click(await screen.findByRole('button', { name: TOGGLE }))

    await waitFor(() =>
      expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:administrator'),
    )
  })

  it('turns it off again', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    const { user } = renderWithProviders(<AdminToggle />, { sudo: true })

    await user.click(await screen.findByRole('button', { name: TOGGLE }))

    await waitFor(() => expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:user'))
  })
})
