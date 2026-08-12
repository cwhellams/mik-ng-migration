import { MIKPermissions } from '@mik/contracts/members'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import RequirePermission from '../components/RequirePermission'
import { useRoles } from '../hooks/useRoles'
import { authScenarios, renderAs, signInWithPermissions } from './auth'
import {
  aBooking,
  aFlightLog,
  aMember,
  anAircraft,
  AIRCRAFT_REGISTRATION,
  MEMBER_ID,
} from './fixtures'
import { renderHookWithProviders, renderWithProviders } from './renderWithProviders'

/**
 * Smoke tests for the test harness itself (issue #1116, phase 0).
 *
 * Everything downstream — hook tests, component tests, the route permission
 * matrix — is built on these pieces, so a break here should surface as one
 * obvious failure rather than as a hundred confusing ones.
 */
describe('test harness', () => {
  describe('fixtures', () => {
    it('share the backend suite’s cast of characters', () => {
      expect(aMember().memberId).toBe(MEMBER_ID)
      expect(anAircraft().registration).toBe(AIRCRAFT_REGISTRATION)
      expect(aBooking().registration).toBe(AIRCRAFT_REGISTRATION)
      expect(aFlightLog().picMemberId).toBe(MEMBER_ID)
    })

    it('apply overrides on top of a complete entity', () => {
      const member = aMember({ medicalExpiry: '2020-01-01' })

      expect(member.medicalExpiry).toBe('2020-01-01')
      expect(member.firstName).toBe('Matti')
    })

    it('derive flight log times consistently', () => {
      const log = aFlightLog()

      expect(log.blockMins).toBe(120)
      expect(log.blockTime).toBe('02:00')
      expect(log.flightMins).toBe(100)
      expect(log.flightTime).toBe('01:40')
    })
  })

  describe('renderWithProviders', () => {
    it('renders MUI components with translations in English', async () => {
      renderWithProviders(
        <RequirePermission permissions={[MIKPermissions.EXAM_ADMIN]}>
          <div />
        </RequirePermission>,
      )

      // The permission is not granted by the default member, so Forbidden renders.
      expect(await screen.findByText('Access denied')).toBeInTheDocument()
    })

    it('stubs Iconify so no icon is fetched over the network', async () => {
      renderWithProviders(
        <RequirePermission permissions={[MIKPermissions.EXAM_ADMIN]}>
          <div />
        </RequirePermission>,
      )

      await screen.findByText('Access denied')
      expect(screen.getAllByTestId('icon').map((icon) => icon.dataset.icon)).toEqual([
        'mdi:lock-alert',
        'mdi:home',
      ])
    })
  })

  describe('MSW defaults', () => {
    it('feed useRoles from the default handlers', async () => {
      const { result } = renderHookWithProviders(() => useRoles())

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.me?.memberId).toBe(MEMBER_ID)
      expect(result.current.hasAccess(MIKPermissions.MEMBER)).toBe(true)
      expect(result.current.hasAccess(MIKPermissions.MEMBER_ADMIN)).toBe(false)
      expect(result.current.permissions.length).toBeGreaterThan(0)
    })

    it('let a test sign in with an arbitrary permission set', async () => {
      signInWithPermissions(MIKPermissions.EXPENSE_ADMIN)

      const { result } = renderHookWithProviders(() => useRoles())

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.hasAccess(MIKPermissions.EXPENSE_ADMIN)).toBe(true)
    })
  })

  describe('auth scenarios', () => {
    it('let an admin in sudo mode through an admin-only gate', async () => {
      renderAs(
        authScenarios.admin,
        <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]} adminModeOnly>
          <span>member admin page</span>
        </RequirePermission>,
      )

      expect(await screen.findByText('member admin page')).toBeInTheDocument()
    })

    it('block the same admin when sudo is off', async () => {
      renderAs(
        authScenarios.adminNoSudo,
        <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]} adminModeOnly>
          <span>member admin page</span>
        </RequirePermission>,
      )

      expect(await screen.findByText('Access denied')).toBeInTheDocument()
      expect(screen.queryByText('member admin page')).not.toBeInTheDocument()
    })

    it('block a member holding no permissions', async () => {
      renderAs(
        authScenarios.none,
        <RequirePermission permissions={[MIKPermissions.MEMBER]}>
          <span>club page</span>
        </RequirePermission>,
      )

      expect(await screen.findByText('Access denied')).toBeInTheDocument()
    })
  })
})
