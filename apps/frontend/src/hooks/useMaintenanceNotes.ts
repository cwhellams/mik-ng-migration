import useApi from './useApi'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'

/** Pass ajlbSeqNo to scope to one logbook page, or omit it for the whole aircraft. */
export function useMaintenanceNotes(aircraftRegistration?: string, ajlbSeqNo?: number) {
  return useApi<MaintenanceNote[]>({
    url: 'v1/maintenance-notes',
    params: { aircraftRegistration, ajlbSeqNo },
    skipFetch: !aircraftRegistration,
  })
}
