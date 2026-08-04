import useApi from './useApi'
import type { Defect } from '@backend/routes/defects/models'

/** Pass ajlbSeqNo to scope to one logbook page, or omit it for the whole aircraft. */
export function useDefects(aircraftRegistration?: string, ajlbSeqNo?: number) {
  return useApi<Defect[]>({
    url: 'v1/defects',
    params: { aircraftRegistration, ajlbSeqNo },
    skipFetch: !aircraftRegistration,
  })
}
