import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import { useOpenLogbookItemLink } from '../../hooks/useOpenLogbookItemLink'

export const useOpenNoteLink = (aircraftRegistration: string) => {
  const openLink = useOpenLogbookItemLink(aircraftRegistration, 'highlightNote')
  return (note: MaintenanceNote) => openLink(note, note.noteId)
}
