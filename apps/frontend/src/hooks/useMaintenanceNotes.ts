import useApi from './useApi'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'

export function useMaintenanceNotes(
  aircraftRegistration?: string,
  ajlbSeqNo?: number
) {
  return useApi<MaintenanceNote[]>({
    url: 'v1/maintenance-notes',
    params: { aircraftRegistration, ajlbSeqNo },
    skipFetch: !aircraftRegistration || !ajlbSeqNo,
  })
}

export function useCreateMaintenanceNote() {
  return useApi<MaintenanceNote>({
    url: 'v1/maintenance-notes',
    skipFetch: true,
  })
}

export function useUpdateMaintenanceNote(noteId: string) {
  return useApi<MaintenanceNote>({
    url: `v1/maintenance-notes/${noteId}`,
    skipFetch: true,
  })
}

export function useDeleteMaintenanceNote(noteId: string) {
  return useApi<void>({
    url: `v1/maintenance-notes/${noteId}`,
    skipFetch: true,
  })
}
