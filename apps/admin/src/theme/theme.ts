import { createTheme } from '@mui/material/styles'

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
    ].join(','),
    h1: { fontWeight: 700 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 500 },
    body1: { fontWeight: 400 },
  },
  palette: {
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

export default theme
