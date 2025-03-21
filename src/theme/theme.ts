import { createTheme } from '@mui/material/styles'
import { PaletteMode } from '@mui/material'

// Common theme settings
const getCommonTheme = (mode: PaletteMode) => ({
  typography: {
    fontFamily: [
      'Poppins',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
    ].join(','),
    h1: {
      fontWeight: 700,
    },
    h2: {
      fontWeight: 600,
    },
    h3: {
      fontWeight: 500,
    },
    body1: {
      fontWeight: 400,
    },
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
})

// Create the light theme
export const lightTheme = createTheme({
  ...getCommonTheme('light'),
  palette: {
    mode: 'light',
    primary: {
      main: '#002385',
      light: '#3b4cad',
      dark: '#001a66',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#535bf2',
      light: '#7e84f5',
      dark: '#3040d6',
      contrastText: '#ffffff',
    },
    error: {
      main: '#e53935',
      light: '#ff6c5c',
      dark: '#b61827',
    },
    warning: {
      main: '#ffa726',
      light: '#ffd95b',
      dark: '#c77800',
    },
    info: {
      main: '#29b6f6',
      light: '#73e8ff',
      dark: '#0086c3',
    },
    success: {
      main: '#4caf50',
      light: '#80e27e',
      dark: '#087f23',
    },
    background: {
      default: '#f5f5f0',
      paper: '#ffffff',
    },
    text: {
      primary: '#1c2130',
      secondary: '#4e5567',
      disabled: '#9e9e9e',
    },
    divider: 'rgba(0, 35, 133, 0.12)',
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          transition: 'box-shadow 0.3s ease',
          '&:hover': {
            boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 10px rgba(0,35,133,0.08)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '&:hover fieldset': {
              borderColor: 'rgba(0,35,133,0.4)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#002385',
            },
          },
        },
      },
    },
  },
})

// Create the dark theme
export const darkTheme = createTheme({
  ...getCommonTheme('dark'),
  palette: {
    mode: 'dark',
    primary: {
      main: '#5b7ae0',
      light: '#8ba9ff',
      dark: '#2b4dad',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#818cf8',
      light: '#b0b8fa',
      dark: '#5462e6',
      contrastText: '#ffffff',
    },
    error: {
      main: '#f44336',
      light: '#ff7961',
      dark: '#ba000d',
    },
    warning: {
      main: '#ff9800',
      light: '#ffc947',
      dark: '#c66900',
    },
    info: {
      main: '#29b6f6',
      light: '#73e8ff',
      dark: '#0086c3',
    },
    success: {
      main: '#66bb6a',
      light: '#98ee99',
      dark: '#338a3e',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#f5f5f5',
      secondary: '#b0b0b0',
      disabled: '#6c6c6c',
    },
    divider: 'rgba(255,255,255,0.12)',
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transition: 'box-shadow 0.3s ease',
          '&:hover': {
            boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '&:hover fieldset': {
              borderColor: 'rgba(91,122,224,0.6)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#5b7ae0',
            },
          },
        },
      },
    },
  },
})

// Export default theme (for backward compatibility)
export default lightTheme 