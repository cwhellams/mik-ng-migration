import type {
  FlightLogOverlapConflict,
  FlightLogOverlapResponse,
  FlightLogUpsertRequest,
} from '@mik/contracts/flight-log'
import { api } from '../../hooks/useApi'
import { usePendingConfirm } from './usePendingConfirm'

/**
 * Warns about flight log entries that overlap the times being submitted.
 *
 * The database trigger (flight.no_overlaps_function) is the authoritative guard and
 * rejects overlaps outright; this only gives the user a readable heads-up first, so a
 * failing check must never block the save.
 *
 * @param excludeFlightId the entry being edited, omitted for new entries
 */
export const useOverlapCheck = (excludeFlightId?: string) => {
  const { open, extra, guard, confirm, cancel } = usePendingConfirm<FlightLogOverlapConflict[]>()
  const conflicts = extra ?? []

  const fetchConflicts = async (
    values: FlightLogUpsertRequest,
  ): Promise<FlightLogOverlapConflict[]> => {
    if (!values.aircraftRegistration || !values.offBlockTimeEpoch || !values.onBlockTimeEpoch) {
      return []
    }
    try {
      const res = await api.get<FlightLogOverlapResponse>('v1/flight-logs/overlap-check', {
        params: {
          aircraftRegistration: values.aircraftRegistration,
          offBlockTimeEpoch: values.offBlockTimeEpoch,
          onBlockTimeEpoch: values.onBlockTimeEpoch,
          ...(excludeFlightId ? { excludeFlightId } : {}),
        },
      })
      return res.data.conflicts
    } catch {
      return []
    }
  }

  /**
   * Runs `onProceed` straight away when nothing overlaps, otherwise opens the warning
   * dialog and defers it until the user chooses to submit anyway.
   */
  const withOverlapCheck = async (values: FlightLogUpsertRequest, onProceed: () => void) => {
    const found = await fetchConflicts(values)
    guard(found.length === 0 ? undefined : found, onProceed)
  }

  const overlapDialogProps = {
    open,
    conflicts,
    onCancel: cancel,
    onConfirm: confirm,
  }

  return { withOverlapCheck, overlapDialogProps }
}
