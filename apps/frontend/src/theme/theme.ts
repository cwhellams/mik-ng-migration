import { createTheme } from '@mui/material/styles';

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
});

export default theme;