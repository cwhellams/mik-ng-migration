import type { MIKPermissions, Member } from '@mik/contracts/members'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'

import {
  ALL_PERMISSIONS,
  aMember,
  aMemberWithoutPermissions,
  aMemberWithPermissions,
  anAdmin,
  aRoleWithPermissions,
} from './fixtures'
import { apiUrl, problemResponse } from './msw/handlers'
import { server } from './msw/server'
import { renderWithProviders } from './renderWithProviders'

/**
 * Points `GET /api/v1/members/me` at the given member for the rest of the test.
 * Pass `null` for "nobody is signed in" — `/me`, the token refresh and the roles
 * catalogue all answer 401, exactly as they do against a real logged-out session.
 */
export const signInAs = (member: Member | null): void => {
  if (member === null) {
    server.use(
      http.get(apiUrl('v1/members/me'), () => problemResponse(401, 'Unauthorized')),
      http.get(apiUrl('v1/members/roles'), () => problemResponse(401, 'Unauthorized')),
      http.post(apiUrl('auth/refresh'), () => problemResponse(401, 'Unauthorized')),
    )
    return
  }

  server.use(http.get(apiUrl('v1/members/me'), () => HttpResponse.json(member)))
}

/** Signs in a member carrying exactly `permissions` and nothing else. */
export const signInWithPermissions = (...permissions: MIKPermissions[]): Member => {
  const member = aMemberWithPermissions(permissions)
  signInAs(member)
  return member
}

export interface AuthScenario {
  /** Label for table-driven tests. */
  name: string
  /** Who is signed in, or `null` for an anonymous visitor. */
  member: Member | null
}

/**
 * The identity set every gated surface in this app is tested against.
 *
 * This is `apps/frontend`'s `authScenarios` minus its `sudo` axis, which does
 * not exist here: the admin app has no sudo toggle, because entering it *is*
 * the deliberate admin-intent step (issue #1233, answer 1). What remains is the
 * backend's token triad — admin / ordinary member / no permissions — plus the
 * anonymous visitor.
 *
 * Note that `superuser` is not the same as `anAdmin()`: the club's real ADMIN
 * role does not carry STORE_ADMIN, EXAM_ADMIN or DTO_ADMIN, so a page-specific
 * test that wants "the admin who may do this" should use
 * `signInWithPermissions(...)` rather than assuming the ADMIN role covers it.
 *
 * ```ts
 * it.each(Object.values(authScenarios))('$name', (scenario) => {
 *   renderAs(scenario, <ProductsAdmin />)
 *   ...
 * })
 * ```
 */
export const authScenarios = {
  /** Holds every permission — should reach every page in the app. */
  superuser: {
    name: 'admin with every permission',
    member: anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] }),
  },

  /** `k1mnimda` with the club's real ADMIN role — reaches only what that role grants. */
  clubAdmin: {
    name: 'admin with the real ADMIN role',
    member: anAdmin(),
  },

  /** `Matti1` — an ordinary flying member. Every admin page must answer 403. */
  user: {
    name: 'ordinary member',
    member: aMember(),
  },

  /** `Liisa1` — signed in, but holds no permissions at all. */
  none: {
    name: 'member without permissions',
    member: aMemberWithoutPermissions(),
  },

  /** Not signed in. Expect a redirect to `/login` from any authenticated view. */
  anonymous: {
    name: 'anonymous visitor',
    member: null,
  },
} satisfies Record<string, AuthScenario>

export type AuthScenarioName = keyof typeof authScenarios

/**
 * Signs in as the scenario's member and renders `ui`. Explicit options win, so
 * a test can still override the route or language.
 */
export const renderAs = (
  scenario: AuthScenario,
  ui: ReactElement,
  options: Parameters<typeof renderWithProviders>[1] = {},
) => {
  signInAs(scenario.member)
  return renderWithProviders(ui, options)
}
