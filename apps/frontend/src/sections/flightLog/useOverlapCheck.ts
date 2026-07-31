import { useRef, useState } from 'react'
import type {
  FlightLogOverlapConflict,
  FlightLogOverlapResponse,
  FlightLogUpsertRequest,
} from '@backend/routes/flight-log/models'
import { api } from '../../hooks/useApi'

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
  const [conflicts, setConflicts] = useState<FlightLogOverlapConflict[]>([])
  const [open, setOpen] = useState(false)
  const pendingSubmit = useRef<(() => void) | null>(null)

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
    if (found.length === 0) {
      onProceed()
      return
    }
    setConflicts(found)
    pendingSubmit.current = onProceed
    setOpen(true)
  }

  const overlapDialogProps = {
    open,
    conflicts,
    onCancel: () => setOpen(false),
    onConfirm: () => {
      setOpen(false)
      pendingSubmit.current?.()
    },
  }

  return { withOverlapCheck, overlapDialogProps }
}
