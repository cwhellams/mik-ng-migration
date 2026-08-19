import type { HilLinkedDefect } from '@mik/contracts/aircraft-hil'
import { useOpenLogbookItemLink } from '../../../../hooks/useOpenLogbookItemLink'

export const useOpenDefectLink = (aircraftRegistration: string) => {
  const openLink = useOpenLogbookItemLink(aircraftRegistration, 'highlightDefect', 'defect')
  return (defect: HilLinkedDefect) => openLink(defect, defect.defectId)
}
