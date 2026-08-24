import { identityEndpoints } from '@mik/ui/api/identity'

/**
 * API endpoints registry for the admin app.
 *
 * Same rules as `apps/frontend/src/api/endpoints.ts`: no leading slash, no
 * query string (those go in `params`, which `useApi` folds into the SWR cache
 * key), and anything variable is a function so a caller cannot forget a
 * segment.
 *
 * Only paths the admin app actually calls are registered. An entry nothing
 * calls is dead code that reads as API surface, so it is added when its first
 * caller is — the ported sections still address most of their endpoints as
 * inline `'v1/…'` literals, and migrating them domain by domain is the same
 * exercise #1115 §6 is working through on the member side.
 */
export const endpoints = {
  members: {
    root: 'v1/members',
    me: identityEndpoints.me,
    roles: identityEndpoints.roles,
    role: (roleId: string) => `v1/members/roles/${roleId}`,
    trash: 'v1/members/trash',
    changelog: 'v1/members/changelog',
    restore: (memberId: string) => `v1/members/${memberId}/restore`,
    nonRenewals: 'v1/members/non-renewals',
    annualMembershipStats: 'v1/members/annual-membership-stats',
    deactivate: (memberId: string) => `v1/members/${memberId}/deactivate`,
    sendRenewalReminder: (memberId: string) => `v1/members/${memberId}/send-renewal-reminder`,
  },
  aircrafts: {
    root: 'v1/aircrafts',
  },
}

/**
 * Prefix a path with `/` so that `trigger`'s third argument replaces the
 * hook's base URL rather than appending to it.
 */
export const absolute = (path: string): string => `/${path}`
