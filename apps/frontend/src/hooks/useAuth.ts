import { useState } from 'react'
import useApi, { APIResponse } from '@mik/ui/hooks/useApi'
import { signsIn, useClearApiCache } from '@mik/ui/hooks/apiCache'

// trigger authentication calls

export const useAuth = <Input, Output>(
  endpoint:
    | 'login'
    | 'login/validate'
    | 'login/verify-code'
    | 'register'
    | 'register/verify'
    | 'logout'
    | 'contact',
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
  // spinner/disabled state on `isMutating` (Sent.tsx, Validate.tsx,
  // RegistrationVerify.tsx) would then show "done" for a render or two while
  // this hook is still awaiting `clearApiCache()` (code review of #1318) —
  // RegistrationVerify.tsx in particular falls through to rendering nothing
  // in that gap, since its own success state is only set after `trigger`
  // resolves. `isPending` spans the whole trigger, cache clear included.
  const [isPending, setIsPending] = useState(false)

  return {
    trigger: async (request?: Input) => {
      setIsPending(true)
      try {
        const response = await mutation.trigger('POST', request)

        // Signing in invalidates every cached response the previous session
        // produced, this member's own 401s from before they signed in included —
        // see `@mik/ui/hooks/apiCache`. Awaited, because the caller navigates into
        // the app on the next line and the pages it lands on read that cache.
        if (!response.error && signsIn(endpoint)) await clearApiCache()

        return response
      } finally {
        setIsPending(false)
      }
    },
    isMutating: mutation.isMutating || isPending,
  }
}
