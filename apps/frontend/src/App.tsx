import { useState, useEffect, useMemo } from 'react'
import { dayjs } from '@mik/ui/utils/date'
import { Snackbar, Button, Box } from '@mui/material'
import SplashScreen from './components/SplashScreen'
import { useServiceWorkerUpdate } from './hooks/useServiceWorkerUpdate'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { useTranslation } from 'react-i18next'
import 'dayjs/locale/en-gb'
import { ServerClockProvider } from './hooks/useServerClock'
import { SnackbarProvider } from './hooks/useSnackbar'
import { BrowserRouter } from 'react-router'
import { ApiConfigProvider } from '@mik/ui/hooks/apiConfig'
import { TimezoneProvider } from '@mik/ui/hooks/useTimezone'
import { useThemeMode } from './theme/ThemeContext'
import AppRoutes from './AppRoutes'

function App() {
  const [loading, setLoading] = useState(true)
  const { i18n, t } = useTranslation()
  const { isUpdateAvailable, dismissUpdate, refreshApp } = useServiceWorkerUpdate()
  const { sudo, timezone, setTimezone } = useThemeMode()

  // What the shared `useApi` needs from this app: whether requests carry admin
  // rights. Here that follows the sudo toggle, so a member who holds an admin
  // permission but has not switched admin mode on still browses as a member.
  // (`apps/admin` passes a constant `true` — see its App.tsx.)
  // Memoised so flipping some unrelated state does not hand every consumer a
  // new context value and revalidate the whole SWR cache.
  const apiConfig = useMemo(() => ({ sudo: sudo ?? false }), [sudo])

  // Where the member's UTC-or-local preference lives is this app's business;
  // the formatting built on it is shared (@mik/ui/hooks/useTimezone).
  const timezoneSetting = useMemo(() => ({ timezone, setTimezone }), [timezone, setTimezone])

  // Keep dayjs's global default locale (month/day names used by plain dayjs().format()
  // calls throughout the app) in sync with the selected app language. This must run
  // synchronously during render (not in a useEffect) — App re-renders before its
  // children on a language change, so setting it here guarantees the locale is already
  // correct by the time any child calls dayjs().format(). A useEffect here runs after
  // commit, one render too late: children would render with the previous locale on the
  // language-change render, only catching up on whatever the *next* unrelated re-render
  // happens to be — visible as each language showing the previous one's month names.
  dayjs.locale(i18n.language)

  useEffect(() => {
    // Check if document fonts are loaded with a hard timeout to prevent infinite loading on mobile
    const checkFontsLoaded = async () => {
      let fontsReady = false

      // Race: fonts.ready vs. hard timeout
      try {
        await Promise.race([
          document.fonts?.ready || Promise.resolve(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ])
        fontsReady = true
      } catch {
        fontsReady = false
      }

      // Add a small delay to ensure smooth transition
      setTimeout(
        () => {
          setLoading(false)
        },
        fontsReady ? 300 : 500,
      )
    }

    checkFontsLoaded()
  }, [])

  return (
    <ApiConfigProvider value={apiConfig}>
      <TimezoneProvider value={timezoneSetting}>
        <LocalizationProvider
          dateAdapter={AdapterDayjs}
          adapterLocale={i18n.language === 'en' ? 'en-gb' : i18n.language}
        >
          <ServerClockProvider>
            <SnackbarProvider>
              <SplashScreen loading={loading} />
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
              {/* Service Worker Update Notification */}
              <Snackbar
                open={isUpdateAvailable}
                autoHideDuration={null}
                onClose={dismissUpdate}
                message={t('common.updateAvailable')}
                action={
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button color='primary' size='small' onClick={refreshApp}>
                      {t('common.refresh')}
                    </Button>
                    <Button color='inherit' size='small' onClick={dismissUpdate}>
                      {t('common.dismiss')}
                    </Button>
                  </Box>
                }
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              />
            </SnackbarProvider>
          </ServerClockProvider>
        </LocalizationProvider>
      </TimezoneProvider>
    </ApiConfigProvider>
  )
}

export default App
