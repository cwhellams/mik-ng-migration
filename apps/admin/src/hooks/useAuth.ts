import useApi, { APIResponse } from '@mik/ui/hooks/useApi'

export const useAuth = <Input, Output>(
  endpoint: 'login' | 'login/validate' | 'login/verify-code' | 'logout',
): {
  isMutating: boolean
  trigger: (request?: Input) => Promise<APIResponse<Output>>
} => {
  const { mutation } = useApi<Output>({
    url: `auth/${endpoint}`,
    allowUnauthenticated: true,
    skipFetch: true,
  })

  return {
    trigger: async (request?: Input) => mutation.trigger('POST', request),
    isMutating: mutation.isMutating,
  }
}
