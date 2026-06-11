import { Member } from '@backend/routes/members/models'
import useApi from './useApi'

export const useMe = () => {
  const { data, isLoading, mutate } = useApi<Member | null>(
    {
      url: 'v1/members/me',
      // Allow the refresh interceptor to silently restore the session, but don't
      // redirect to /login if the user is genuinely unauthenticated.
      skipRedirectOnUnauthorized: true,
    },
    {
      // profile data do not change often, no need for automatic revalidations
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  return {
    me: data,
    isLoading,
    mutate,
  }
}
