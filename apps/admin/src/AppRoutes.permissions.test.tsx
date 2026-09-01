import { MIKPermissions } from '@mik/contracts/members'
import { screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { navGroups } from './config/navItems'
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
 * The admin app's route permission matrix (#1233), the counterpart of
 * `apps/frontend`'s.
 *
 * The matrix itself lives in the five `AppRoutes.permissions.<identity>.test.tsx`
 * files. This file holds the assumptions those runs rest on: that the table
 * still matches the source, that the identities are far enough apart for the
 * expectations to mean something, and — new here — that the sidebar never
 * offers a link the route behind it will refuse.
 */
describe('route table', () => {
  it('covers every gate in AppRoutes.tsx', () => {
    // Vitest runs with the admin package as its root.
    const source = readFileSync(resolve(process.cwd(), 'src/AppRoutes.tsx'), 'utf-8')
    const gatesInSource = source.match(/<RequirePermission/g) ?? []

    // '/' is a bare `<Navigate>` with no `RequirePermission` of its own — its
    // row in the matrix just mirrors the redirect target's expectation — so it
    // is excluded here rather than counted as a gate the source doesn't have.
    const gatedRoutesWithTheirOwnGate = GATED_ROUTES.filter((route) => route.path !== '/')

    // If this fails, a route was added, removed or re-gated — update routeMatrix.tsx.
    expect(gatesInSource).toHaveLength(gatedRoutesWithTheirOwnGate.length)
  })

  it('gives every gated route at least one permission', () => {
    for (const route of GATED_ROUTES) {
      expect(route.permissions, route.path).not.toHaveLength(0)
    }
  })

  it('has no duplicate paths', () => {
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length)
  })

  it('gates every page that is not the shell or the sign-in flow', () => {
    // The inverse of apps/frontend's equivalent assertion, and the point of the
    // split: over there most routes carry no route-level gate because most
    // pages are for every member. Here the only ungated routes are `/` (a
    // redirect), the four sign-in routes and the 404 — the dashboard used to be
    // ungated too, until a member with no admin permissions at all turned out
    // to be able to load it and see an empty shell (#1233 follow-up).
    expect(ROUTES).toHaveLength(56)
    // 21 from the /admin/* subtree, 14 from /accounting/*, 3 member-admin
    // screens, 3 split out of interleaved member pages, the dashboard itself,
    // and `/`, which inherits the dashboard's expectation since it redirects
    // straight there. (21 rather than the member app's 22: its /admin index
    // route was a bare redirect to /admin/outbox, which this app does not
    // need — `/` goes to the dashboard.)
    //
    // #1119 added four: the treasurer's fuel tax page and the three
    // liquid-admin console pages (records, oil inventory, QR codes) — the
    // back-office half of the Liquid Management System. Reporting stayed in
    // the member app, ungated there for the same reason /inventory is.
    //
    // #1230 added one more: /findings, the fleet-wide defect and remark search
    // and monitoring tool. It is a new page rather than a moved one — the
    // per-aircraft defect and remark views it complements are still in the
    // member app, where a pilot at the aircraft needs them.
    //
    // #1323 added two more: /stats/dto and /stats/oil-fuel-uplift, filling in
    // stats the backend already exposed but neither app rendered — see that
    // issue's stat-explanation rollout.
    expect(GATED_ROUTES).toHaveLength(51)
    expect(UNGATED_ROUTES.map((route) => route.path).sort()).toEqual(
      ['/*', '/login', '/login/sent', '/login/validate', '/logout'].sort(),
    )
  })

  it('opens nothing to the public beyond the sign-in routes and the 404', () => {
    // Read out of AppRoutes.tsx rather than written down here, so adding a route
    // under AuthLayout fails with a clear message instead of a bare waitFor
    // timeout in the anonymous run.
    const source = readFileSync(resolve(process.cwd(), 'src/AppRoutes.tsx'), 'utf-8')
    const authLayoutBlock = source.match(/<Route element=\{<AuthLayout \/>\}>([\s\S]*?)<\/Route>/)
    expect(authLayoutBlock, 'could not find the AuthLayout block in AppRoutes.tsx').not.toBeNull()

    const authLayoutPaths = [...(authLayoutBlock?.[1] ?? '').matchAll(/path='([^']+)'/g)].map(
      (match) => match[1],
    )
    expect(authLayoutPaths.length, 'AuthLayout parsed as empty — the regex has rotted').toBe(4)

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
})

describe('sidebar navigation', () => {
  const navItems = navGroups.flatMap((group) => group.items)

  it('points every item at a route that exists', () => {
    const paths = new Set(ROUTES.map((route) => route.path))

    for (const item of navItems) {
      expect(paths, `${item.label} points at ${item.path}, which is not a route`).toContain(
        item.path,
      )
    }
  })

  it('asks for exactly the permissions its route demands', () => {
    // The failure this prevents is a visible menu item that leads straight to a
    // 403 — worse than no item at all, because the admin cannot tell whether
    // the page is broken or simply not theirs.
    for (const item of navItems) {
      const route = ROUTES.find((candidate) => candidate.path === item.path)
      expect([...item.permissions].sort(), `nav item ${item.label}`).toEqual(
        [...(route?.permissions ?? [])].sort(),
      )
    }
  })

  it('has no duplicate destinations', () => {
    expect(new Set(navItems.map((item) => item.path)).size).toBe(navItems.length)
  })

  it('reaches every gated route except the detail pages opened from within one', () => {
    // A gated route with no sidebar entry has to be reachable some other way.
    // The five below are: each is opened from the list page above it. `/` is
    // reachable too, just not by a sidebar link — it is the app's own index
    // redirect to `/dashboard`.
    const reachedFromAList = [
      '/shop/orders/:orderId',
      '/exams/versions/:versionId',
      '/dto/syllabi/:syllabusId',
      '/dto/programs/:programId/import',
      '/accounting/expenses/:id',
      '/',
    ]
    const linked = new Set(navItems.map((item) => item.path))

    const orphans = GATED_ROUTES.map((route) => route.path).filter(
      (path) => !linked.has(path) && !reachedFromAList.includes(path),
    )

    expect(orphans, 'gated routes with no way in').toEqual([])
  })
})

describe('fallback route', () => {
  it('serves the 404 page for an unknown path', async () => {
    await visitRoute(authScenarios.superuser, '/no-such-page')

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
    expect(isForbidden()).toBe(false)
  })
})
