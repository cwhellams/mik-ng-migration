import { MIKPermissions } from '@mik/contracts/members'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Component, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import AppRoutes from '../AppRoutes'
import { useRoles } from '../hooks/useRoles'
import { authScenarios, renderAs, type AuthScenario } from './auth'
import { server } from './msw/server'

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
  /**
   * Set when the route carries no gate of its own but redirects to one that
   * does, so a visitor still ends up at `<Forbidden />`.
   */
  redirectsTo?: string
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
  { path: '/club/members/roles', url: '/club/members/roles' },
  { path: '/club/members/trash', url: '/club/members/trash' },
  {
    path: '/club/members/changelog',
    url: '/club/members/changelog',
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
  {
    path: '/accounting',
    url: '/accounting',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/invoicing',
    url: '/accounting/invoicing',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/items',
    url: '/accounting/items',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/tools',
    url: '/accounting/tools',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/tax-report',
    url: '/accounting/tax-report',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/traficom-report',
    url: '/accounting/traficom-report',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/uplift-report',
    url: '/accounting/uplift-report',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/instructor-worktime',
    url: '/accounting/instructor-worktime',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/unpaid-overdue',
    url: '/accounting/unpaid-overdue',
    permissions: [MIKPermissions.INVOICING_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/expenses',
    url: '/accounting/expenses',
    permissions: [MIKPermissions.EXPENSE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/expenses/:id',
    url: '/accounting/expenses/1',
    permissions: [MIKPermissions.EXPENSE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/mileage-allowances',
    url: '/accounting/mileage-allowances',
    permissions: [MIKPermissions.EXPENSE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/tulorekisteri-report',
    url: '/accounting/tulorekisteri-report',
    permissions: [MIKPermissions.EXPENSE_HETU_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/accounting/cost-centres',
    url: '/accounting/cost-centres',
    permissions: [MIKPermissions.EXPENSE_ADMIN],
    adminModeOnly: true,
  },
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
  {
    path: '/admin',
    url: '/admin',
    permissions: [MIKPermissions.OUTBOX_ADMIN],
    adminModeOnly: true,
    redirectsTo: '/admin/outbox',
  },
  {
    path: '/admin/outbox',
    url: '/admin/outbox',
    permissions: [MIKPermissions.OUTBOX_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/non-renewals',
    url: '/admin/non-renewals',
    permissions: [MIKPermissions.MEMBER_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/notification-banner',
    url: '/admin/notification-banner',
    permissions: [MIKPermissions.MEMBER_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/shop',
    url: '/admin/shop',
    permissions: [MIKPermissions.STORE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/shop/products',
    url: '/admin/shop/products',
    permissions: [MIKPermissions.STORE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/shop/categories',
    url: '/admin/shop/categories',
    permissions: [MIKPermissions.STORE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/shop/orders',
    url: '/admin/shop/orders',
    permissions: [MIKPermissions.STORE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/shop/orders/:orderId',
    url: '/admin/shop/orders/1',
    permissions: [MIKPermissions.STORE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/shop/discount-codes',
    url: '/admin/shop/discount-codes',
    permissions: [MIKPermissions.STORE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/shop/flight-packages',
    url: '/admin/shop/flight-packages',
    permissions: [MIKPermissions.STORE_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/events',
    url: '/admin/events',
    permissions: [MIKPermissions.EVENTS_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/exams',
    url: '/admin/exams',
    permissions: [MIKPermissions.EXAM_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/exams/versions/:versionId',
    url: '/admin/exams/versions/ver-1',
    permissions: [MIKPermissions.EXAM_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/exams/attempts',
    url: '/admin/exams/attempts',
    permissions: [MIKPermissions.EXAM_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/dto',
    url: '/admin/dto',
    permissions: [MIKPermissions.DTO_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/dto/syllabi/:syllabusId',
    url: '/admin/dto/syllabi/syl-1',
    permissions: [MIKPermissions.DTO_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/dto/programs/:programId/import',
    url: '/admin/dto/programs/prog-1/import',
    permissions: [MIKPermissions.DTO_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/phone-numbers',
    url: '/admin/phone-numbers',
    permissions: [MIKPermissions.MEMBER_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/inventory',
    url: '/admin/inventory',
    permissions: [MIKPermissions.INVENTORY_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/ame',
    url: '/admin/ame',
    permissions: [MIKPermissions.AME_ADMIN],
    adminModeOnly: true,
  },
  {
    path: '/admin/meetings',
    url: '/admin/meetings',
    permissions: [MIKPermissions.MEETING_ADMIN],
    adminModeOnly: true,
  },
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

/** Gated routes carrying a `RequirePermission` of their own, rather than inheriting one via a redirect. */
export const OWN_GATES = ROUTES.filter((route) => route.permissions && !route.redirectsTo)
export const GATED_ROUTES = ROUTES.filter((route) => route.permissions)
export const UNGATED_ROUTES = ROUTES.filter((route) => !route.permissions)

/**
 * The four identities the matrix runs. `authScenarios.anonymous` is deliberately
 * absent: a signed-out visit makes `useApi` redirect to /login from inside its
 * render body, which re-navigates on every render for as long as the caller
 * stays mounted (see the phase 2 notes on #1116).
 */
export const MATRIX_SCENARIOS = [
  authScenarios.admin,
  authScenarios.adminNoSudo,
  authScenarios.user,
  authScenarios.none,
] as const

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
