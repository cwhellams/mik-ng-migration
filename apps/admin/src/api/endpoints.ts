/**
 * API endpoints registry for the admin app.
 *
 * Only the paths the admin app currently calls are registered here. Grow this
 * as admin sections are ported from apps/frontend.
 */
export const endpoints = {
  members: {
    root: 'v1/members',
    me: 'v1/members/me',
    roles: 'v1/members/roles',
    byId: (memberId: string) => `v1/members/${memberId}`,
    trash: 'v1/members/trash',
    changelog: 'v1/members/changelog',
    nonRenewals: 'v1/members/non-renewals',
  },
  aircrafts: {
    root: 'v1/aircrafts',
    byId: (aircraftId: string) => `v1/aircrafts/${aircraftId}`,
  },
}

/**
 * Prefix a path with `/` so that `trigger`'s third argument replaces the
 * hook's base URL rather than appending to it.
 */
export const absolute = (path: string): string => `/${path}`
