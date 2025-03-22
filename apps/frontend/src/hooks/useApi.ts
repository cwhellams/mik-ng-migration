import useSWR, { SWRConfiguration, SWRResponse } from 'swr'
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { ErrorResponse } from '@backend/routes/response'
import { useNavigate } from 'react-router-dom'

interface Request extends Omit<AxiosRequestConfig, 'url'> {
  path: string
  allowUnauthenticated?: boolean
}

interface Return<Data, Error>
  extends Omit<SWRResponse<AxiosResponse<Data>, AxiosError<Error>>, 'data'> {
  // actual payload
  data: Data | undefined

  // the whole response object with http status codes, headers, etc
  response: AxiosResponse<Data> | undefined
}

export default function useApi<Data = unknown, Error = ErrorResponse>(
  request: Request,
  config: SWRConfiguration<AxiosResponse<Data>, AxiosError<Error>> = {}
): Return<Data, Error> {
  const accessToken = localStorage.getItem('accessToken')

  const navigate = useNavigate()

  // the whole object acts as a key for caching
  const authenticatedRequest: AxiosRequestConfig = {
    url: `api/${request.path}`,
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
    },
  }

  const {
    data: response,
    error,
    ...rest
  } = useSWR<AxiosResponse<Data>, AxiosError<Error>>(
    authenticatedRequest,
    () => axios.request<Data>(authenticatedRequest),
    {
      ...config,
    }
  )

  if (!request.allowUnauthenticated && error?.status == 401) {
    navigate('/login')
  }

  return {
    data: response && response.data,
    response,
    error,
    ...rest,
  }
}
