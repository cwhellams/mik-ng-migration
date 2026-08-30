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
  /**
   * Fleet-wide defect and remark search (#1230). `related` and `trending` take
   * their arguments as `params`, like every other path here -- the query
   * string is what `useApi` folds into the SWR cache key, so a row's related
   * findings and the next row's cannot collide.
   */
  findings: {
    root: 'v1/findings',
    related: 'v1/findings/related',
    trending: 'v1/findings/trending',
  },
  /**
   * Per-unit inventory (#1139). Unit management sits under the catalog's
   * `/v1/inventory` prefix because creating a unit is stock-keeping; the
   * reservations that consume them are the member app's, under their own
   * prefix. The rest of the catalog still uses raw literals.
   */
  inventoryUnits: {
    forItem: (itemId: string) => `v1/inventory/items/${itemId}/units`,
    byId: (unitId: string) => `v1/inventory/units/${unitId}`,
    status: (unitId: string) => `v1/inventory/units/${unitId}/status`,
  },
}

/**
 * Prefix a path with `/` so that `trigger`'s third argument replaces the
 * hook's base URL rather than appending to it.
 */
export const absolute = (path: string): string => `/${path}`
