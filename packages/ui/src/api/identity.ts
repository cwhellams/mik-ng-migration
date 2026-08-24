/**
 * The two endpoints the shared identity hooks call.
 *
 * They live here rather than in either app's `api/endpoints.ts` because
 * `useMe` and `useRoles` are shared and cannot import an app's registry. Each
 * app's registry re-exports these, so `endpoints.members.me` keeps working at
 * its call sites and there is still only one place the path is written.
 */
export const identityEndpoints = {
  me: 'v1/members/me',
  roles: 'v1/members/roles',
} as const
