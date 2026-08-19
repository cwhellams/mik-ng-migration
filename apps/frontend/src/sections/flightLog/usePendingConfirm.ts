import { useRef, useState } from 'react'

/**
 * The "soft confirmation before submit" state machine shared by useOverlapCheck,
 * useDefectGroundingConfirm and useLongTaxiCheck: each has its own domain-specific
 * check (and its own extra payload for the dialog to render -- conflicts, long taxi
 * legs, or nothing at all), but the open/pending-submit lifecycle around that check
 * was hand-copied identically in all three. `guard` takes the check's already-computed
 * result rather than running the check itself, so a hook whose check is async (like
 * useOverlapCheck's network fetch) stays in charge of its own await -- only the
 * synchronous "now decide what happens" part is shared.
 */
export function usePendingConfirm<T>() {
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState<T | undefined>(undefined)
  const pendingSubmit = useRef<(() => void) | null>(null)

  const guard = (result: T | undefined, submit: () => void) => {
    if (result === undefined) {
      submit()
      return
    }
    setExtra(result)
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

  return { open, extra, guard, confirm, cancel }
}
