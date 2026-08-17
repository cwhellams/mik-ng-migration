import { MIKPermissions, downgradePermission } from '@mik/contracts/members'
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

  // Driven off `downgradePermission` rather than a list written out here, because
  // a list written out here is exactly what went wrong: the component used to
  // carry its own copy of these 21 permissions and it had drifted from the
  // function the backend actually applies. Enumerating MIKPermissions means a new
  // permission is covered the day it is added, in whichever direction it belongs.
  const sudoRelevant = Object.values(MIKPermissions).filter(
    (permission) => downgradePermission(permission) !== permission,
  )
  const ordinary = Object.values(MIKPermissions).filter(
    (permission) => downgradePermission(permission) === permission,
  )

  it('has both kinds of permission to test', () => {
    // Guards the two tables below against silently emptying if the enum or
    // downgradePermission is restructured.
    expect(sudoRelevant.length).toBeGreaterThan(15)
    expect(ordinary.length).toBeGreaterThan(0)
  })

  it.each(sudoRelevant)('appears for a member holding %s', async (permission) => {
    signInWithPermissions(permission)

    renderWithProviders(<AdminToggle />)

    expect(await screen.findByRole('button', { name: TOGGLE })).toBeInTheDocument()
  })

  it.each(ordinary)('stays hidden for a member holding only %s', async (permission) => {
    signInWithPermissions(permission)

    renderWithProviders(<AdminToggle />)

    await waitFor(() => expect(screen.queryByRole('button', { name: TOGGLE })).toBeNull())
  })

  it('appears for a CAMO reviewer', async () => {
    // Kept explicit as well as covered by the table above: CAMO_USER is the
    // permission the old hardcoded list omitted. The backend strips it outside
    // sudo mode, so without a toggle a CAMO reviewer could never turn admin mode
    // on and never reach the occurrence endpoints the permission is for.
    signInWithPermissions(MIKPermissions.CAMO_USER)

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
