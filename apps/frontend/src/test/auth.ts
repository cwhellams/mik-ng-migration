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
import { renderWithProviders, type ProviderOptions } from './renderWithProviders'

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
  /** Whether admin (sudo) mode is switched on. */
  sudo: boolean
}

/**
 * The frontend analogue of the backend's token triad
 * (`adminToken` / `memberToken` / `noPermissionsToken` in the backend's
 * `test/routes/<area>/api.test.ts` suites),
 * plus the two cases that only exist in the UI: an admin who hasn't switched
 * sudo on, and a visitor who isn't signed in at all.
 *
 * Use these as the axis of a permission matrix:
 *
 * ```ts
 * it.each(Object.values(authScenarios))('$name', (scenario) => {
 *   renderAs(scenario, <MemberChangeLog />)
 *   ...
 * })
 * ```
 */
export const authScenarios = {
  /** `k1mnimda` with every permission, sudo on — should reach everything. */
  admin: {
    name: 'admin in sudo mode',
    member: anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] }),
    sudo: true,
  },

  /** The same admin with sudo off — admin-only surfaces must stay closed. */
  adminNoSudo: {
    name: 'admin with sudo off',
    member: anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] }),
    sudo: false,
  },

  /** `Matti1` — an ordinary flying member. */
  user: {
    name: 'ordinary member',
    member: aMember(),
    sudo: false,
  },

  /** `Liisa1` — signed in, but holds no permissions at all. */
  none: {
    name: 'member without permissions',
    member: aMemberWithoutPermissions(),
    sudo: false,
  },

  /** Not signed in. Expect a redirect to `/login` from any authenticated view. */
  anonymous: {
    name: 'anonymous visitor',
    member: null,
    sudo: false,
  },
} satisfies Record<string, AuthScenario>

export type AuthScenarioName = keyof typeof authScenarios

/**
 * Signs in as the scenario's member and renders `ui` with sudo set to match.
 * Explicit options win, so a test can still override the route or language.
 */
export const renderAs = (
  scenario: AuthScenario,
  ui: ReactElement,
  options: ProviderOptions = {},
) => {
  signInAs(scenario.member)
  return renderWithProviders(ui, { sudo: scenario.sudo, ...options })
}
