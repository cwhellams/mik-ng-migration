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
      main: '#646cff', // Matching your existing color scheme
    },
    secondary: {
      main: '#535bf2',
    },
    background: {
      default: '#f5f5f0', // Nice paper color background - light beige/off-white
    },
    mode: 'light', // Set to 'light' if you prefer light mode by default
  },
});

export default theme;