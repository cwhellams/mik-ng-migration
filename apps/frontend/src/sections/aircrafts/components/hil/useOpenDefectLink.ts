import type { HilLinkedDefect } from '@backend/routes/aircraft-hil/models'
import { useOpenLogbookItemLink } from '../../../../hooks/useOpenLogbookItemLink'

export const useOpenDefectLink = (aircraftRegistration: string) => {
  const openLink = useOpenLogbookItemLink(aircraftRegistration, 'highlightDefect')
  return (defect: HilLinkedDefect) => openLink(defect, defect.defectId)
}
