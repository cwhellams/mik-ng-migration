/**
 * Every API path the frontend calls, defined once — phase 6 of #1115 (§6).
 *
 * Before this module the paths were raw string literals at the call site: 346 of
 * them across 169 files, with `'v1/members'` alone appearing 17 times. Renaming a
 * backend route meant a grep across the app and hoping none were missed, and
 * nothing connected a path to the response type it returns.
 *
 * Three things make this worth a module rather than a convention:
 *
 * 1. **Renames become one edit.** The path exists in exactly one place.
 * 2. **SWR cache keys stop drifting.** `useApi` keys its cache on `[url, params]`,
 *    so a `mutate()` that revalidates a resource has to reproduce the *exact*
 *    same string the fetching component passed as `url` — see `Member.tsx`, which
 *    matches on `` key[0] === `v1/members/${memberId}` ``. Built by hand in two
 *    places, those two strings can differ and the revalidation silently does
 *    nothing. Built from the same function, they cannot.
 * 3. **A lint rule can enforce it.** `no-restricted-syntax` in
 *    `eslint.config.js` rejects a raw `'v1/…'` literal in any directory that has
 *    been migrated, so the pattern can't grow back where it has been removed.
 *
 * ## Conventions
 *
 * - Paths never carry a leading slash, so they match what `useApi`'s `url` wants
 *   and are usable as cache keys verbatim.
 * - Anything variable is a **function**, so the caller cannot forget a segment.
 * - Query strings are **not** part of a path. Pass them as `params` to `useApi`,
 *   which serialises them and — importantly — includes them in the cache key.
 * - Use {@link absolute} for the third argument of `useApi`'s `trigger`, which
 *   replaces the base URL rather than appending to it when it starts with `/`.
 *
 * ## Adding a domain
 *
 * Add its object here, migrate its call sites, then delete its directory from the
 * `no-restricted-syntax` allowlist in `eslint.config.js` so it stays migrated.
 * Domains still on raw literals are listed there.
 */
export const endpoints = {
  members: {
    /** List, and the base for member mutations via `trigger`'s path argument. */
    root: 'v1/members',
    me: 'v1/members/me',
    myLang: 'v1/members/me/lang',
    myPasskeys: 'v1/members/me/passkeys',
    myGdprExport: 'v1/members/me/gdpr-export',
    roles: 'v1/members/roles',
    role: (roleId: string) => `v1/members/roles/${roleId}`,
    nonRenewals: 'v1/members/non-renewals',
    trash: 'v1/members/trash',
    changelog: 'v1/members/changelog',
    mailingLists: 'v1/members/mailing-lists',
    joiningFees: 'v1/members/joining-fees',
    annualMembershipStats: 'v1/members/annual-membership-stats',
    byId: (memberId: string) => `v1/members/${memberId}`,
    passkeys: (memberId: string) => `v1/members/${memberId}/passkeys`,
    invoices: (memberId: string) => `v1/members/${memberId}/invoices`,
    flights: (memberId: string) => `v1/members/${memberId}/flights`,
    restore: (memberId: string) => `v1/members/${memberId}/restore`,
    deactivate: (memberId: string) => `v1/members/${memberId}/deactivate`,
    sendRenewalReminder: (memberId: string) => `v1/members/${memberId}/send-renewal-reminder`,
  },

  aircrafts: {
    root: 'v1/aircrafts',
    fuelTypes: 'v1/aircrafts/fuel-types',
    byRegistration: (registration: string) => `v1/aircrafts/${registration}`,
  },

  bookings: {
    root: 'v1/bookings',
    byId: (bookingId: string) => `v1/bookings/${bookingId}`,
    cancel: (bookingId: string) => `v1/bookings/${bookingId}/cancel`,
  },
} as const

/**
 * Marks a path as absolute for `useApi`'s `trigger(method, payload, path)`.
 *
 * `trigger` appends a bare path to the hook's `url` and uses a `/`-prefixed one
 * as-is, which is how a hook fetching `v1/members` posts to
 * `v1/members/:id/restore`. Spelling that out at the call site rather than baking
 * the slash into the registry keeps every entry usable as a cache key.
 */
export const absolute = (path: string) => `/${path}`
