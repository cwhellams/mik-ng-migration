import useSWR, { SWRConfiguration, SWRResponse } from 'swr'
import { PublicConfiguration, useSWRConfig } from 'swr/_internal'
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { Problem } from '@backend/routes/response'
import { useLocation, useNavigate } from 'react-router-dom'
import useSWRMutation, { SWRMutationConfiguration } from 'swr/mutation'
import { useThemeMode } from '../theme/ThemeContext'
import { validateApiPath } from '@backend/util/sanitizers'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

// withCredentials ensures the browser sends httpOnly cookies on every request.
const api = axios.create({
  baseURL: `${API_BASE}/api/`,
  withCredentials: true,
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
        return api(originalRequest)
      } catch {
        // Refresh failed — session is gone; fall through and propagate the 401
      }
    }
    throw error
  }
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
    options?: SWRMutationConfiguration<
      AxiosResponse<ResponseData>,
      AxiosError<Problem>
    >
  ) => Promise<APIResponse<ResponseData>>
}

export type MutateMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export default function useApi<
  // returned data type
  Data = unknown,
  // returned data from mutations
  MutateData = Data,
>(
  request: AxiosRequestConfig & {
    // if true don't navigate to login page
    allowUnauthenticated?: boolean

    // if true, mutation calls only
    skipFetch?: boolean

    // if true, always use sudo mode for the request
    alwaysSudo?: boolean
  },
  config: SWRConfiguration<AxiosResponse<Data>, AxiosError<Problem>> = {}
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
  const { sudo } = useThemeMode()

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
        headers: {
          ...request.headers,
          'x-sudo': sudo || request.alwaysSudo ? 'true' : 'false',
        },
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
          config as Readonly<
            PublicConfiguration<AxiosResponse<Data>, AxiosError<Problem>>
          >,
          ...args
        )
      },
    }
  )

  // A 401 that survived the refresh-retry cycle means the session is gone.
  // Only redirect when SWR has settled (isValidating = false) to avoid
  // redirecting during a transient re-validation.
  const isLoggedOut = error?.response?.status === 401 && !rest.isValidating
  if (isLoggedOut && !request.allowUnauthenticated) {
    // authentication is required
    navigate('/login', {
      state: { target: location.pathname },
    })
  }

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
        ? sanitizedPath[0] == '/'
          ? sanitizedPath
          : `${sanitizedUrl}/${sanitizedPath}`
        : sanitizedUrl,
      // globally allow admin permissions with sudo mode
      headers: {
        ...request.headers,
        'x-sudo': sudo ? 'true' : 'false',
      },
      method: arg.method,
      data: arg.payload,
    })
  })

  const trigger = <P, R>(
    method: MutateMethods,
    payload: P,
    path?: string,
    options?: SWRMutationConfiguration<AxiosResponse<R>, AxiosError<Problem>>
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
            }
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
