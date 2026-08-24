import { BrowserRouter } from 'react-router'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { ApiConfigProvider } from '@mik/ui/hooks/apiConfig'
import { TimezoneProvider } from '@mik/ui/hooks/useTimezone'
import { useMemo } from 'react'
import { ThemeProvider, useThemeMode } from './theme/ThemeContext'
import { SnackbarProvider } from '@mik/ui/hooks/useSnackbar'
import AppRoutes from './AppRoutes'

/**
 * Every request from this app carries admin rights. There is no sudo toggle
 * here — reaching the admin app is itself the deliberate admin-intent step
 * (#1233, answer 1) — so this is a module constant rather than state, and the
 * context value never changes identity.
 */
const API_CONFIG = { sudo: true }

/**
 * Bridges this app's timezone preference (kept in its ThemeContext) into the
 * shared formatters. A separate component because it must sit *inside*
 * ThemeProvider to read it.
 */
const WithTimezone = ({ children }: { children: React.ReactNode }) => {
  const { timezone, setTimezone } = useThemeMode()
  const value = useMemo(() => ({ timezone, setTimezone }), [timezone, setTimezone])
  return <TimezoneProvider value={value}>{children}</TimezoneProvider>
}

function App() {
  // No basename: the admin app is served from the root of its own subdomain
  // (twr.mik.fi / beta-twr.mik.fi), not a path on another app's domain.
  return (
    <ApiConfigProvider value={API_CONFIG}>
      <ThemeProvider>
        <WithTimezone>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='en-gb'>
            <SnackbarProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </SnackbarProvider>
          </LocalizationProvider>
        </WithTimezone>
      </ThemeProvider>
    </ApiConfigProvider>
  )
}

export default App
