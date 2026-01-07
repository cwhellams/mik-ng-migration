import { Member } from '@backend/routes/members/models'
import useApi, { invalidateTokenOlderThan } from './useApi'

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

  if (data) {
    // Make sure the access token is at least as new as the profile.
    // This prevent any permission conflicts between visible UI components
    // and backend API access rights.
    invalidateTokenOlderThan(data.updatedAt)
  }

  return {
    me: data,
    isLoading,
    mutate,
  }
}
