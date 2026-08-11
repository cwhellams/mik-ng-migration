import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Snackbar } from '@mui/material'
import type { AlertColor, SnackbarOrigin } from '@mui/material'

const DEFAULT_ANCHOR_ORIGIN: SnackbarOrigin = { vertical: 'top', horizontal: 'center' }

export interface ShowSnackbarOptions {
  severity?: AlertColor
  /** e.g. a "View cart" link shown alongside the message */
  action?: ReactNode
  autoHideDuration?: number
  /** Defaults to top-center; override for a screen that wants it elsewhere. */
  anchorOrigin?: SnackbarOrigin
}

interface SnackbarContextValue {
  showSnackbar: (message: string, options?: ShowSnackbarOptions) => void
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined)

export const SnackbarProvider = ({ children }: { children: ReactNode }) => {
  const [snack, setSnack] = useState<(ShowSnackbarOptions & { message: string }) | null>(null)

  const showSnackbar = useCallback((message: string, options?: ShowSnackbarOptions) => {
    setSnack({ message, ...options })
  }, [])

  const handleClose = useCallback(() => setSnack(null), [])

  const value = useMemo(() => ({ showSnackbar }), [showSnackbar])

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        open={!!snack}
        autoHideDuration={snack?.autoHideDuration ?? 3000}
        onClose={handleClose}
        anchorOrigin={snack?.anchorOrigin ?? DEFAULT_ANCHOR_ORIGIN}
      >
        <Alert severity={snack?.severity ?? 'info'} onClose={handleClose} action={snack?.action}>
          {snack?.message}
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
