/**
 * The API hook both frontends use.
 *
 * It lived in `apps/frontend/src/hooks/` until #1233, and was copied verbatim
 * into `apps/admin` when that app was scaffolded. The copy was a maintenance
 * hazard — a fix to the 401 refresh-and-retry cycle would have had to be made
 * twice — and it also made every shared component that fetches its own data
 * unshareable. Both apps now use this one, and the one thing they disagree on
 * comes from `useApiConfig()`.
 */
import { useEffect, useRef } from 'react'
import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr'
import { type PublicConfiguration, useSWRConfig } from 'swr/_internal'
import axios, { type AxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios'
import type { Problem } from '@mik/contracts/problem'
import { useLocation, useNavigate } from 'react-router'
import useSWRMutation, { type SWRMutationConfiguration } from 'swr/mutation'
import { sudoHeader, useApiConfig } from './apiConfig'
import { validateApiPath } from '@mik/contracts/sanitizers'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

/** Where a lost session sends the user, and the one place this hook won't redirect from. */
const LOGIN_PATH = '/login'

// withCredentials ensures the browser sends httpOnly cookies on every request.
export const api = axios.create({
  baseURL: `${API_BASE}/api/`,
  withCredentials: true,
  // Serialize array params as repeated bare keys (e.g. registration=A&registration=B)
  // rather than axios's default bracket notation (registration[]=A&registration[]=B),
  // which Express's qs parser would keep as the literal key 'registration[]'.
  paramsSerializer: (params: Record<string, unknown>) => {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)))
      } else if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    }
    return searchParams.toString()
  },
})

// Tracks an in-flight token refresh so concurrent 401s only trigger one refresh.
const tokenRefresh: {
  refreshing?: Promise<void>
} = {}

// Refresh by posting to the refresh endpoint — the browser sends the httpOnly
// refreshToken cookie automatically, and the server sets a new accessToken cookie.
const refreshTheToken = (): Promise<void> => {
  tokenRefresh.refreshing ??= axios
    .post(`${API_BASE}/api/auth/refresh`, {}, { withCredentials: true })
    .then(() => {
      tokenRefresh.refreshing = undefined
    })
    .catch((err) => {
      tokenRefresh.refreshing = undefined
      throw err
    })
  return tokenRefresh.refreshing
}

// On a 401, attempt a silent token refresh (via the refreshToken cookie) and
// retry the original request once. If refresh also fails, propagate the 401.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (AxiosRequestConfig & {
          _retried?: boolean
          allowUnauthenticated?: boolean
        })
      | undefined
    if (
      originalRequest &&
      error.response?.status === 401 &&
      !originalRequest._retried &&
      !originalRequest.allowUnauthenticated
    ) {
      originalRequest._retried = true
      try {
        await refreshTheToken()
      } catch {
        // If refresh fails (network/5xx/etc.), fall back to the original 401
        // so that auth/logout handling remains deterministic.
        throw error
      }
      return api(originalRequest)
    }
    throw error
  },
)

// API responses are either payload or problem
export type APIResponse<Data> = {
  data?: Data
  error?: Problem
}

// Simplified API for using useSWRMutation hooks
export type APIMutation<Data> = {
  // is the mutation currently ongoing
  isMutating: boolean

  // trigger the mutation with any payload, and return responses
  trigger: <Payload, ResponseData = Data>(
    method: MutateMethods,
    payload?: Payload,
    id?: string,
    options?: SWRMutationConfiguration<AxiosResponse<ResponseData>, AxiosError<Problem>>,
  ) => Promise<APIResponse<ResponseData>>
}

export type MutateMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Axios request config extended with MIK-specific interceptor flags.
 * Use `allowUnauthenticated: true` for pre-login requests (e.g. passkey auth)
 * to suppress the automatic token-refresh attempt on 401 responses.
 */
export type ExtendedAxiosConfig = AxiosRequestConfig & {
  allowUnauthenticated?: boolean
  skipRedirectOnUnauthorized?: boolean
}

export { api as sharedApi }

export default function useApi<
  // returned data type
  Data = unknown,
  // returned data from mutations
  MutateData = Data,
>(
  request: AxiosRequestConfig & {
    // if true: skip both the refresh-token attempt AND the redirect to /login on 401.
    // Use this only for unauthenticated endpoints (e.g. login/register flows).
    allowUnauthenticated?: boolean

    // if true: skip the redirect to /login on 401, but still attempt a silent token
    // refresh via the interceptor. Use this for optional-auth endpoints (e.g. useMe)
    // so the user is silently re-authenticated without being bounced to the login page.
    skipRedirectOnUnauthorized?: boolean

    // if true, mutation calls only
    skipFetch?: boolean

    // if true, always use sudo mode for the request
    alwaysSudo?: boolean
  },
  config: SWRConfiguration<AxiosResponse<Data>, AxiosError<Problem>> = {},
): Omit<
  // remove Axios wrappers from data and error
  SWRResponse<AxiosResponse<Data>, AxiosError<Problem>>,
  'data' | 'error'
> &
  APIResponse<Data> & {
    fetch: APIMutation<Data>
    mutation: APIMutation<MutateData>
  } {
  const navigate = useNavigate()
  const location = useLocation()
  const { onErrorRetry } = useSWRConfig()
  const { sudo } = useApiConfig()

  // Validate the request URL to prevent SSRF attacks
  const sanitizedUrl = validateApiPath(request.url)

  // the url and params acts as a key for caching
  const cacheKey = [sanitizedUrl, request.params]

  const {
    data: response,
    error,
    ...rest
  } = useSWR<AxiosResponse<Data>, AxiosError<Problem>>(
    request.skipFetch ? null : cacheKey,
    () =>
      api.request<Data>({
        ...request,
        // globally allow admin permissions with sudo mode
        headers: { ...request.headers, ...sudoHeader(Boolean(sudo || request.alwaysSudo)) },
      }),
    {
      ...config,
      onErrorRetry: (err, key, config, ...args) => {
        // no retry if request was cancelled
        if (err.name == 'CanceledError') return

        // no retry for 400 errors
        if (err.status && err.status >= 400 && err.status < 500) return

        // otherwise the default retry logic
        onErrorRetry(
          err,
          key,
          config as Readonly<PublicConfiguration<AxiosResponse<Data>, AxiosError<Problem>>>,
          ...args,
        )
      },
    },
  )

  // A 401 that survived the refresh-retry cycle means the session is gone.
  // Only redirect when SWR has settled (isValidating = false) to avoid
  // redirecting during a transient re-validation.
  const isLoggedOut = error?.response?.status === 401 && !rest.isValidating

  const sessionLost =
    isLoggedOut && !request.allowUnauthenticated && !request.skipRedirectOnUnauthorized

  // "Settled", though, is not the same as "answered here". SWR returns a cached
  // error on the first render after a mount together with the
  // `isValidating: false` left behind by the request that produced it — the
  // mount revalidation only starts in the layout effect that follows. A 401
  // cached by a session that has since been replaced is therefore
  // indistinguishable from a freshly received one for exactly one render, and
  // navigating on it leaves the page before the refetch that would have
  // succeeded has even been sent.
  //
  // #1312 is what that cost: a member who entered a valid login code landed
  // back on the code-entry page, because the header's roles call found the 401
  // its own earlier, logged-out call had cached. Requiring that this instance
  // saw a request in flight tells the two apart, and costs at most one render —
  // if the refetch 401s as well, `sessionLost` goes false and true again and the
  // effect below runs a second time with the flag set.
  //
  // Unlike a latch on *having redirected* (see below), this one is only ever
  // set, never reset by time passing — only by the key itself changing (next).
  const requestSeen = useRef(false)

  // "This instance" isn't the same guarantee once the key it watches can change
  // under it: a component whose `params` change without unmounting (e.g. a
  // list page's filters, or a detail page keyed by a route param) keeps its
  // `requestSeen` ref from the *previous* key. Without resetting it here, a
  // cached 401 already sitting under the *new* key — left over from an earlier,
  // unrelated visit — would redirect immediately, exactly the bug above for a
  // different trigger than a fresh mount.
  //
  // Declared before the `isValidating` effect below (and before the redirect
  // effect further down), so that on any commit where the key change and a
  // fresh isValidating both land together, the reset always runs first —
  // effects for one component fire in declaration order. Reading or writing
  // `.current` during render itself is deliberately avoided; both effects
  // here only ever touch the ref from inside an effect.
  const cacheKeySignature = JSON.stringify(cacheKey)
  useEffect(() => {
    requestSeen.current = false
  }, [cacheKeySignature])

  useEffect(() => {
    if (rest.isValidating) requestSeen.current = true
  }, [rest.isValidating])

  // Redirecting is a side effect, so it belongs in an effect rather than the
  // render body. Calling navigate() during render used to terminate only
  // because the redirect swaps MainLayout for AuthLayout and so unmounts the
  // caller; a hook whose component survived the route change re-navigated on
  // every render, forever.
  //
  // Being at /login already is the whole termination condition. Navigating makes
  // `location.pathname` — a dependency — become '/login', so the effect re-runs
  // and does nothing. A caller that stays mounted therefore redirects once, and
  // `target` keeps the page the user was actually on rather than being
  // overwritten with '/login' itself.
  //
  // Redirecting once is deliberately not done with a `useRef` latch either.
  // `isValidating` flickers true on any background revalidation, which drops
  // `sessionLost` to false and would re-arm such a latch; when the revalidation
  // settled still-401 it would fire a second navigate, from /login, clobbering
  // `target`. Reading the current pathname has no equivalent stale state to
  // reset.
  useEffect(() => {
    if (!sessionLost || !requestSeen.current || location.pathname === LOGIN_PATH) return

    // authentication is required
    navigate(LOGIN_PATH, {
      state: { target: location.pathname },
    })
  }, [sessionLost, navigate, location.pathname])

  const mutation = useSWRMutation<
    AxiosResponse,
    AxiosError<Problem>,
    typeof cacheKey,
    {
      method: MutateMethods
      payload: unknown
      path: string | undefined
    }
  >(cacheKey, (_key: object, { arg }) => {
    // Validate and sanitize the path to prevent SSRF attacks
    const sanitizedPath = validateApiPath(arg.path)

    return api.request({
      ...request,
      params: arg.method == 'GET' ? arg.payload : request.params,
      url: sanitizedPath
        ? sanitizedPath.startsWith('/')
          ? sanitizedPath
          : `${sanitizedUrl}/${sanitizedPath}`
        : sanitizedUrl,
      // globally allow admin permissions with sudo mode
      headers: { ...request.headers, ...sudoHeader(Boolean(sudo || request.alwaysSudo)) },
      method: arg.method,
      data: arg.payload,
    })
  })

  const trigger = <P, R>(
    method: MutateMethods,
    payload: P,
    path?: string,
    options?: SWRMutationConfiguration<AxiosResponse<R>, AxiosError<Problem>>,
  ) =>
    mutation
      .trigger({ method, payload, path }, options)
      .then((res) => {
        return { data: res?.data }
      })
      .catch((err: Error | AxiosError) =>
        axios.isAxiosError<Problem>(err)
          ? {
              error: err.response?.data ?? {
                status: err.status ?? 0,
                title: err.code,
                detail: err.message,
              },
            }
          : // unknown error type
            {
              error: {
                status: 0,
                detail: err.message,
              },
            },
      )

  return {
    data: isLoggedOut ? undefined : response?.data,
    error: error ? error?.response?.data : undefined,

    fetch: {
      isMutating: mutation.isMutating,
      trigger,
    },
    mutation: {
      isMutating: mutation.isMutating,
      trigger,
    },

    ...rest,
  }
}
