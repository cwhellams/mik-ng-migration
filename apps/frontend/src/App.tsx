import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen from './components/SplashScreen'
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'

// Import your page components (create these files)
import Dashboard from './sections/dashboard/Dashboard'
import Schedule from './sections/schedule/Schedule'
import Aircrafts from './sections/aircrafts/Aircrafts'
import Members from './sections/members/Members'
import Login from './sections/login/Login'
import LoginSent from './sections/login/Sent'
import LoginValidate from './sections/login/Validate'
import Register from './sections/login/Register'
import RegistrationVerify from './sections/login/RegistrationVerify'
import LogoutSuccess from './sections/login/LogoutSuccess'
import NotFound from './sections/error/NotFound'
import Member from './sections/members/Member'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider/LocalizationProvider'
import Roles from './sections/members/Roles'
import FlightLogsList from './sections/flightLog/FlightLogsList'
import LogbooksList from './sections/flightLog/LogbooksList'
import NewFlightLogEntry from './sections/flightLog/FlightLogEntry'
import { useTranslation } from 'react-i18next'
import Billing from './sections/billing/Billing'
import { FlightInvoicing } from './sections/accounting/FlightInvoicing'
import { InvoiceItemsPage } from './sections/accounting/InvoiceItems'
import MassBalance from './sections/massBalance/MassBalance'
import { AccessCodes } from './sections/accessCodes/AccessCodes'
import Documents from './sections/documents/Documents'
import { Stats } from './sections/stats/Stats'
import MemberTrash from './sections/members/MemberTrash'
import 'dayjs/locale/en-gb'
import { InvoicingAdminDashboard } from './sections/accounting/Dashboard'
import ToolsPage from './sections/accounting/ToolsPage'
import { TaxReport } from './sections/accounting/TaxReport'
import { Occurrences } from './sections/occurrences/Occurences'
import { OccurrenceEntry } from './sections/occurrences/OccurrenceEntry'
import LogbookFlights from './sections/flightLog/LogbookPage'
import Outbox from './sections/admin/Outbox'
import NonRenewals from './sections/admin/NonRenewals'
import { ServerClockProvider } from './hooks/useServerClock'

function App() {
  const [loading, setLoading] = useState(true)

  const { i18n } = useTranslation()

  useEffect(() => {
    // Check if document fonts are loaded
    const checkFontsLoaded = async () => {
      if (await document.fonts?.ready) {
        // Add a small delay to ensure smooth transition
        setTimeout(() => {
          setLoading(false)
        }, 500)
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
      adapterLocale={i18n.language === 'en' ? 'en-gb' : i18n.language}
    >
      <ServerClockProvider>
        <SplashScreen loading={loading} />
        <BrowserRouter>
          <Routes>
            {/* Main Layout with header */}
            <Route element={<MainLayout />}>
              <Route path='/' element={<Dashboard />} />
              <Route path='/schedule' element={<Schedule />} />
              <Route path='/fly'>
                <Route index element={<Aircrafts />} />
                <Route path='mass-balance' element={<MassBalance />} />
                <Route path='access-codes' element={<AccessCodes />} />
              </Route>
              <Route path='/logs'>
                <Route index element={<FlightLogsList />} />
                <Route path='flights'>
                  <Route path=':flightId' element={<NewFlightLogEntry />} />
                </Route>
                <Route path='books'>
                  <Route index element={<LogbooksList />} />
                  <Route
                    path=':aircraftRegistration/:ajlbSeqNo/:page?'
                    element={<LogbookFlights />}
                  />
                </Route>
                <Route path='occurrences'>
                  <Route index element={<Occurrences />} />
                  <Route path=':reportId' element={<OccurrenceEntry />} />
                </Route>
              </Route>
              <Route path='/club'>
                <Route index element={<Members />} />
                <Route index path='members/roles' element={<Roles />} />
                <Route path='members/trash' element={<MemberTrash />} />
                <Route path='members/:memberId' element={<Member />} />
                <Route path='billing' element={<Billing />} />
                <Route path='documents' element={<Documents />} />
                <Route path='stats' element={<Stats />} />
              </Route>
              <Route path='/accounting'>
                <Route index element={<InvoicingAdminDashboard />} />
                <Route path='invoicing' element={<FlightInvoicing />} />
                <Route path='items' element={<InvoiceItemsPage />} />
                <Route path='tools' element={<ToolsPage />} />
                <Route path='tax-report' element={<TaxReport />} />
              </Route>
              <Route path='/admin'>
                <Route index element={<Navigate to='outbox' replace />} />
                <Route path='outbox' element={<Outbox />} />
                <Route path='non-renewals' element={<NonRenewals />} />
              </Route>
            </Route>

            {/* Auth Layout without header */}
            <Route element={<AuthLayout />}>
              <Route path='/login' element={<Login />} />
              <Route path='/login/sent' element={<LoginSent />} />
              <Route path='/login/validate' element={<LoginValidate />} />
              <Route path='/register' element={<Register />} />
              <Route path='/register/verify' element={<RegistrationVerify />} />
              <Route path='/logout' element={<LogoutSuccess />} />
            </Route>

            {/* Fallback route - 404 page */}
            <Route path='*' element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ServerClockProvider>
    </LocalizationProvider>
  )
}

export default App
