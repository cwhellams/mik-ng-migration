import { Member } from '@backend/routes/members/models'
import useApi from './useApi'

export const useMe = () => {
  const { data, isLoading, mutate } = useApi<Member | null>(
    {
      url: 'v1/members/me',
      allowUnauthenticated: true,
    },
    {
      // profile data do not change often, no need for automatic revalidations
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  return {
    me: data,
    isLoading,
    mutate,
  }
}
