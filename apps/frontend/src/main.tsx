import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import '@fontsource/poppins/300.css' // Light
import '@fontsource/poppins/400.css' // Regular
import '@fontsource/poppins/500.css' // Medium
import '@fontsource/poppins/700.css' // Bold
import './index.css'
import './i18n' // Import i18n configuration
import App from './App.tsx'
import { ThemeProvider } from './theme/ThemeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <CssBaseline /> {/* Provides a consistent baseline CSS */}
      <App />
    </ThemeProvider>
  </StrictMode>,
)
