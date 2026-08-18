import { usePendingConfirm } from './usePendingConfirm'

// A newly reported in-flight defect is always created ACTIVE with no HIL link, which
// immediately grounds the aircraft (flight.vw_aircraft_grounding_status) -- the same
// consequence AddDefectDialog already confirms before its own API call. The "Report
// Defects" section on the flight log entry itself reaches that same outcome via the
// entry's own save, so it needs the same confirmation gate before that save proceeds.
export function useDefectGroundingConfirm() {
  const { open, guard, confirm, cancel } = usePendingConfirm<true>()

  const withGroundingConfirm = (reportedDefects: string[], submit: () => void) => {
    const hasReportedDefect = reportedDefects.some((d) => d.trim().length > 0)
    guard(hasReportedDefect ? true : undefined, submit)
  }

  return {
    groundingDialogProps: { open, onClose: cancel, onConfirm: confirm },
    withGroundingConfirm,
  }
}
