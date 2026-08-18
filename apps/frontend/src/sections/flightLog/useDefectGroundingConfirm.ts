import { useRef, useState } from 'react'

// A newly reported in-flight defect is always created ACTIVE with no HIL link, which
// immediately grounds the aircraft (flight.vw_aircraft_grounding_status) -- the same
// consequence AddDefectDialog already confirms before its own API call. The "Report
// Defects" section on the flight log entry itself reaches that same outcome via the
// entry's own save, so it needs the same confirmation gate before that save proceeds.
export function useDefectGroundingConfirm() {
  const [open, setOpen] = useState(false)
  const pendingSubmit = useRef<(() => void) | null>(null)

  const withGroundingConfirm = (reportedDefects: string[], submit: () => void) => {
    const hasReportedDefect = reportedDefects.some((d) => d.trim().length > 0)
    if (!hasReportedDefect) {
      submit()
      return
    }
    pendingSubmit.current = submit
    setOpen(true)
  }

  const confirm = () => {
    setOpen(false)
    pendingSubmit.current?.()
    pendingSubmit.current = null
  }

  const cancel = () => {
    setOpen(false)
    pendingSubmit.current = null
  }

  return {
    groundingDialogProps: { open, onClose: cancel, onConfirm: confirm },
    withGroundingConfirm,
  }
}
