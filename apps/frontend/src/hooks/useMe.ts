import { Member } from '@mik/contracts/members'
import useApi from './useApi'
import { endpoints } from '../api/endpoints'

export const useMe = () => {
  const { data, isLoading, mutate } = useApi<Member | null>(
    {
      url: endpoints.members.me,
      // Allow the refresh interceptor to silently restore the session, but don't
      // redirect to /login if the user is genuinely unauthenticated.
      skipRedirectOnUnauthorized: true,
    },
    {
      // Profile data rarely changes, so skip stale/reconnect revalidation — but
      // revalidate on focus so an admin-set must-update-profile flag engages when
      // the user returns to the tab, instead of only after a full page reload.
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
