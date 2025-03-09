import useSWR, { SWRConfiguration, SWRResponse } from 'swr'
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { ErrorResponse } from '@backend/routes/response'

interface Return<Data, Error>
  extends Omit<SWRResponse<AxiosResponse<Data>, AxiosError<Error>>, 'data'> {
  data: Data | undefined
  response: AxiosResponse<Data> | undefined
}

export default function useApi<Data = unknown, Error = ErrorResponse>(
  request: AxiosRequestConfig,
  config: SWRConfiguration<AxiosResponse<Data>, AxiosError<Error>> = {}
): Return<Data, Error> {
  const accessToken = localStorage.getItem('accessToken')

  // the whole object acts as a key for caching
  const authenticatedRequest = {
    ...request,
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
    },
  }

  const { data: response, ...rest } = useSWR<
    AxiosResponse<Data>,
    AxiosError<Error>
  >(authenticatedRequest, () => axios.request<Data>(authenticatedRequest), {
    ...config,
  })

  return {
    data: response && response.data,
    response,
    ...rest,
  }
}
