import useApi from './useApi'
import type { Remark } from '@mik/contracts/remarks'

/** Remarks already logged against a flight -- skipped until the flight has an id. */
export function useRemarks(flightId?: string) {
  return useApi<Remark[]>({
    url: 'v1/remarks',
    params: { flightId },
    skipFetch: !flightId,
  })
}
