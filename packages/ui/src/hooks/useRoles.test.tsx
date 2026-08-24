import { MIKPermissions } from '@mik/contracts/members'
import { waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { signInAs, signInWithPermissions } from '../test/auth'
import { ADMIN_ROLE, aMember, aMemberWithoutPermissions, anAdmin } from '../test/fixtures'
import { apiUrl, problemResponse } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { renderHookWithProviders } from '../test/renderWithProviders'
import { useRoles } from './useRoles'
import { http } from 'msw'

/**
 * `useRoles` is where the frontend decides what a member may see. It mirrors the
 * backend's `downgradePermission` rule: an admin permission only counts for the
 * `isXAdmin` flags while sudo (admin mode) is switched on.
 */

const renderRoles = (options: Parameters<typeof renderHookWithProviders>[1] = {}) =>
  renderHookWithProviders(() => useRoles(), options)

/** Waits for the profile fetch to land, then hands the render result back. */
const settled = async <T extends { result: { current: ReturnType<typeof useRoles> } }>(
  rendered: T,
): Promise<T> => {
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false))
  return rendered
}

describe('useRoles permissions', () => {
  it('grants a permission the member actually holds', async () => {
    signInWithPermissions(MIKPermissions.EXPENSE_USER)

    const { result } = await settled(renderRoles())

    expect(result.current.hasAccess(MIKPermissions.EXPENSE_USER)).toBe(true)
    expect(result.current.hasAccess(MIKPermissions.EXPENSE_ADMIN)).toBe(false)
  })

  it('grants access when the member holds any one of several permissions', async () => {
    signInWithPermissions(MIKPermissions.STORE_USER)

    const { result } = await settled(renderRoles())

    expect(result.current.hasAccess(MIKPermissions.STORE_ADMIN, MIKPermissions.STORE_USER)).toBe(
      true,
    )
  })

  it('grants access when no permission is required at all', async () => {
    signInAs(aMemberWithoutPermissions())

    const { result } = await settled(renderRoles())

    expect(result.current.hasAccess()).toBe(true)
  })

  it('denies everything for a member with no roles', async () => {
    signInAs(aMemberWithoutPermissions())

    const { result } = await settled(renderRoles())

    expect(result.current.hasAccess(MIKPermissions.MEMBER)).toBe(false)
    expect(result.current.isMembersAdmin).toBe(false)
  })

  it('flattens permissions across several roles', async () => {
    const { result } = await settled(renderRoles())

    // The default member carries MEMBER + FLYING_MEMBER.
    expect(result.current.hasAccess(MIKPermissions.MEMBER)).toBe(true)
    expect(result.current.hasAccess(MIKPermissions.BOOKING_USER)).toBe(true)
    expect(result.current.hasAccess(MIKPermissions.DOCUMENT_USER)).toBe(true)
  })

  it('exposes the member alongside the permission helpers', async () => {
    const { result } = await settled(renderRoles())

    expect(result.current.me?.memberId).toBe('Matti1')
  })
})

describe('useRoles admin flags and sudo', () => {
  it('withholds admin flags while sudo is off, even from a real admin', async () => {
    signInAs(anAdmin())

    const { result } = await settled(renderRoles({ sudo: false }))

    expect(result.current.isMembersAdmin).toBe(false)
    expect(result.current.isFlightLogAdmin).toBe(false)
    expect(result.current.hasSudoAccess(MIKPermissions.INVOICING_ADMIN)).toBe(false)
  })

  it('grants admin flags once sudo is on', async () => {
    signInAs(anAdmin())

    const { result } = await settled(renderRoles({ sudo: true }))

    expect(result.current.isMembersAdmin).toBe(true)
    expect(result.current.isFlightLogAdmin).toBe(true)
    expect(result.current.hasSudoAccess(MIKPermissions.INVOICING_ADMIN)).toBe(true)
  })

  it('keeps hasAccess itself un-downgraded — only the flags are sudo-gated', async () => {
    // Worth pinning: `RequirePermission` without `adminModeOnly` therefore still
    // passes an admin permission while sudo is off.
    signInAs(anAdmin())

    const { result } = await settled(renderRoles({ sudo: false }))

    expect(result.current.hasAccess(MIKPermissions.MEMBER_ADMIN)).toBe(true)
    expect(result.current.isMembersAdmin).toBe(false)
  })

  it('grants no admin flag to a plain member however sudo is set', async () => {
    signInAs(aMember())

    const { result } = await settled(renderRoles({ sudo: true }))

    expect(result.current.isMembersAdmin).toBe(false)
    expect(result.current.isBookingAdmin).toBe(false)
  })
})

describe('useRoles hasSudoAccess', () => {
  // #1115 §10 replaced fifteen `is<X>Admin` / `is<X>User` flags with these two
  // accessors, so what used to be per-flag coverage is now coverage of the pair.
  it('is the sudo-gated counterpart of hasAccess', async () => {
    signInWithPermissions(MIKPermissions.STORE_ADMIN)

    const withoutSudo = await settled(renderRoles({ sudo: false }))
    expect(withoutSudo.result.current.hasAccess(MIKPermissions.STORE_ADMIN)).toBe(true)
    expect(withoutSudo.result.current.hasSudoAccess(MIKPermissions.STORE_ADMIN)).toBe(false)

    const withSudo = await settled(renderRoles({ sudo: true }))
    expect(withSudo.result.current.hasSudoAccess(MIKPermissions.STORE_ADMIN)).toBe(true)
  })

  it('matches any of several permissions, like hasAccess', async () => {
    signInWithPermissions(MIKPermissions.MEETING_ADMIN)

    const { result } = await settled(renderRoles({ sudo: true }))

    expect(
      result.current.hasSudoAccess(MIKPermissions.INVENTORY_ADMIN, MIKPermissions.MEETING_ADMIN),
    ).toBe(true)
    expect(result.current.hasSudoAccess(MIKPermissions.INVENTORY_ADMIN)).toBe(false)
  })

  it('grants nothing to a member who lacks the permission, sudo or not', async () => {
    signInAs(aMember())

    const withSudo = await settled(renderRoles({ sudo: true }))

    expect(withSudo.result.current.hasSudoAccess(MIKPermissions.MEETING_ADMIN)).toBe(false)
  })

  it('treats an admin permission as satisfying the matching user check without sudo', async () => {
    // The pattern the removed `is<X>User` flags encoded: an admin is also a user,
    // and that half is deliberately not sudo-gated.
    signInWithPermissions(MIKPermissions.STORE_ADMIN)

    const { result } = await settled(renderRoles({ sudo: false }))

    expect(result.current.hasAccess(MIKPermissions.STORE_USER, MIKPermissions.STORE_ADMIN)).toBe(
      true,
    )
  })
})

describe('useRoles user-level flags', () => {
  it('treats DTO_INSTRUCTOR as ungated, unlike DTO_ADMIN', async () => {
    signInWithPermissions(MIKPermissions.DTO_INSTRUCTOR)

    const { result } = await settled(renderRoles({ sudo: false }))

    expect(result.current.isDtoInstructor).toBe(true)
  })

  it('lets a DTO admin act as an instructor only in sudo mode', async () => {
    signInWithPermissions(MIKPermissions.DTO_ADMIN)

    const withoutSudo = await settled(renderRoles({ sudo: false }))
    expect(withoutSudo.result.current.isDtoInstructor).toBe(false)

    const withSudo = await settled(renderRoles({ sudo: true }))
    expect(withSudo.result.current.isDtoInstructor).toBe(true)
  })
})

describe('useRoles sudoers', () => {
  it('marks a member holding a downgradable permission as a sudoer', async () => {
    signInWithPermissions(MIKPermissions.MEMBER_ADMIN)

    const { result } = await settled(renderRoles())

    expect(result.current.sudoers).toBe(true)
  })

  it('does not mark an ordinary member as a sudoer', async () => {
    signInAs(aMember())

    const { result } = await settled(renderRoles())

    expect(result.current.sudoers).toBe(false)
  })

  it.each([
    MIKPermissions.OUTBOX_ADMIN,
    MIKPermissions.SMS_MANAGER,
    MIKPermissions.EXPENSE_HETU_ADMIN,
    MIKPermissions.EVENTS_ADMIN,
  ])('marks a member holding %s as a sudoer', async (permission) => {
    // These have no user-level equivalent, so downgradePermission drops them
    // entirely — which counts as "different" and reveals the admin-mode toggle.
    signInWithPermissions(permission)

    const { result } = await settled(renderRoles())

    expect(result.current.sudoers).toBe(true)
  })

  it('also marks a CAMO user as a sudoer, despite the user-level name', async () => {
    // CAMO_USER is in the drop-entirely list alongside the admin permissions, so
    // a CAMO reviewer has to switch admin mode on to use their access.
    signInWithPermissions(MIKPermissions.CAMO_USER)

    const { result } = await settled(renderRoles())

    expect(result.current.sudoers).toBe(true)
  })
})

describe('useRoles catalogue', () => {
  it('exposes the role and permission catalogue from the API', async () => {
    const { result } = await settled(renderRoles())

    expect(result.current.roles.map((role) => role.roleId)).toContain(ADMIN_ROLE.roleId)
    expect(result.current.permissions).toContain(MIKPermissions.MEMBER_ADMIN)
    expect(result.current.error).toBeUndefined()
  })

  it('falls back to empty lists and reports the problem when the catalogue fails', async () => {
    server.use(http.get(apiUrl('v1/members/roles'), () => problemResponse(403, 'Forbidden')))

    const { result } = await settled(renderRoles())

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.roles).toEqual([])
    expect(result.current.permissions).toEqual([])
    // Permission checks still work — they come from the member, not the catalogue.
    expect(result.current.hasAccess(MIKPermissions.MEMBER)).toBe(true)
  })
})
