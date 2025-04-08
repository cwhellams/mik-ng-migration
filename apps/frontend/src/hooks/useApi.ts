import useSWR, { SWRConfiguration, SWRResponse } from 'swr'
import { PublicConfiguration, useSWRConfig } from 'swr/_internal'
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { ErrorResponse } from '@backend/routes/response'
import { useLocation, useNavigate } from 'react-router-dom'
import { VerifyResponse } from '@backend/routes/auth/schema'
import useSWRMutation, { SWRMutationResponse } from 'swr/mutation'

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

export type APIMutation<
  Data,
  Input = Partial<Data>,
  Error = ErrorResponse,
> = SWRMutationResponse<AxiosResponse<Data>, AxiosError<Error>, object, Input>

type AxiosConfig<Data, Error> = Readonly<
  PublicConfiguration<
    AxiosResponse<Data>,
    AxiosError<Error>,
    (path: string) => unknown
  >
>

export default function useApi<
  // returned data type
  Data = unknown,
  // payload for POST
  Create = Partial<Data>,
  // payload for PATCH
  Update = Partial<Data>,
  // payload for DELETE
  Delete = Partial<Data>,
  // payload for errors
  Error = ErrorResponse,
>(
  request: AxiosRequestConfig & {
    allowUnauthenticated?: boolean
    skipFetch?: boolean
  },
  config: SWRConfiguration<AxiosResponse<Data>, AxiosError<Error>> = {}
): Omit<SWRResponse<AxiosResponse<Data>, AxiosError<Error>>, 'data'> & {
  // actual payload
  data: Data | undefined

  // the whole response object with http status codes, headers, etc
  response: AxiosResponse<Data> | undefined

  // mutation hooks
  create: APIMutation<Data, Create, Error>
  update: APIMutation<Data, Update, Error>
  remove: APIMutation<Data, Delete, Error>
} {
  const navigate = useNavigate()
  const location = useLocation()
  const { onErrorRetry } = useSWRConfig()

  // the url and params acts as a key for caching
  const cacheKey = [request.url, request.params]

  const {
    data: response,
    error,
    mutate,
    ...rest
  } = useSWR<AxiosResponse<Data>, AxiosError<Error>>(
    request.skipFetch ? null : cacheKey,
    () => api.request<Data>(request),
    {
      ...config,
      onErrorRetry: (err, key, config, ...args) => {
        // no retry if request was cancelled
        if (err.name == 'CanceledError') return

        // no retry for 400 errors
        if (err.status && err.status >= 400 && err.status < 500) return

        // otherwise the default retry logic
        onErrorRetry(err, key, config as AxiosConfig<Data, Error>, ...args)
      },
    }
  )

  const create = useSWRMutation(
    cacheKey,
    (_key: typeof cacheKey, { arg }: { arg: Create }) =>
      api.request({ ...request, method: 'POST', data: arg })
  )

  const update = useSWRMutation(
    cacheKey,
    (_key: object, { arg }: { arg: Update }) =>
      api.request({ ...request, method: 'PATCH', data: arg })
  )

  const remove = useSWRMutation(
    cacheKey,
    (_key: object, { arg }: { arg: Delete }) =>
      api.request({ ...request, method: 'DELETE', data: arg })
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

    create,
    update,
    remove,

    ...rest,
  }
}
