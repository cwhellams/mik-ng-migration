import { useRef, useState } from 'react'
import type { FlightLogUpsertRequest } from '@mik/contracts/flight-log'

// Past this many minutes, taxiing is unusual enough to double-check, but not
// unusual enough to block outright -- taxiway congestion can genuinely make it
// this long (#1223). Mirrors the caps this schema used to hard-enforce.
const TAXI_OUT_WARN_MINUTES = 60
const TAXI_IN_WARN_MINUTES = 30

export interface LongTaxiLeg {
  leg: 'out' | 'in'
  minutes: number
}

const minutesBetween = (fromEpoch?: string, toEpoch?: string): number | undefined => {
  if (!fromEpoch || !toEpoch) return undefined
  return (Number(toEpoch) - Number(fromEpoch)) / 60
}

/**
 * Warns instead of blocking when taxi-out or taxi-in looks unusually long.
 *
 * Mirrors useOverlapCheck/useDefectGroundingConfirm's shape: give the user a
 * readable heads-up and let them confirm the save anyway, rather than a hard
 * validation error rejecting a value that congestion can make genuinely correct.
 */
export function useLongTaxiCheck() {
  const [longLegs, setLongLegs] = useState<LongTaxiLeg[]>([])
  const [open, setOpen] = useState(false)
  const pendingSubmit = useRef<(() => void) | null>(null)

  const withLongTaxiCheck = (values: FlightLogUpsertRequest, submit: () => void) => {
    const legs: LongTaxiLeg[] = []

    const taxiOutMinutes = minutesBetween(values.offBlockTimeEpoch, values.takeoffTimeEpoch)
    if (taxiOutMinutes !== undefined && taxiOutMinutes > TAXI_OUT_WARN_MINUTES) {
      legs.push({ leg: 'out', minutes: Math.round(taxiOutMinutes) })
    }

    const taxiInMinutes = minutesBetween(values.landingTimeEpoch, values.onBlockTimeEpoch)
    if (taxiInMinutes !== undefined && taxiInMinutes > TAXI_IN_WARN_MINUTES) {
      legs.push({ leg: 'in', minutes: Math.round(taxiInMinutes) })
    }

    if (legs.length === 0) {
      submit()
      return
    }

    setLongLegs(legs)
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
    longLegs,
    longTaxiDialogProps: { open, onClose: cancel, onConfirm: confirm },
    withLongTaxiCheck,
  }
}
