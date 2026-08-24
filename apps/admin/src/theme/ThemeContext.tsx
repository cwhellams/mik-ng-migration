import { createContext, useState, useContext, useEffect, ReactNode } from 'react'
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import theme from './theme'

type ThemeMode = 'light' | 'dark'

/**
 * Whether timestamps render in UTC or the browser's local zone. Aviation
 * records are kept in UTC, so that is the default here as it is in the member
 * app — an admin reading a logbook or an occurrence report should see the same
 * Z-times the pilot filed.
 */
type TimezonePreference = 'utc' | 'local'

interface ThemeContextType {
  mode: ThemeMode
  toggleTheme: () => void
  timezone: TimezonePreference
  setTimezone: (timezone: TimezonePreference) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('adminThemeMode')
    return (savedMode as ThemeMode) || 'light'
  })

  const [timezone, setTimezone] = useState<TimezonePreference>(
    () => (localStorage.getItem('adminTimezone') as TimezonePreference) || 'utc',
  )

  useEffect(() => {
    localStorage.setItem('adminThemeMode', mode)
    document.documentElement.setAttribute('data-color-scheme', mode)
  }, [mode])

  useEffect(() => {
    localStorage.setItem('adminTimezone', timezone)
  }, [timezone])

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'))
  }

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme, timezone, setTimezone }}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  )
}

export const useThemeMode = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProvider')
  }
  return context
}
