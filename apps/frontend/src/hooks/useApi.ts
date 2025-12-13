import useSWR, { SWRConfiguration, SWRResponse } from 'swr'
import { PublicConfiguration, useSWRConfig } from 'swr/_internal'
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { Problem } from '@backend/routes/response'
import { useLocation, useNavigate } from 'react-router-dom'
import { VerifyResponse } from '@backend/routes/auth/schema'
import useSWRMutation, { SWRMutationConfiguration } from 'swr/mutation'
import { useThemeMode } from '../theme/ThemeContext'
import { validateApiPath } from '@backend/util/sanitizers'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''
const api = axios.create({
  baseURL: `${API_BASE}/api/`,
})

const tokenRefresh: {
  // refresh is ongoing
  refreshing?: Promise<string>
  // time when refresh finished and new token in use
  refreshed?: Date
} = {}

// Add a request interceptor to add the access token to the authorization header
api.interceptors.request.use(
  async (config) => {
    const token = await getTheToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      return config
    } else {
      if ('allowUnauthenticated' in config && config.allowUnauthenticated) {
        // can be used without auth
        return config
      }

      // no token, cancel the request
      return {
        ...config,
        signal: AbortSignal.abort(),
      }
    }
  },
  (error) => Promise.reject(error)
)

const getTheToken = async () => {
  if (tokenRefresh.refreshing) {
    if (
      tokenRefresh.refreshed &&
      new Date().getTime() > tokenRefresh.refreshed.getTime()
    ) {
      // refresh is done, remove the ongoing status
      tokenRefresh.refreshing = undefined
    } else {
      // refresh is still ongoing
      return await tokenRefresh.refreshing
    }
  }

  return localStorage.getItem('accessToken')
}

const refreshTheToken = async () => {
  if (!tokenRefresh.refreshing) {
    // only single refresh needed
    tokenRefresh.refreshing = axios
      .post<VerifyResponse>(`${API_BASE}/api/auth/refresh`)
      .then((response) => {
        const accessToken = response.data.accessToken
        if (accessToken) {
          localStorage.setItem('accessToken', accessToken)
          tokenRefresh.refreshed = new Date()
          return accessToken
        } else {
          localStorage.removeItem('accessToken')
          tokenRefresh.refreshed = new Date()
          return Promise.reject('No token')
        }
      })
      .catch((err) => {
        // If there is an error refreshing the token, log out the user
        localStorage.removeItem('accessToken')
        return Promise.reject(err)
      })
  }
  return tokenRefresh.refreshing
}

// Add a response interceptor to refresh the access token if it's expired
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // If the error is a 401 and we have a access token, try refresh it with refresh token
    if (
      originalRequest &&
      error.response?.status === 401 &&
      localStorage.getItem('accessToken')
    ) {
      const accessToken = await refreshTheToken()

      // Re-run the original request that was intercepted
      originalRequest.headers.Authorization = `Bearer ${accessToken}`
      return api(originalRequest)
    }

    // Return the original error if we can't handle it
    return Promise.reject(error)
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

export type MutateMethods = 'GET' | 'POST' | 'PATCH' | 'DELETE'

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
          'x-sudo': sudo ? 'true' : 'false',
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

  const isLoggedOut = error?.name == 'CanceledError'
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
