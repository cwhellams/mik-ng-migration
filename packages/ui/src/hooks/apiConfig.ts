import { createContext, useContext } from 'react'

/**
 * The handful of things `useApi` needs from whichever app is running.
 *
 * The hook itself is identical in both — same axios instance, same 401 refresh
 * and retry, same redirect on a dead session. What differs is the answer to one
 * question, "is this request being made with admin rights", and the two apps
 * answer it differently on purpose: `apps/frontend` follows the member's sudo
 * toggle, `apps/admin` is always in admin context because reaching it is itself
 * the deliberate admin-intent step (#1233).
 *
 * That single difference is what this context carries, so the other ~200 lines
 * do not have to exist twice — which they did, until #1233's accounting port
 * needed four shared components that fetch their own data and could not be
 * shared while `useApi` was app-local.
 */
export interface ApiConfig {
  /** Whether requests are made in admin (sudo) context by default. */
  sudo: boolean
}

/**
 * No default value on purpose. A silent fallback would mean an app that forgot
 * the provider either loses admin rights everywhere (if the default were
 * `false`) or gains them everywhere (if it were `true`); both are far worse to
 * diagnose than a throw naming the missing provider.
 */
const ApiConfigContext = createContext<ApiConfig | undefined>(undefined)

export const ApiConfigProvider = ApiConfigContext.Provider

export const useApiConfig = (): ApiConfig => {
  const config = useContext(ApiConfigContext)
  if (!config) {
    throw new Error(
      'No ApiConfigProvider found. Wrap the app in <ApiConfigProvider value={{ sudo }}> — see apps/frontend/src/App.tsx.',
    )
  }
  return config
}

/**
 * The header `useApi` puts on every request, exposed for the handful of call
 * sites that bypass the hook and use `sharedApi` directly (a blob download, a
 * debounced count). Those still have to agree with the hook about what admin
 * context means, and a hand-written `'x-sudo': sudo ? 'true' : 'false'` next to
 * the one in useApi is how the two drift apart.
 */
export const sudoHeader = (sudo: boolean): { 'x-sudo': 'true' | 'false' } => ({
  'x-sudo': sudo ? 'true' : 'false',
})
