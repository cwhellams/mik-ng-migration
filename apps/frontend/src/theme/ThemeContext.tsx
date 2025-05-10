import {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from 'react'
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import { lightTheme, darkTheme } from './theme'

type ThemeMode = 'light' | 'dark'

interface ThemeContextType {
  mode: ThemeMode
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // Get initial theme from localStorage or default to light
  const [mode, setMode] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('themeMode')
    return (savedMode as ThemeMode) || 'light'
  })

  // Update localStorage when theme changes
  useEffect(() => {
    localStorage.setItem('themeMode', mode)
    // Also update the color-scheme on the html element for native elements
    document.documentElement.setAttribute('data-color-scheme', mode)
  }, [mode])

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'))
  }

  // Use the appropriate theme based on the current mode
  const theme = mode === 'light' ? lightTheme : darkTheme

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
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
