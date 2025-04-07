import axios, { AxiosResponse, AxiosError } from 'axios'
import useSWRMutation, { SWRMutationResponse } from 'swr/mutation'
import { Key } from 'swr'

interface Return<Input, Output, Error>
  extends Omit<
    SWRMutationResponse<AxiosResponse<Output>, AxiosError<Error>, Key, Input>,
    'data'
  > {
  // actual payload
  data: Output | undefined
  // the whole response object with http status codes, headers, etc
  response: AxiosResponse<Output> | undefined
}

export function useAuth<Input, Output>(
  endpoint: 'login' | 'login/validate' | 'register' | 'logout'
): Return<Input, Output, Error> {
  const fetcher = async (url: string, { arg }: { arg: Input }) =>
    axios.post(url, arg)

  const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

  const { data: response, ...rest } = useSWRMutation<
    AxiosResponse<Output>,
    AxiosError<Error>,
    Key,
    Input
  >(`${API_BASE}/auth/${endpoint}`, fetcher)

  return {
    data: response && response.data,
    response,
    ...rest,
  }
}
