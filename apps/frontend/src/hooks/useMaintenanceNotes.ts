import useApi from './useApi'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'

export function useMaintenanceNotes(aircraftRegistration?: string, ajlbSeqNo?: number) {
  return useApi<MaintenanceNote[]>({
    url: 'v1/maintenance-notes',
    params: { aircraftRegistration, ajlbSeqNo },
    skipFetch: !aircraftRegistration || !ajlbSeqNo,
  })
}
