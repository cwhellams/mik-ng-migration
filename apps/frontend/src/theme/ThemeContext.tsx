import {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from 'react'
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import { lightTheme, darkTheme } from './theme'
import { mutate } from 'swr'

type ThemeMode = 'light' | 'dark'

interface ThemeContextType {
  mode: ThemeMode
  sudo?: boolean
  toggleTheme: () => void
  toggleSudo: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // Get initial theme from localStorage or default to light
  const [mode, setMode] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('themeMode')
    return (savedMode as ThemeMode) || 'light'
  })

  // Sudo mode is always off by default
  const [sudo, setSudo] = useState<boolean>(false)

  // Update localStorage when theme changes
  useEffect(() => {
    localStorage.setItem('themeMode', mode)
    // Also update the color-scheme on the html element for native elements
    document.documentElement.setAttribute('data-color-scheme', mode)
  }, [mode])

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'))
  }

  const toggleSudo = () => {
    setSudo((prevSudo) => !prevSudo)
    // clear all SWR caches after toggling sudo mode
    setTimeout(() => mutate(() => true, undefined, { revalidate: true }), 0)
  }

  // Use the appropriate theme based on the current mode
  const theme = mode === 'light' ? lightTheme : darkTheme

  return (
    <ThemeContext.Provider value={{ mode, sudo, toggleTheme, toggleSudo }}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  )
}

// Custom hook to use the theme context
export const useThemeMode = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useThemeMode must be used within a ThemeProvider')
  }
  return context
}
