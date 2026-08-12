import { MIKPermissions } from '@mik/contracts/members'
import { screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import { authScenarios, renderAs, signInAs, signInWithPermissions } from '../test/auth'
import { anAdmin } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/renderWithProviders'
import RequirePermission from './RequirePermission'

/**
 * The gate itself. `AppRoutes.permissions.*.test.tsx` checks that each route is
 * wired to the right permissions; this checks that the wiring means what the
 * matrix assumes it means.
 */
const PROTECTED = 'the protected page'

const gate = (permissions: MIKPermissions[], adminModeOnly = false) => (
  <RequirePermission permissions={permissions} adminModeOnly={adminModeOnly}>
    <span>{PROTECTED}</span>
  </RequirePermission>
)

const shown = async () => {
  expect(await screen.findByText(PROTECTED)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '403' })).toBeNull()
}

const forbidden = async () => {
  expect(await screen.findByRole('heading', { name: '403' })).toBeInTheDocument()
  expect(screen.queryByText(PROTECTED)).toBeNull()
  expect(screen.getByText('Access denied')).toBeInTheDocument()
}

describe('RequirePermission while loading', () => {
  it('renders nothing at all until the permissions are known', () => {
    // Rendering the children first would flash protected content; rendering
    // Forbidden first would flash a spurious error.
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN]))

    expect(screen.queryByText(PROTECTED)).toBeNull()
    expect(screen.queryByRole('heading', { name: '403' })).toBeNull()
  })

  it('settles on the children once they are', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN]))

    await shown()
  })
})

describe('RequirePermission without admin mode required', () => {
  it('admits a member holding the permission', async () => {
    signInWithPermissions(MIKPermissions.EXPENSE_ADMIN)

    renderWithProviders(gate([MIKPermissions.EXPENSE_ADMIN]))

    await shown()
  })

  it('admits a member holding any one of several permissions', async () => {
    signInWithPermissions(MIKPermissions.STORE_USER)

    renderWithProviders(gate([MIKPermissions.STORE_ADMIN, MIKPermissions.STORE_USER]))

    await shown()
  })

  it('turns away a member without the permission', async () => {
    signInWithPermissions(MIKPermissions.MEMBER)

    renderWithProviders(gate([MIKPermissions.EXPENSE_ADMIN]))

    await forbidden()
  })

  it('turns away a member with no permissions at all', async () => {
    renderAs(authScenarios.none, gate([MIKPermissions.MEMBER]))

    await forbidden()
  })

  it('admits an admin whose admin mode is off', async () => {
    // `hasAccess` is not sudo-downgraded — only the `isXAdmin` flags are. This
    // is why /club/members/changelog is reachable without switching admin mode
    // on, unlike every other gated route.
    signInAs(anAdmin())

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN]), { sudo: false })

    await shown()
  })

  it('admits anyone when no permission is demanded', async () => {
    renderAs(authScenarios.none, gate([]))

    await shown()
  })
})

describe('RequirePermission with adminModeOnly', () => {
  it('admits a permitted member in admin mode', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN], true), { sudo: true })

    await shown()
  })

  it('turns away the same member with admin mode off', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN], true), { sudo: false })

    await forbidden()
  })

  it('turns away an unpermitted member even in admin mode', async () => {
    signInWithPermissions(MIKPermissions.MEMBER)

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN], true), { sudo: true })

    await forbidden()
  })

  it('demands both the permission and admin mode, never one or the other', async () => {
    // The full truth table for the flag, in one place.
    const cases = [
      { permission: MIKPermissions.MEMBER_ADMIN, sudo: true, admitted: true },
      { permission: MIKPermissions.MEMBER_ADMIN, sudo: false, admitted: false },
      { permission: MIKPermissions.MEMBER, sudo: true, admitted: false },
      { permission: MIKPermissions.MEMBER, sudo: false, admitted: false },
    ]

    for (const { permission, sudo, admitted } of cases) {
      signInWithPermissions(permission)
      const { unmount } = renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN], true), { sudo })

      if (admitted) {
        await shown()
      } else {
        await forbidden()
      }
      unmount()
    }
  })

  it('admits an admin holding every permission — the matrix’s admin scenario', async () => {
    renderAs(authScenarios.admin, gate([MIKPermissions.OUTBOX_ADMIN], true))

    await shown()
  })

  it('turns that admin away once sudo is off — the matrix’s adminNoSudo scenario', async () => {
    renderAs(authScenarios.adminNoSudo, gate([MIKPermissions.OUTBOX_ADMIN], true))

    await forbidden()
  })
})

describe('RequirePermission when the profile cannot be loaded', () => {
  it('keeps the gate closed rather than failing open', async () => {
    server.use(http.get(apiUrl('v1/members/me'), () => problemResponse(500, 'Database down')))

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN]))

    await forbidden()
  })

  it('opens the gate while the roles catalogue is unavailable', async () => {
    // Permissions come from the member, not the catalogue, so a failing
    // catalogue must not change the answer either way.
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)
    server.use(http.get(apiUrl('v1/members/roles'), () => problemResponse(403, 'Forbidden')))

    renderWithProviders(gate([MIKPermissions.MEMBER_ADMIN]))

    await shown()
  })
})

describe('Forbidden page', () => {
  it('offers a way back to the dashboard', async () => {
    renderAs(authScenarios.none, gate([MIKPermissions.MEMBER_ADMIN]))

    await forbidden()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Back to homepage' })).toHaveAttribute('href', '/'),
    )
  })
})
