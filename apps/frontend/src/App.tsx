import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SplashScreen from './components/SplashScreen'
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'

// Import your page components (create these files)
import Dashboard from './sections/dashboard/Dashboard'
// import Schedule from './sections/Schedule'
import Aircrafts from './sections/aircrafts/Aircrafts'
import Members from './sections/members/Members'
import Login from './sections/login/Login'
import LoginSent from './sections/login/Sent'
import LoginValidate from './sections/login/Validate'
import Register from './sections/login/Register'
import NotFound from './sections/error/NotFound'
import Member from './sections/members/Member'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider/LocalizationProvider'
import Roles from './sections/members/Roles'
import FlightLogLanding from './sections/flightLog/Landing'
import NewFlightLogEntry from './sections/flightLog/NewFlightLogEntry'
import { useTranslation } from 'react-i18next'
import Billing from './sections/billing/billing'
import AccountingLayout from './sections/accounting/Accounting'
import { InvoiceItemsPage } from './sections/accounting/InvoiceItems'

function App() {
  const [loading, setLoading] = useState(true)

  const { i18n } = useTranslation()

  useEffect(() => {
    // Check if document fonts are loaded
    const checkFontsLoaded = () => {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          // Add a small delay to ensure smooth transition
          setTimeout(() => {
            setLoading(false)
          }, 500)
        })
      } else {
        // Fallback for browsers that don't support document.fonts
        setTimeout(() => {
          setLoading(false)
        }, 1500)
      }
    }

    checkFontsLoaded()
  }, [])

  return (
    <LocalizationProvider
      dateAdapter={AdapterDayjs}
      adapterLocale={i18n.language}
    >
      <SplashScreen loading={loading} />
      <BrowserRouter>
        <Routes>
          {/* Main Layout with header */}
          <Route element={<MainLayout />}>
            <Route path='/' element={<Dashboard />} />
            {/* <Route path="/schedule" element={<Schedule />} /> */}
            <Route path='/aircrafts' element={<Aircrafts />} />
            <Route index path='/members/roles' element={<Roles />} />
            <Route index path='/billing' element={<Billing />} />
            <Route index path='/members' element={<Members />} />
            <Route path='/members/:memberId' element={<Member />} />
            /** Flight Log Routes */
            <Route path='/flight-logs' element={<FlightLogLanding />} />
            <Route
              path='/flight-logs/:flightId'
              element={<NewFlightLogEntry />}
            />
            <Route path='/accounting' element={<AccountingLayout />}>
              <Route
                path='dashboard'
                element={<div>Accounting Dashboard</div>}
              />
              <Route path='invoicing' element={<div>Invoicing</div>} />
              <Route path='items' element={<InvoiceItemsPage />} />
            </Route>
          </Route>

          {/* Auth Layout without header */}
          <Route element={<AuthLayout />}>
            <Route path='/login' element={<Login />} />
            <Route path='/login/sent' element={<LoginSent />} />
            <Route path='/login/validate' element={<LoginValidate />} />
            <Route path='/register' element={<Register />} />
          </Route>

          {/* Fallback route - 404 page */}
          <Route path='*' element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </LocalizationProvider>
  )
}

export default App
