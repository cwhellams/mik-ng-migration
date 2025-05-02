import { createTheme } from '@mui/material/styles'

// Create a theme instance
const theme = createTheme({
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
  palette: {
    primary: {
      main: '#002385',
      light: '#3b4cad', // Lighter shade of primary
      dark: '#001a66', // Darker shade of primary
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
      default: '#f5f5f0', // Keep your paper color background
      paper: '#ffffff',
    },
    text: {
      primary: '#1c2130',
      secondary: '#4e5567',
      disabled: '#9e9e9e',
    },
    divider: 'rgba(0, 35, 133, 0.12)',
    mode: 'light',
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.05)',
          overflow: 'hidden',
          position: 'relative',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 'bold', // Make header text bold
          backgroundColor: '#f5f5f5', // Optional: Set background color for header
          color: '#002385', // Optional: Set text color for header
        },
        root: {
          padding: '16px', // Add padding if needed
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

// Create the light theme
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#002385',
      light: '#3b4cad',
      dark: '#001a66',
      contrastText: '#ffffff',
    },
    // Other light theme colors from your existing theme
    background: {
      default: '#f5f5f0',
      paper: '#ffffff',
    },
    text: {
      primary: '#1c2130',
      secondary: '#4e5567',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.05)',
          overflow: 'hidden',
          position: 'relative',
        },
      },
    },
  },
})

// Create the dark theme with the same card styling but adapted for dark mode
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#535bf2',
      light: '#7e84f5',
      dark: '#3040d6',
      contrastText: '#ffffff',
    },
    // Dark theme colors
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
          border: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden',
          position: 'relative',
        },
      },
    },
  },
})

export default theme
