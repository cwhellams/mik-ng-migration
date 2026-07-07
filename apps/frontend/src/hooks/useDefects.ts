import useApi from './useApi'
import type { Defect } from '@backend/routes/defects/models'

export function useDefects(aircraftRegistration?: string, ajlbSeqNo?: number) {
  return useApi<Defect[]>({
    url: 'v1/defects',
    params: { aircraftRegistration, ajlbSeqNo },
    skipFetch: !aircraftRegistration || !ajlbSeqNo,
  })
}
