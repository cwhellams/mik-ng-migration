import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Snackbar } from '@mui/material'
import type { AlertColor, SnackbarOrigin } from '@mui/material'

const DEFAULT_ANCHOR_ORIGIN: SnackbarOrigin = { vertical: 'top', horizontal: 'center' }

/** For screens that anchor their toast bottom-center instead of the default top-center. */
export const SNACKBAR_ANCHOR_BOTTOM_CENTER: SnackbarOrigin = {
  vertical: 'bottom',
  horizontal: 'center',
}

export interface ShowSnackbarOptions {
  severity?: AlertColor
  /** e.g. a "View cart" link shown alongside the message */
  action?: ReactNode
  autoHideDuration?: number
  /** Defaults to top-center; override for a screen that wants it elsewhere. */
  anchorOrigin?: SnackbarOrigin
}

interface QueuedSnack extends ShowSnackbarOptions {
  key: number
  message: string
}

interface SnackbarContextValue {
  showSnackbar: (message: string, options?: ShowSnackbarOptions) => void
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined)

export const SnackbarProvider = ({ children }: { children: ReactNode }) => {
  const [queue, setQueue] = useState<QueuedSnack[]>([])
  const [current, setCurrent] = useState<QueuedSnack | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const nextKey = useRef(0)

  const showSnackbar = useCallback((message: string, options?: ShowSnackbarOptions) => {
    nextKey.current += 1
    setQueue((prev) => [...prev, { ...options, message, key: nextKey.current }])
  }, [])

  // Only one snack shows at a time; a call while one is visible queues
  // rather than replacing it, so an unread message is never silently lost.
  useEffect(() => {
    if (queue.length === 0) return
    if (!current) {
      setCurrent(queue[0])
      setQueue((prev) => prev.slice(1))
      setOpen(true)
    } else if (open) {
      setOpen(false)
    }
  }, [queue, current, open])

  const handleClose = useCallback(() => setOpen(false), [])

  const handleExited = useCallback(() => setCurrent(undefined), [])

  const value = useMemo(() => ({ showSnackbar }), [showSnackbar])

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.key}
        open={open}
        autoHideDuration={current?.autoHideDuration ?? 3000}
        onClose={handleClose}
        anchorOrigin={current?.anchorOrigin ?? DEFAULT_ANCHOR_ORIGIN}
        slotProps={{ transition: { onExited: handleExited } }}
      >
        <Alert
          severity={current?.severity ?? 'info'}
          onClose={handleClose}
          action={current?.action}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  )
}

/** Shows a transient toast from anywhere in the tree — no per-component Snackbar/Alert JSX needed. */
export const useSnackbar = () => {
  const context = useContext(SnackbarContext)
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider')
  }
  return context
}
