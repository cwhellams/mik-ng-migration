/**
 * Which deployed environment the app is running in, derived from the one
 * signal both apps already have set per-environment: `VITE_API_TARGET`, the
 * backend host they point their API calls at (`https://intra.mik.fi` in
 * production, `https://beta.mik.fi` in the beta/test environment, unset in
 * local dev). Reusing it means there is nothing new to configure per
 * environment — the same value already drives `useApi`'s base URL, and it is
 * identical in both apps (see .do/mik-intranet-{prod,test}.yaml).
 *
 * Returns the bare host label with the `.mik.fi` suffix stripped (`'intra'`,
 * `'beta'`), or `'local'` when unset. Any other configured target (an ad hoc
 * preview deploy, say) comes back as its own stripped host, so a badge built
 * on this still shows *something* informative rather than silently blanking.
 */
export const envLabel = (apiTarget: string | undefined): string =>
  apiTarget?.replace(/^https?:\/\//, '').replace(/\.mik\.fi$/, '') || 'local'

/**
 * The member app's own base URL for the environment `apiTarget` names.
 *
 * No mapping table: `VITE_API_TARGET`'s host *is* the member app's hostname
 * (`intra`/`beta`) — the backend and the member frontend share one domain in
 * both environments (see .do/mik-intranet-{prod,test}.yaml). `undefined`
 * outside the two known environments — local dev doesn't use this; see
 * `MemberAppLink`, which falls back to a fixed dev port instead.
 */
export const memberUrlFor = (apiTarget: string | undefined): string | undefined => {
  const label = envLabel(apiTarget)
  return label === 'intra' || label === 'beta' ? `https://${label}.mik.fi` : undefined
}

/**
 * The admin app's base URL for the environment `apiTarget` names.
 *
 * Unlike `memberUrlFor`, this *does* need a table: the admin app's subdomain
 * (`twr`/`beta-twr`) doesn't share a name with the backend host
 * (`intra`/`beta`) the way the member app's does. `undefined` outside the two
 * known environments, for the same reason as `memberUrlFor`.
 */
const ADMIN_HOST_BY_BACKEND_HOST: Record<string, string> = {
  intra: 'twr',
  beta: 'beta-twr',
}

export const adminUrlFor = (apiTarget: string | undefined): string | undefined => {
  const host = ADMIN_HOST_BY_BACKEND_HOST[envLabel(apiTarget)]
  return host ? `https://${host}.mik.fi` : undefined
}
