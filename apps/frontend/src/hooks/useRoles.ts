import { Member, MIKRoles } from '@backend/routes/members/models'
import useApi from './useApi'

export function useRoles(): {
  isLoading: boolean
  isUser: boolean
  isAdmin: boolean
} {
  const { data, isLoading } = useApi<Member | null>({
    url: 'v1/members/me',
    allowUnauthenticated: true,
  })

  return {
    isLoading,
    isUser: data?.roles?.includes(MIKRoles.USER) || false,
    isAdmin: data?.roles?.includes(MIKRoles.ADMIN) || false,
  }
}
