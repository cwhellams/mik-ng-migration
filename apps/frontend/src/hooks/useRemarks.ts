import useApi from '@mik/ui/hooks/useApi'
import type { Remark } from '@mik/contracts/remarks'

/** Remarks already logged against a flight -- skipped until the flight has an id. */
export function useRemarks(flightId?: string) {
  return useApi<Remark[]>({
    url: 'v1/remarks',
    params: { flightId },
    skipFetch: !flightId,
  })
}

/** Every remark for a logbook page's aircraft, optionally scoped to one ajlbSeqNo --
 * for LogbookPage's inline markers, mirroring useDefects. */
export function useRemarksForAircraft(aircraftRegistration?: string, ajlbSeqNo?: number) {
  return useApi<Remark[]>({
    url: 'v1/remarks',
    params: { aircraftRegistration, ajlbSeqNo },
    skipFetch: !aircraftRegistration,
  })
}
