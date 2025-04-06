import useSWR, { SWRConfiguration, SWRResponse } from 'swr'
import { PublicConfiguration, useSWRConfig } from 'swr/_internal'
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { ErrorResponse } from '@backend/routes/response'
import { useLocation, useNavigate } from 'react-router-dom'
import { VerifyResponse } from '@backend/routes/auth/schema'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''
const api = axios.create({
  baseURL: `${API_BASE}/api/`,
})

// Add a request interceptor to add the access token to the authorization header
api.interceptors.request.use(
  (config) => {
    // if not authenticated at all, cancel the request
    const token = localStorage.getItem('accessToken')
    if (token == null) {
      return {
        ...config,
        signal: AbortSignal.abort(),
      }
    }

    config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

const refreshTheToken = async () => {
  await axios
    .post<VerifyResponse>('/auth/refresh')
    .then((response) => {
      const accessToken = response.data.accessToken
      if (accessToken) {
        localStorage.setItem('accessToken', accessToken)
        return accessToken
      } else {
        localStorage.removeItem('accessToken')
        return Promise.reject('No token')
      }
    })
    .catch((err) => {
      // If there is an error refreshing the token, log out the user
      localStorage.removeItem('accessToken')
      return Promise.reject(err)
    })
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

interface Return<Data, Error>
  extends Omit<SWRResponse<AxiosResponse<Data>, AxiosError<Error>>, 'data'> {
  // actual payload
  data: Data | undefined

  // the whole response object with http status codes, headers, etc
  response: AxiosResponse<Data> | undefined

  patch: (data: Partial<Data>) => Promise<AxiosResponse<Data>>
}

export default function useApi<Data = unknown, Error = ErrorResponse>(
  request: AxiosRequestConfig & {
    allowUnauthenticated?: boolean
  },
  config: SWRConfiguration<AxiosResponse<Data>, AxiosError<Error>> = {}
): Return<Data, Error> {
  const navigate = useNavigate()
  const location = useLocation()
  const { onErrorRetry } = useSWRConfig()

  const {
    data: response,
    error,
    mutate,
    ...rest
  } = useSWR<AxiosResponse<Data>, AxiosError<Error>>(
    // the url acts as a key for caching
    `${request.url}${JSON.stringify(request.data)}${JSON.stringify(request.params)}`,
    () => api.request<Data>(request),
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
            PublicConfiguration<
              AxiosResponse<Data>,
              AxiosError<Error>,
              (path: string) => unknown
            >
          >,
          ...args
        )
      },
    }
  )

  const isLoggedOut = error?.name == 'CanceledError'
  if (isLoggedOut && !request.allowUnauthenticated) {
    // cancelled because not authenticated
    navigate('/login', {
      state: { target: location.pathname },
    })
  }

  return {
    data: isLoggedOut ? undefined : response?.data,
    response,
    error,
    mutate,
    patch: async (data: Partial<Data>) => {
      const patched = await api.request<Partial<Data>, AxiosResponse<Data>>({
        ...request,
        method: 'PATCH',
        data,
      })

      // update the cache with returned full data
      mutate(() => patched, {
        revalidate: false,
      })

      return patched
    },

    ...rest,
  }
}
