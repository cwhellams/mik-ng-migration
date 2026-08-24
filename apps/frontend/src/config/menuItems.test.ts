import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchPath } from 'react-router'
import { describe, expect, it } from 'vitest'

import { menuItems, type MenuItem } from './menuItems'
import { ROUTES } from '../test/routeMatrix'

/**
 * Every destination the header menu can navigate to, flattened.
 *
 * A sub-item's `path` is relative to its parent, and an empty one means the
 * parent's own index route — the same rule `HeaderSubMenu` applies when it
 * builds the link.
 */
const destinations = (items: MenuItem[], parent = ''): { path: string; label: string }[] =>
  items.flatMap((item) => {
    const full = item.path.startsWith('/')
      ? item.path
      : `${parent.replace(/\/$/, '')}${item.path ? `/${item.path}` : ''}`

    return item.subItems?.length
      ? destinations(item.subItems, full)
      : [{ path: full, label: item.label }]
  })

/**
 * The regression this file exists for.
 *
 * #1233 moved whole route subtrees to `apps/admin` over four PRs. Removing the
 * routes and removing the menu entries that point at them are two separate
 * edits, and the accounting block survived the first three: the member app kept
 * offering thirteen invoicing menu items that 404'd on click. Nothing failed,
 * because no test connected the menu to the router.
 *
 * `ROUTES` is the route matrix's table, which `AppRoutes.permissions.test.tsx`
 * already pins to the real `AppRoutes.tsx`. So a menu item that matches nothing
 * here matches nothing in the app.
 */
describe('header menu', () => {
  const all = destinations(menuItems)

  it('has destinations to check', () => {
    // Guards the two regexes above from silently flattening to nothing and
    // making every assertion below vacuous.
    expect(all.length).toBeGreaterThan(20)
  })

  it('points every item at a route the app actually serves', () => {
    const routePatterns = ROUTES.map((route) => route.path)

    const broken = all.filter(
      ({ path }) => !routePatterns.some((pattern) => matchPath(pattern, path) !== null),
    )

    expect(
      broken.map(({ path, label }) => `${path} (${label})`),
      'menu items pointing at routes that do not exist',
    ).toEqual([])
  })

  it('never points at a path the app only serves as a redirect out to the admin app', () => {
    // Matching a route is not good enough on its own: the `AdminAppRedirect`
    // routes exist solely so an old bookmark is forwarded rather than 404ing.
    // Offering one from the menu sends a member on a round trip to a different
    // app for a page this one is deliberately no longer supposed to have.
    //
    // Read out of AppRoutes.tsx rather than listed here, so a redirect added
    // for the next domain to move is covered without anyone remembering to
    // update this test.
    const source = readFileSync(resolve(process.cwd(), 'src/AppRoutes.tsx'), 'utf-8')
    const redirects = [
      ...source.matchAll(/<Route\s+path='([^']+)'\s+element=\{<AdminAppRedirect \/>\}/g),
    ].map((match) => match[1])

    // Exact count, not just non-zero — matching the convention this file's own
    // sibling (AppRoutes.permissions.test.tsx) already uses for source-derived
    // counts. A Copilot review suggested loosening this to `.toBeGreaterThan(0)`
    // so a legitimate new redirect wouldn't need the test updated; that reads
    // as brittleness but is the deliberate mechanism the rest of the suite
    // relies on — a route table changing size is exactly the moment a human is
    // meant to look at what changed, not something to average away. Kept.
    expect(redirects.length, 'no AdminAppRedirect routes found — the regex has rotted').toBe(5)

    // Three of the five are written relative to their parent `<Route path='/club'>`,
    // so they are matched by suffix rather than by pattern.
    const isRedirect = (path: string) =>
      redirects.some((pattern) =>
        pattern.startsWith('/') ? matchPath(pattern, path) !== null : path.endsWith(`/${pattern}`),
      )

    const offered = all.filter(({ path }) => isRedirect(path))

    expect(
      offered.map(({ path, label }) => `${path} (${label})`),
      'menu items pointing into the admin app',
    ).toEqual([])
  })

  it('has no duplicate destinations', () => {
    const paths = all.map(({ path }) => path)
    expect(paths.length - new Set(paths).size).toBe(0)
  })
})
