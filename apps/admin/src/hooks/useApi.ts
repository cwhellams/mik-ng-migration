import { useEffect } from 'react'
import useSWR, { SWRConfiguration, SWRResponse } from 'swr'
import { PublicConfiguration, useSWRConfig } from 'swr/_internal'
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { Problem } from '@mik/contracts/problem'
import { useLocation, useNavigate } from 'react-router'
import useSWRMutation, { SWRMutationConfiguration } from 'swr/mutation'
import { validateApiPath } from '@mik/contracts/sanitizers'
import { setHttpClient } from '@mik/ui/api/http'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

/** Where a lost session sends the admin, and the one place this hook won't redirect from. */
const LOGIN_PATH = '/login'

// withCredentials ensures the browser sends httpOnly cookies on every request.
export const api = axios.create({
  baseURL: `${API_BASE}/api/`,
  withCredentials: true,
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

const tokenRefresh: { refreshing?: Promise<void> } = {}

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
        throw error
      }
      return api(originalRequest)
    }
    throw error
  },
)

export type APIResponse<Data> = {
  data?: Data
  error?: Problem
}

export type APIMutation<Data> = {
  isMutating: boolean
  trigger: <Payload, ResponseData = Data>(
    method: MutateMethods,
    payload?: Payload,
    id?: string,
    options?: SWRMutationConfiguration<AxiosResponse<ResponseData>, AxiosError<Problem>>,
  ) => Promise<APIResponse<ResponseData>>
}

export type MutateMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ExtendedAxiosConfig = AxiosRequestConfig & {
  allowUnauthenticated?: boolean
  skipRedirectOnUnauthorized?: boolean
}

export { api as sharedApi }

// Hand the instance to @mik/ui, whose shared API modules (dtoApi, examApi)
// issue their requests through whichever client the running app registers.
// Done here rather than in main.tsx so it is impossible to import one of those
// modules without the client that serves it — including from a test.
setHttpClient(api)

/**
 * API hook for the admin app.
 *
 * Identical to the frontend's useApi, except every request is sent with
 * `x-sudo: true` — entering the admin app is the deliberate "I mean to do
 * admin things" step, so there is no per-request sudo toggle.
 */
export default function useApi<Data = unknown, MutateData = Data>(
  request: AxiosRequestConfig & {
    allowUnauthenticated?: boolean
    skipRedirectOnUnauthorized?: boolean
    skipFetch?: boolean
  },
  config: SWRConfiguration<AxiosResponse<Data>, AxiosError<Problem>> = {},
): Omit<SWRResponse<AxiosResponse<Data>, AxiosError<Problem>>, 'data' | 'error'> &
  APIResponse<Data> & {
    fetch: APIMutation<Data>
    mutation: APIMutation<MutateData>
  } {
  const navigate = useNavigate()
  const location = useLocation()
  const { onErrorRetry } = useSWRConfig()

  const sanitizedUrl = validateApiPath(request.url)
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
        // The admin app always operates in sudo mode — no toggle needed.
        headers: { ...request.headers, 'x-sudo': 'true' },
      }),
    {
      ...config,
      onErrorRetry: (err, key, config, ...args) => {
        if (err.name == 'CanceledError') return
        if (err.status && err.status >= 400 && err.status < 500) return
        onErrorRetry(
          err,
          key,
          config as Readonly<PublicConfiguration<AxiosResponse<Data>, AxiosError<Problem>>>,
          ...args,
        )
      },
    },
  )

  const isLoggedOut = error?.response?.status === 401 && !rest.isValidating
  const shouldRedirect =
    isLoggedOut && !request.allowUnauthenticated && !request.skipRedirectOnUnauthorized

  useEffect(() => {
    if (!shouldRedirect || location.pathname === LOGIN_PATH) return
    navigate(LOGIN_PATH, { state: { target: location.pathname } })
  }, [shouldRedirect, navigate, location.pathname])

  const mutation = useSWRMutation<
    AxiosResponse,
    AxiosError<Problem>,
    typeof cacheKey,
    { method: MutateMethods; payload: unknown; path: string | undefined }
  >(cacheKey, (_key: object, { arg }) => {
    const sanitizedPath = validateApiPath(arg.path)
    return api.request({
      ...request,
      params: arg.method == 'GET' ? arg.payload : request.params,
      url: sanitizedPath
        ? sanitizedPath.startsWith('/')
          ? sanitizedPath
          : `${sanitizedUrl}/${sanitizedPath}`
        : sanitizedUrl,
      headers: { ...request.headers, 'x-sudo': 'true' },
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
      .then((res) => ({ data: res?.data }))
      .catch((err: Error | AxiosError) =>
        axios.isAxiosError<Problem>(err)
          ? {
              error: err.response?.data ?? {
                status: err.status ?? 0,
                title: err.code,
                detail: err.message,
              },
            }
          : { error: { status: 0, detail: err.message } },
      )

  return {
    data: isLoggedOut ? undefined : response?.data,
    error: error ? error?.response?.data : undefined,
    fetch: { isMutating: mutation.isMutating, trigger },
    mutation: { isMutating: mutation.isMutating, trigger },
    ...rest,
  }
}
