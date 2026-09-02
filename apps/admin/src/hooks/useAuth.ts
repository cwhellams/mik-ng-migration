import { useState } from 'react'
import useApi, { APIResponse } from '@mik/ui/hooks/useApi'
import { signsIn, useClearApiCache } from '@mik/ui/hooks/apiCache'

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

  const clearApiCache = useClearApiCache()

  // `mutation.isMutating` alone flips back to false as soon as the POST
  // settles — before the cache clear below has run. A caller gating a
  // spinner/disabled state on `isMutating` would then show "done" for a
  // render or two while this hook is still awaiting `clearApiCache()`
  // (code review of #1318). `isPending` spans the whole trigger, cache
  // clear included, so callers never see a false "idle" in between.
  const [isPending, setIsPending] = useState(false)

  return {
    trigger: async (request?: Input) => {
      setIsPending(true)
      try {
        const response = await mutation.trigger('POST', request)

        // Same rule as the member app's: signing in empties the API cache, so
        // nothing the previous session cached can answer for the new one.
        // See `@mik/ui/hooks/apiCache`.
        if (!response.error && signsIn(endpoint)) await clearApiCache()

        return response
      } finally {
        setIsPending(false)
      }
    },
    isMutating: mutation.isMutating || isPending,
  }
}
