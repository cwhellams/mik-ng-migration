import useApi, { APIResponse } from './useApi'

// trigger authentication calls

export const useAuth = <Input, Output>(
  endpoint: 'login' | 'login/validate' | 'register' | 'logout'
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
