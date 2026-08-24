import { BrowserRouter } from 'react-router'
import { ThemeProvider } from './theme/ThemeContext'
import { SnackbarProvider } from './hooks/useSnackbar'
import AppRoutes from './AppRoutes'

function App() {
  // import.meta.env.BASE_URL is set by Vite to the configured `base` option,
  // so React Router's basename stays in sync with the deployment path (/atc/).
  return (
    <ThemeProvider>
      <SnackbarProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AppRoutes />
        </BrowserRouter>
      </SnackbarProvider>
    </ThemeProvider>
  )
}

export default App
