import { MIKPermissions } from '@mik/contracts/members'
import { screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { authScenarios } from './test/auth'
import { aMember } from './test/fixtures'
import {
  GATED_ROUTES,
  isForbidden,
  OWN_GATES,
  PUBLIC_PATHS,
  ROUTES,
  UNGATED_ROUTES,
  visitRoute,
} from './test/routeMatrix'

/**
 * The route permission matrix — phase 3 of issue #1116, and the frontend's
 * analogue of the backend's per-endpoint permission tests.
 *
 * The matrix itself lives in the five `AppRoutes.permissions.<identity>.test.tsx`
 * files. Four visit every route as an admin in sudo mode, the same admin with
 * sudo off, an ordinary member and a member with no permissions, asserting
 * `<Forbidden />` or not. The fifth visits as a signed-out visitor and asserts a
 * redirect to /login instead, since that identity never reaches `<Forbidden />`.
 *
 * This file holds the assumptions those runs rest on: that the table still
 * matches the source, and that the identities are far enough apart for the
 * expectations to mean something.
 */
describe('route table', () => {
  it('covers every gate in AppRoutes.tsx', () => {
    // Vitest runs with the frontend package as its root.
    const source = readFileSync(resolve(process.cwd(), 'src/AppRoutes.tsx'), 'utf-8')
    const gatesInSource = source.match(/<RequirePermission/g) ?? []

    // If this fails, a route was added, removed or re-gated — update routeMatrix.tsx.
    expect(gatesInSource).toHaveLength(OWN_GATES.length)
  })

  it('gives every gated route at least one permission', () => {
    for (const route of GATED_ROUTES) {
      expect(route.permissions, route.path).not.toHaveLength(0)
    }
  })

  it('has no duplicate paths', () => {
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length)
  })

  it('is dominated by ungated routes, which rely on page- and API-level checks', () => {
    // Recorded deliberately: only 36 of the 92 routes carry a route-level gate
    // of their own, so the matrix is not on its own a complete authorisation
    // audit — most of the app is guarded further in, at the page or the API.
    expect(ROUTES).toHaveLength(93)
    expect(OWN_GATES).toHaveLength(36)
    expect(GATED_ROUTES).toHaveLength(37)
    expect(UNGATED_ROUTES).toHaveLength(56)
  })

  it('opens nothing to the public beyond the sign-in routes and the 404', () => {
    // #1132 §6d asked whether the 56 ungated routes are intentionally open. They
    // are open to any *signed-in* member by design — that is what "no route-level
    // gate" means here — and the anonymous run proves that is as far as it goes:
    // everything outside this set sends a signed-out visitor to /login.
    //
    // So an ungated route is a decision about which members may see a page, never
    // about whether the public may.
    //
    // Read out of AppRoutes.tsx rather than written down here, so adding a route
    // under AuthLayout fails with "this route is public and PUBLIC_PATHS does not
    // say so" instead of a bare waitFor timeout in the anonymous run.
    const source = readFileSync(resolve(process.cwd(), 'src/AppRoutes.tsx'), 'utf-8')
    const authLayoutBlock = source.match(/<Route element=\{<AuthLayout \/>\}>([\s\S]*?)<\/Route>/)
    expect(authLayoutBlock, 'could not find the AuthLayout block in AppRoutes.tsx').not.toBeNull()

    const authLayoutPaths = [...(authLayoutBlock?.[1] ?? '').matchAll(/path='([^']+)'/g)].map(
      (match) => match[1],
    )
    expect(authLayoutPaths.length, 'AuthLayout parsed as empty — the regex has rotted').toBe(6)

    // Plus '/*', the 404 fallback, which sits outside both layouts and so makes
    // no API call either.
    expect([...PUBLIC_PATHS].sort()).toEqual([...authLayoutPaths, '/*'].sort())

    for (const path of PUBLIC_PATHS) {
      expect(
        ROUTES.map((route) => route.path),
        `${path} is not in the route table`,
      ).toContain(path)
    }
  })

  it('demands an admin permission on every gated route', () => {
    // This is what makes "the ordinary member sees Forbidden" a real assertion
    // rather than a restatement of the rule under test.
    const memberPermissions = aMember().roles.flatMap((role) => role.permissions ?? [])

    for (const route of GATED_ROUTES) {
      expect(
        route.permissions?.some((p) => memberPermissions.includes(p)),
        route.path,
      ).toBe(false)
    }
  })

  it('never gates on a plain user permission', () => {
    const userPermissions = [
      MIKPermissions.MEMBER,
      MIKPermissions.FLIGHTLOG_USER,
      MIKPermissions.BOOKING_USER,
      MIKPermissions.AIRCRAFT_USER,
      MIKPermissions.DOCUMENT_USER,
      MIKPermissions.ACCESS_CODES_USER,
      MIKPermissions.STORE_USER,
      MIKPermissions.EXAM_USER,
      MIKPermissions.INVENTORY_USER,
      MIKPermissions.AME_USER,
      MIKPermissions.MEETING_USER,
      MIKPermissions.EXPENSE_USER,
    ]

    for (const route of GATED_ROUTES) {
      expect(
        route.permissions?.some((p) => userPermissions.includes(p)),
        route.path,
      ).toBe(false)
    }
  })

  it('gates all but one route on admin mode as well as a permission', () => {
    // /club/members/changelog is the lone gate without `adminModeOnly`, so an
    // admin reaches it without switching admin mode on — `hasAccess` is not
    // sudo-downgraded, only the `isXAdmin` flags are.
    const withoutAdminMode = GATED_ROUTES.filter((route) => !route.adminModeOnly)

    expect(withoutAdminMode.map((route) => route.path)).toEqual(['/club/members/changelog'])
  })
})

describe('fallback route', () => {
  it('serves the 404 page for an unknown path', async () => {
    await visitRoute(authScenarios.admin, '/no-such-page')

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
    expect(isForbidden()).toBe(false)
  })
})
