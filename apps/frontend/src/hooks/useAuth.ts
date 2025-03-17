import axios, { AxiosResponse, AxiosError } from 'axios'
import useSWRMutation, { SWRMutationResponse } from 'swr/mutation'
import type { LoginRequest, LoginResponse } from '@backend/routes/auth/schema'
import { Key } from 'swr'

interface Return<Data, Error>
  extends Omit<
    SWRMutationResponse<
      AxiosResponse<Data>,
      AxiosError<Error>,
      Key,
      LoginRequest
    >,
    'data'
  > {
  data: Data | undefined
  response: AxiosResponse<Data> | undefined
}

export function useAuth(
  endpoint: 'login' | 'login/validate'
): Return<LoginResponse, Error> {
  const fetcher = async (url: string, { arg }: { arg: LoginRequest }) =>
    axios.post(url, arg)

  const { data: response, ...rest } = useSWRMutation<
    AxiosResponse<LoginResponse>,
    AxiosError<Error>,
    Key,
    LoginRequest
  >(`/auth/${endpoint}`, fetcher)

  return {
    data: response && response.data,
    response,
    ...rest,
  }
}
