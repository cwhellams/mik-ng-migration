import { Member } from '@mik/contracts/members'
import useApi from './useApi'
import { endpoints } from '../api/endpoints'

export const useMe = () => {
  const { data, isLoading, mutate } = useApi<Member | null>(
    {
      url: endpoints.members.me,
      skipRedirectOnUnauthorized: true,
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: true,
      revalidateOnReconnect: false,
    },
  )

  return {
    me: data,
    isLoading,
    mutate,
  }
}
