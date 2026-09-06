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
  // The router's basename is Vite's `base` (see vite.config.ts): '/' on
  // DigitalOcean, where this app owns its own subdomain, and '/admin/' on
  // Cloudflare, where it is a path on the tenant's single hostname. Reading it
  // from BASE_URL rather than repeating the literal keeps the router and the
  // asset URLs from drifting apart, which shows up as a blank page rather than
  // as anything that names the cause.
  return (
    <ApiConfigProvider value={API_CONFIG}>
      <ThemeProvider>
        <WithTimezone>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='en-gb'>
            <SnackbarProvider>
              <BrowserRouter basename={import.meta.env.BASE_URL}>
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
