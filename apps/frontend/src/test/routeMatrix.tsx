import { MIKPermissions } from '@mik/contracts/members'
import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import AppRoutes from '../AppRoutes'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { authScenarios, renderAs, signInAs, type AuthScenario } from './auth'
import { apiUrl, problemResponse } from './msw/handlers'
import { server } from './msw/server'
import { renderWithProviders } from './renderWithProviders'

/**
 * Every leaf route in `AppRoutes.tsx`, with the permission gate it carries.
 *
 * This is the frontend's analogue of the backend's per-endpoint permission
 * tests: the backend asserts 200/403 per endpoint for an admin, a member and a
 * no-permissions token, and this table drives the same triad (plus the two
 * cases that only exist in the UI) over every route the app serves.
 *
 * `AppRoutes.permissions.test.tsx` keeps it honest — it fails if a route here
 * no longer resolves, and if the number of gates in the source stops matching
 * the number of gated entries below.
 */
export interface RouteUnderTest {
  /** The route pattern as written in AppRoutes.tsx. */
  path: string
  /** A concrete URL to visit, with any path parameters filled in. */
  url: string
  /** Permissions the route's `RequirePermission` demands; absent when ungated. */
  permissions?: MIKPermissions[]
  /** Whether the gate also requires admin (sudo) mode. */
  adminModeOnly?: boolean
}

export const ROUTES: RouteUnderTest[] = [
  { path: '/', url: '/' },
  { path: '/schedule', url: '/schedule' },
  { path: '/fly', url: '/fly' },
  { path: '/fly/mass-balance', url: '/fly/mass-balance' },
  { path: '/fly/access-codes', url: '/fly/access-codes' },
  { path: '/fly/fuel-prices', url: '/fly/fuel-prices' },
  { path: '/logs', url: '/logs' },
  { path: '/logs/flights/:flightId', url: '/logs/flights/fi_inst1' },
  { path: '/logs/books', url: '/logs/books' },
  { path: '/logs/books/:aircraftRegistration/:ajlbSeqNo/:page?', url: '/logs/books/OH-STL/4' },
  { path: '/logs/occurrences', url: '/logs/occurrences' },
  { path: '/logs/occurrences/:reportId', url: '/logs/occurrences/occ-1' },
  { path: '/club', url: '/club' },
  // Roles, trash and changelog moved to apps/admin in #1233; what is left at
  // these three URLs is the redirect that forwards a bookmark there.
  { path: '/club/members/roles', url: '/club/members/roles' },
  { path: '/club/members/trash', url: '/club/members/trash' },
  { path: '/club/members/changelog', url: '/club/members/changelog' },
  // The one gated route left in this app (#1174) — see AppRoutes.tsx. No
  // `adminModeOnly`: its own API call passes `alwaysSudo`, so an admin reaches
  // it with admin mode off and it works the same either way.
  {
    path: '/club/members/:memberId/efficiency',
    url: '/club/members/Matti1/efficiency',
    permissions: [MIKPermissions.MEMBER_ADMIN],
  },
  { path: '/club/members/:memberId', url: '/club/members/Matti1' },
  { path: '/club/instructor-status', url: '/club/instructor-status' },
  { path: '/club/billing', url: '/club/billing' },
  { path: '/club/documents', url: '/club/documents' },
  { path: '/club/stats', url: '/club/stats' },
  { path: '/club/events', url: '/club/events' },
  { path: '/club/ame-list', url: '/club/ame-list' },
  { path: '/club/ame-list/new', url: '/club/ame-list/new' },
  {
    path: '/club/ame-list/:id/edit',
    url: '/club/ame-list/6119a525-cbc7-4cb2-9259-e07c78def12b/edit',
  },
  { path: '/club/meetings', url: '/club/meetings' },
  { path: '/profile/email-change/verify', url: '/profile/email-change/verify' },
  { path: '/mailbox', url: '/mailbox' },
  { path: '/expenses', url: '/expenses' },
  { path: '/expenses/new', url: '/expenses/new' },
  { path: '/expenses/:id', url: '/expenses/1' },
  { path: '/expenses/:id/edit', url: '/expenses/1/edit' },
  // The 14 /accounting/* pages moved to apps/admin in #1233, like /admin/*.
  { path: '/accounting/*', url: '/accounting/invoicing' },
  { path: '/shop', url: '/shop' },
  { path: '/shop/products/:id', url: '/shop/products/1' },
  { path: '/shop/cart', url: '/shop/cart' },
  { path: '/shop/orders', url: '/shop/orders' },
  { path: '/shop/flight-packages', url: '/shop/flight-packages' },
  { path: '/shop/orders/:orderId', url: '/shop/orders/1' },
  { path: '/exams', url: '/exams' },
  { path: '/exams/:examId', url: '/exams/exam-1' },
  { path: '/exams/attempt/:attemptId', url: '/exams/attempt/att-1' },
  { path: '/exams/review/:attemptId', url: '/exams/review/att-1' },
  { path: '/exams/history', url: '/exams/history' },
  // The 21 /admin/* pages moved to apps/admin in #1233. What is left is the
  // redirect that forwards an old bookmark there; it is ungated on purpose —
  // the admin app applies the permission check, and a 403 from this app would
  // only tell an attacker which admin pages exist.
  { path: '/admin/*', url: '/admin/shop/orders' },
  { path: '/dto', url: '/dto' },
  { path: '/dto/my-training', url: '/dto/my-training' },
  { path: '/dto/progress', url: '/dto/progress' },
  { path: '/dto/progress/:memberSyllabusId', url: '/dto/progress/ms-1' },
  { path: '/dto/verify', url: '/dto/verify' },
  { path: '/inventory', url: '/inventory' },
  { path: '/inventory/:id', url: '/inventory/1' },
  { path: '/login', url: '/login' },
  { path: '/login/sent', url: '/login/sent' },
  { path: '/login/validate', url: '/login/validate' },
  { path: '/register', url: '/register' },
  { path: '/register/verify', url: '/register/verify' },
  { path: '/logout', url: '/logout' },
  { path: '/*', url: '/no-such-page' },
]

// Every gated route now carries a `RequirePermission` of its own. The
// `redirectsTo` case — a route that inherited its gate by redirecting to one —
// only ever described `/admin`, which moved to apps/admin in #1233; `OWN_GATES`
// went with it.
export const GATED_ROUTES = ROUTES.filter((route) => route.permissions)
export const UNGATED_ROUTES = ROUTES.filter((route) => !route.permissions)

/**
 * The four signed-in identities, asserted with `expectedForbidden`.
 *
 * `authScenarios.anonymous` is the fifth run but not a member of this list: a
 * signed-out visitor is never shown `<Forbidden />`, they are redirected, so
 * that run has its own harness (`runAnonymousRouteMatrix`) and its own
 * expectation. It was excluded entirely until #1132 §2 moved `useApi`'s
 * redirect out of the render body — before that it re-navigated on every render
 * for as long as the caller stayed mounted, and hung the run.
 */
export const MATRIX_SCENARIOS = [
  authScenarios.admin,
  authScenarios.adminNoSudo,
  authScenarios.user,
  authScenarios.none,
] as const

/**
 * The routes served by `AuthLayout`, which a signed-out visitor is meant to
 * reach — they are how you sign in — plus `/*`, the 404 fallback, which sits
 * outside both layouts. Nothing under here calls the API, so nothing redirects.
 */
export const PUBLIC_PATHS = new Set([
  '/login',
  '/login/sent',
  '/login/validate',
  '/register',
  '/register/verify',
  '/logout',
  '/*',
])

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
  // most list pages reach for, and reads as absent for the rest — it leaves 23
  // of the 92 pages unable to render, against 43 for an empty object. Those 23
  // land in the boundary below, which is fine: the gate is what is under test.
  // Registered first so the identity handlers `renderAs` adds take priority.
  server.use(http.all('*/api/*', () => HttpResponse.json([])))

  renderAs(
    scenario,
    <>
      <RolesSettled />
      <PageBoundary>
        <AppRoutes />
      </PageBoundary>
    </>,
    { route: url, serverClock: false },
  )

  await screen.findByTestId('roles-settled')
}

/** `<Forbidden />` renders a 403 heading above the "Access denied" message. */
export const isForbidden = () => screen.queryByRole('heading', { name: '403' }) !== null

/**
 * Written out rather than derived from `RequirePermission`'s own rule, so the
 * matrix cannot agree with a broken implementation:
 *
 * - the admin holds every permission with admin mode on, so nothing is closed;
 * - the same admin with admin mode off is shut out of `adminModeOnly` routes only;
 * - the ordinary member and the no-permissions member hold no admin permission
 *   at all (asserted in AppRoutes.permissions.test.tsx), so every gated route is
 *   closed to them.
 */
export const expectedForbidden = (route: RouteUnderTest, scenario: AuthScenario): boolean => {
  if (!route.permissions) return false
  if (scenario === authScenarios.admin) return false
  if (scenario === authScenarios.adminNoSudo) return route.adminModeOnly === true
  return true
}

/**
 * Runs the whole route table against one identity.
 *
 * Each scenario lives in its own test file so the four runs execute in parallel
 * — rendering every page four times over is the single most expensive thing in
 * the suite, and tests within one file run in sequence.
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
    // Only the admin sees past every gate, so only that run can tell "route
    // missing" apart from "route closed".
    if (scenario === authScenarios.admin && route.path !== '/*') {
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
 * signed-out visitor never gets that far. Every route under `MainLayout` renders
 * the layout, the layout calls `useRoles`, `GET /v1/members/roles` comes back
 * 401, and `useApi` sends them to /login. So the assertion is the destination:
 * an authenticated route redirects, a public one does not.
 *
 * For a public route the assertion is that no roles request was made at all,
 * which is stronger than watching the clock for a redirect that never comes: no
 * request means nothing could redirect it later either.
 */
export const runAnonymousRouteMatrix = () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  /** Routes whose page could not render, so the redirect could not be observed. */
  const inconclusive: string[] = []

  it.each(ROUTES.map((route) => [route.path, route] as const))('%s', async (path, route) => {
    // Handler precedence is the whole reason these three steps are separate, and
    // why `renderAs` is unpacked into signInAs + renderWithProviders here.
    // `server.use()` prepends, so a *later* call wins — and within one call the
    // *earlier* argument wins. Registering the recorder alongside the catch-all
    // and before signInAs (as `visitRoute` does) would leave it shadowed twice
    // over and silently never called.
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
        sudo: authScenarios.anonymous.sudo,
        serverClock: false,
        // A page that throws while React is rendering concurrently makes React
        // discard that render, retry the root synchronously — where the boundary
        // below does catch it — and then *report* that it had to. The default
        // report is `reportError`, which in jsdom escapes as a process-level
        // unhandled error and fails the run even though every assertion passed.
        //
        // Recovering from those pages is the harness's whole design (see
        // PageBoundary), so the recovery is expected here and is swallowed. Real
        // failures still surface: the boundary shows, and the route is counted as
        // unobserved below.
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

    // Two ways this can settle. Either the layout's 401 lands and the visitor is
    // redirected — the outcome under test — or the page throws against the
    // catch-all stub first. In that second case the boundary, which sits above
    // the whole router, replaces the tree: there is no layout left to ask who
    // the visitor is and no router left to redirect.
    //
    // The boundary cannot hide a leak. A page that renders its content keeps the
    // layout mounted, so it settles as neither, and the wait below fails.
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

    // The positive half of the public-route assertion, and what keeps it honest.
    // A protected route that got as far as redirecting must have asked the roles
    // endpoint who the visitor is — so if the recorder is ever shadowed again and
    // stops seeing requests, these 86 routes fail loudly instead of the 7 public
    // ones quietly passing against an empty array.
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
    expect(inconclusive.length, `unobserved: ${inconclusive.join(', ')}`).toBeLessThanOrEqual(15)
  })
}
