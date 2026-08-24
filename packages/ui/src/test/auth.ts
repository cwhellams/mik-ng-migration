import type { MIKPermissions, Member } from '@mik/contracts/members'
import { http, HttpResponse } from 'msw'

import { aMemberWithPermissions } from './fixtures'
import { apiUrl, problemResponse } from './msw/handlers'
import { server } from './msw/server'

/**
 * Points `GET /api/v1/members/me` at the given member for the rest of the test.
 * Pass `null` for "nobody is signed in" — `/me`, the token refresh and the roles
 * catalogue all answer 401, exactly as they do against a real logged-out session.
 *
 * Both apps have their own copy of this alongside a full `authScenarios` set,
 * because the identities a *route* matrix varies over differ between them. What
 * lives here is only what the shared hooks' own tests need.
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
