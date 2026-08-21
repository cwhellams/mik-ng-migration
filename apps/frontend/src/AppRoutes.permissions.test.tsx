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
    expect(gatesInSource).toHaveLength(GATED_ROUTES.length)
  })

  it('gives every gated route at least one permission', () => {
    for (const route of GATED_ROUTES) {
      expect(route.permissions, route.path).not.toHaveLength(0)
    }
  })

  it('has no duplicate paths', () => {
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length)
  })

  it('has one route-level permission gate left', () => {
    // The headline number of the split, and the reason the four signed-in runs
    // of this matrix now assert that almost every page renders for everyone.
    //
    // 93 routes / 37 gated on main before #1233, which moved the 21 /admin/*
    // pages, then the 14 /accounting/* pages and the three admin-only member
    // screens, to apps/admin — whose own matrix gates all 38 of them. Every
    // gate this app had went with them.
    //
    // #1174 then added the one below: the per-member reservation efficiency
    // report, whose two ways in (the card on the member's own page and the
    // drill-down from the club-wide report in Stats) both live in this app, so
    // the page it opens does too. It is the case the comment this replaced
    // anticipated — a route that needs a gate again — and `RequirePermission`
    // being still in the tree is what made adding it a one-liner.
    //
    // #1139 added the 61st route, the item reservation calendar, ungated: the
    // menu entry asks for `inventory_reservation.user`/`.admin`, but the page
    // itself only shows what the API already filters per member, so the check
    // that matters is the API's.
    //
    // The rest is for any signed-in member by design, not by oversight. If
    // another gate is added, add its row to routeMatrix.tsx and change these
    // numbers with it — `covers every gate in AppRoutes.tsx` above is what
    // forces that.
    expect(ROUTES).toHaveLength(61)
    expect(GATED_ROUTES).toHaveLength(1)
    expect(UNGATED_ROUTES).toHaveLength(60)
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

  // The next three range over `GATED_ROUTES`, which #1233 emptied and #1174
  // refilled with exactly one entry (see above). They encode the rules any
  // member-app gate has to satisfy, so they keep earning their place whatever
  // that count is; the count assertion above is what stops them going vacuous
  // again unnoticed.
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
      MIKPermissions.INVENTORY_RESERVATION_USER,
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

  it('does not gate the members-admin report on admin mode as well', () => {
    // The one gate left is the exception rather than the rule that /club/members
    // /changelog used to be: an admin reaches it without switching admin mode on,
    // because `hasAccess` is not sudo-downgraded — only the `isXAdmin` flags are.
    // Its own API call passes `alwaysSudo`, so the page works the same either way,
    // and requiring the toggle would only make the Stats drill-down dead-end for
    // an admin who had not thought to flip it.
    const withoutAdminMode = GATED_ROUTES.filter((route) => !route.adminModeOnly)

    expect(withoutAdminMode.map((route) => route.path)).toEqual([
      '/club/members/:memberId/efficiency',
    ])
  })
})

describe('fallback route', () => {
  it('serves the 404 page for an unknown path', async () => {
    await visitRoute(authScenarios.admin, '/no-such-page')

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
    expect(isForbidden()).toBe(false)
  })
})
