import { MIKPermissions } from '@mik/contracts/members'
import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import AppRoutes from '../AppRoutes'
import { useRoles } from '../hooks/useRoles'
import { authScenarios, renderAs, signInAs, type AuthScenario } from './auth'
import { apiUrl, problemResponse } from './msw/handlers'
import { server } from './msw/server'
import { renderWithProviders } from './renderWithProviders'

/**
 * Every leaf route in `AppRoutes.tsx`, with the permission gate it carries.
 *
 * The admin app's analogue of `apps/frontend/src/test/routeMatrix.tsx`, with
 * one axis removed: there is no `adminModeOnly`, because there is no sudo
 * toggle here (#1233, answer 1). Holding the permission is the whole gate, so
 * the expectation below is derived from the signed-in member's permissions
 * rather than from a second rule that could drift from the first.
 *
 * `AppRoutes.permissions.test.tsx` keeps the table honest — it fails if the
 * number of gates in the source stops matching the number of gated entries
 * here.
 */
export interface RouteUnderTest {
  /** The route pattern as written in AppRoutes.tsx. */
  path: string
  /** A concrete URL to visit, with any path parameters filled in. */
  url: string
  /** Permissions the route's `RequirePermission` demands; absent when ungated. */
  permissions?: MIKPermissions[]
}

export const ROUTES: RouteUnderTest[] = [
  { path: '/', url: '/' },
  { path: '/dashboard', url: '/dashboard' },

  { path: '/outbox', url: '/outbox', permissions: [MIKPermissions.OUTBOX_ADMIN] },
  { path: '/non-renewals', url: '/non-renewals', permissions: [MIKPermissions.MEMBER_ADMIN] },
  {
    path: '/notification-banner',
    url: '/notification-banner',
    permissions: [MIKPermissions.MEMBER_ADMIN],
  },
  { path: '/phone-numbers', url: '/phone-numbers', permissions: [MIKPermissions.MEMBER_ADMIN] },

  { path: '/shop', url: '/shop', permissions: [MIKPermissions.STORE_ADMIN] },
  { path: '/shop/products', url: '/shop/products', permissions: [MIKPermissions.STORE_ADMIN] },
  { path: '/shop/categories', url: '/shop/categories', permissions: [MIKPermissions.STORE_ADMIN] },
  { path: '/shop/orders', url: '/shop/orders', permissions: [MIKPermissions.STORE_ADMIN] },
  {
    path: '/shop/orders/:orderId',
    url: '/shop/orders/1',
    permissions: [MIKPermissions.STORE_ADMIN],
  },
  {
    path: '/shop/discount-codes',
    url: '/shop/discount-codes',
    permissions: [MIKPermissions.STORE_ADMIN],
  },
  {
    path: '/shop/flight-packages',
    url: '/shop/flight-packages',
    permissions: [MIKPermissions.STORE_ADMIN],
  },

  { path: '/events', url: '/events', permissions: [MIKPermissions.EVENTS_ADMIN] },

  { path: '/exams', url: '/exams', permissions: [MIKPermissions.EXAM_ADMIN] },
  {
    path: '/exams/versions/:versionId',
    url: '/exams/versions/ver-1',
    permissions: [MIKPermissions.EXAM_ADMIN],
  },
  { path: '/exams/attempts', url: '/exams/attempts', permissions: [MIKPermissions.EXAM_ADMIN] },

  { path: '/dto', url: '/dto', permissions: [MIKPermissions.DTO_ADMIN] },
  {
    path: '/dto/syllabi/:syllabusId',
    url: '/dto/syllabi/syl-1',
    permissions: [MIKPermissions.DTO_ADMIN],
  },
  {
    path: '/dto/programs/:programId/import',
    url: '/dto/programs/prog-1/import',
    permissions: [MIKPermissions.DTO_ADMIN],
  },

  { path: '/inventory', url: '/inventory', permissions: [MIKPermissions.INVENTORY_ADMIN] },
  { path: '/ame', url: '/ame', permissions: [MIKPermissions.AME_ADMIN] },
  { path: '/meetings', url: '/meetings', permissions: [MIKPermissions.MEETING_ADMIN] },

  { path: '/login', url: '/login' },
  { path: '/login/sent', url: '/login/sent' },
  { path: '/login/validate', url: '/login/validate' },
  { path: '/logout', url: '/logout' },
  { path: '/*', url: '/no-such-page' },
]

export const GATED_ROUTES = ROUTES.filter((route) => route.permissions)
export const UNGATED_ROUTES = ROUTES.filter((route) => !route.permissions)

/**
 * The four signed-in identities, asserted with `expectedForbidden`.
 *
 * `authScenarios.anonymous` is the fifth run but not a member of this list: a
 * signed-out visitor is never shown `<Forbidden />`, they are redirected, so
 * that run has its own harness (`runAnonymousRouteMatrix`).
 */
export const MATRIX_SCENARIOS = [
  authScenarios.superuser,
  authScenarios.clubAdmin,
  authScenarios.user,
  authScenarios.none,
] as const

/**
 * The routes served by `AuthLayout`, which a signed-out visitor is meant to
 * reach — they are how you sign in — plus `/*`, the 404 fallback, which sits
 * outside both layouts. Nothing under here calls the API, so nothing redirects.
 */
export const PUBLIC_PATHS = new Set(['/login', '/login/sent', '/login/validate', '/logout', '/*'])

/** Catches a page that cannot cope with the stubbed API, so the gate stays testable. */
class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <span>page failed to render</span> : this.props.children
  }
}

/** Flips once useRoles has resolved, so assertions never run against a loading gate. */
const RolesSettled = () => {
  const { isLoading } = useRoles()
  return isLoading ? null : <span data-testid='roles-settled' />
}

/** Signs in as the scenario, mounts the real route tree at `url` and waits for the gate to settle. */
export const visitRoute = async (scenario: AuthScenario, url: string) => {
  // One stub for the whole API. An empty array satisfies the `.map`/`.length`
  // most list pages reach for, and reads as absent for the rest. Pages that
  // still cannot render land in the boundary below, which is fine: the gate is
  // what is under test. Registered first so the identity handlers `renderAs`
  // adds take priority.
  server.use(http.all('*/api/*', () => HttpResponse.json([])))

  renderAs(
    scenario,
    <>
      <RolesSettled />
      <PageBoundary>
        <AppRoutes />
      </PageBoundary>
    </>,
    { route: url },
  )

  await screen.findByTestId('roles-settled')
}

/** `<Forbidden />` renders a 403 heading above the "Access denied" message. */
export const isForbidden = () => screen.queryByRole('heading', { name: '403' }) !== null

/**
 * Derived from the *fixture's* permission set, not from `RequirePermission`'s
 * rule, so the matrix cannot agree with a broken implementation: the question
 * asked here is "does this member hold one of the permissions the table says
 * the route wants", which is answerable without reading the component.
 */
export const expectedForbidden = (route: RouteUnderTest, scenario: AuthScenario): boolean => {
  if (!route.permissions) return false

  const held = scenario.member?.roles?.flatMap((role) => role.permissions ?? []) ?? []
  return !route.permissions.some((permission) => held.includes(permission))
}

/**
 * Runs the whole route table against one identity.
 *
 * Each scenario lives in its own test file so the four runs execute in parallel
 * — tests within one file run in sequence.
 */
export const runRouteMatrix = (scenario: AuthScenario) => {
  beforeEach(() => {
    // Pages rendered against a catch-all stub complain loudly; the boundary is
    // what actually matters here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it.each(ROUTES.map((route) => [route.path, route] as const))('%s', async (_path, route) => {
    await visitRoute(scenario, route.url)

    expect(isForbidden()).toBe(expectedForbidden(route, scenario))

    // Guards the table against drift in the same pass: a path that no longer
    // exists would otherwise sail through by simply never rendering Forbidden.
    // Only the superuser sees past every gate, so only that run can tell
    // "route missing" apart from "route closed".
    if (scenario === authScenarios.superuser && route.path !== '/*') {
      expect(
        screen.queryByRole('heading', { name: '404' }),
        `${route.url} did not resolve`,
      ).toBeNull()
    }
  })
}

/** Reports the router's current path, from outside `<Routes>` so it survives a redirect. */
const LocationProbe = () => {
  const { pathname } = useLocation()
  return <span data-testid='pathname'>{pathname}</span>
}

const currentPath = () => screen.getByTestId('pathname').textContent

/** Flushes React's pending work — including recovery from a page that threw — inside `act`. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

/**
 * Runs the whole route table as a visitor who is not signed in.
 *
 * The four signed-in runs assert `<Forbidden />`; this one cannot, because a
 * signed-out visitor never gets that far. Every route under `AdminLayout`
 * renders the layout, the layout calls `useRoles`, `GET /v1/members/roles`
 * comes back 401, and `useApi` sends them to /login. So the assertion is the
 * destination: an authenticated route redirects, a public one does not.
 */
export const runAnonymousRouteMatrix = () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  /** Routes whose page could not render, so the redirect could not be observed. */
  const inconclusive: string[] = []

  it.each(ROUTES.map((route) => [route.path, route] as const))('%s', async (path, route) => {
    // Handler precedence is the whole reason these three steps are separate.
    // `server.use()` prepends, so a *later* call wins — and within one call the
    // *earlier* argument wins.
    server.use(http.all('*/api/*', () => HttpResponse.json([])))

    // Installs the anonymous identity's own 401s for /me, /roles and /refresh,
    // beating the catch-all above.
    signInAs(authScenarios.anonymous.member)

    // Last, so it beats both. Answers exactly as signInAs would, and records.
    const rolesRequests: string[] = []
    server.use(
      http.get(apiUrl('v1/members/roles'), ({ request }) => {
        rolesRequests.push(request.url)
        return problemResponse(401, 'Unauthorized')
      }),
    )

    renderWithProviders(
      <>
        <LocationProbe />
        <PageBoundary>
          <AppRoutes />
        </PageBoundary>
      </>,
      {
        route: route.url,
        // A page that throws while React is rendering concurrently makes React
        // discard that render, retry the root synchronously — where the
        // boundary does catch it — and then *report* that it had to. In jsdom
        // that report escapes as a process-level unhandled error. Recovering
        // from those pages is this harness's design, so it is swallowed.
        onRecoverableError: () => {},
      },
    )

    if (PUBLIC_PATHS.has(path)) {
      // Let whatever the page fetches on mount actually go out, so "no roles
      // request" is a finding rather than a race won.
      await settle()

      expect(rolesRequests, `${route.url} asked the API who the visitor is`).toEqual([])
      expect(currentPath(), `${route.url} redirected a signed-out visitor away`).toBe(route.url)
      return
    }

    // Two ways this can settle. Either the layout's 401 lands and the visitor
    // is redirected — the outcome under test — or the page throws against the
    // catch-all stub first, in which case the boundary replaces the whole tree.
    const settled = () =>
      currentPath() === '/login'
        ? 'redirected'
        : screen.queryByText('page failed to render')
          ? 'boundary'
          : null

    await waitFor(() =>
      expect(
        settled(),
        `${route.url} served a signed-out visitor instead of sending them to /login`,
      ).not.toBeNull(),
    )

    // Counted rather than asserted: nothing leaked, but the gate went unobserved.
    if (settled() === 'boundary') inconclusive.push(route.url)

    // The positive half of the public-route assertion, and what keeps it
    // honest: a protected route that got as far as redirecting must have asked
    // the roles endpoint who the visitor is.
    if (settled() === 'redirected') {
      expect(
        rolesRequests,
        `${route.url} redirected without asking who the visitor is`,
      ).not.toEqual([])
    }
  })

  it('leaves no more routes unobserved than the stub already accounts for', () => {
    // A ratchet, not a target. If this trips upward, a page that used to render
    // against the catch-all stub has stopped doing so and its redirect is no
    // longer being checked — fix the page or widen the stub rather than the bound.
    expect(inconclusive.length, `unobserved: ${inconclusive.join(', ')}`).toBeLessThanOrEqual(10)
  })
}
