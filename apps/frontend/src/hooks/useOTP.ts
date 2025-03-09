import axios, { AxiosResponse, AxiosError } from 'axios'
import useSWRMutation, { SWRMutationResponse } from 'swr/mutation'
import { OTPRequest, OTPResponse } from '@backend/routes/auth/otp'
import { Key } from 'swr'

interface Return<Data, Error>
  extends Omit<
    SWRMutationResponse<
      AxiosResponse<Data>,
      AxiosError<Error>,
      Key,
      OTPRequest
    >,
    'data'
  > {
  data: Data | undefined
  response: AxiosResponse<Data> | undefined
}

export function useOTP(
  endpoint: 'request' | 'verify'
): Return<OTPResponse, Error> {
  const fetcher = async (url: string, { arg }: { arg: OTPRequest }) =>
    axios.post(url, arg)

  const { data: response, ...rest } = useSWRMutation<
    AxiosResponse<OTPResponse>,
    AxiosError<Error>,
    Key,
    OTPRequest
  >(`/api/v1/auth/${endpoint}-otp`, fetcher)

  return {
    data: response && response.data,
    response,
    ...rest,
  }
}
