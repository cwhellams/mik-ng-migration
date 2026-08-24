import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins'
import '@mik/ui/i18n' // i18n configuration, shared with the member app
import 'dayjs/locale/en-gb'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
