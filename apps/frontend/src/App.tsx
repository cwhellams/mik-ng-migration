import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Snackbar, Button, Box } from '@mui/material'
import SplashScreen from './components/SplashScreen'
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'
import { useServiceWorkerUpdate } from './hooks/useServiceWorkerUpdate'

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
import EmailChangeVerify from './sections/members/EmailChangeVerify'
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
import FuelPrices from './sections/fuelPrices/FuelPrices'
import Documents from './sections/documents/Documents'
import { Stats } from './sections/stats/Stats'
import MemberTrash from './sections/members/MemberTrash'
import InstructorStatus from './sections/members/InstructorStatus'
import 'dayjs/locale/en-gb'
import { InvoicingAdminDashboard } from './sections/accounting/Dashboard'
import ToolsPage from './sections/accounting/ToolsPage'
import { TaxReport } from './sections/accounting/TaxReport'
import { TraficomReport } from './sections/accounting/TraficomReport'
import { UpliftReport } from './sections/accounting/UpliftReport'
import { InstructorWorktimeReport } from './sections/accounting/InstructorWorktimeReport'
import { Occurrences } from './sections/occurrences/Occurences'
import { OccurrenceEntry } from './sections/occurrences/OccurrenceEntry'
import LogbookFlights from './sections/flightLog/LogbookPage'
import Outbox from './sections/admin/Outbox'
import NonRenewals from './sections/admin/NonRenewals'
import ShopPage from './sections/shop/ShopPage'
import ProductPage from './sections/shop/ProductPage'
import CartPage from './sections/shop/CartPage'
import OrdersPage from './sections/shop/OrdersPage'
import OrderDetailPage from './sections/shop/OrderDetailPage'
import MyFlightPackagesPage from './sections/shop/MyFlightPackagesPage'
import ShopAdminDashboard from './sections/admin/shop/ShopAdminDashboard'
import ProductsAdmin from './sections/admin/shop/ProductsAdmin'
import CategoriesAdmin from './sections/admin/shop/CategoriesAdmin'
import OrdersAdmin from './sections/admin/shop/OrdersAdmin'
import DiscountCodesAdmin from './sections/admin/shop/DiscountCodesAdmin'
import FlightPackagesAdmin from './sections/admin/shop/FlightPackagesAdmin'
import ExamsPage from './sections/exams/ExamsPage'
import ExamDetailPage from './sections/exams/ExamDetailPage'
import ExamAttemptPage from './sections/exams/ExamAttemptPage'
import ExamReviewPage from './sections/exams/ExamReviewPage'
import MyExamHistoryPage from './sections/exams/MyExamHistoryPage'
import ExamsAdminPage from './sections/admin/exams/ExamsAdminPage'
import ExamVersionEditorPage from './sections/admin/exams/ExamVersionEditorPage'
import AttemptsAdminPage from './sections/admin/exams/AttemptsAdminPage'
import { ServerClockProvider } from './hooks/useServerClock'

function App() {
  const [loading, setLoading] = useState(true)
  const { i18n, t } = useTranslation()
  const { isUpdateAvailable, dismissUpdate, refreshApp } = useServiceWorkerUpdate()

  useEffect(() => {
    // Check if document fonts are loaded with a hard timeout to prevent infinite loading on mobile
    const checkFontsLoaded = async () => {
      let fontsReady = false
      
      // Race: fonts.ready vs. hard timeout
      try {
        await Promise.race([
          document.fonts?.ready || Promise.resolve(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ])
        fontsReady = true
      } catch {
        fontsReady = false
      }

      // Add a small delay to ensure smooth transition
      setTimeout(() => {
        setLoading(false)
      }, fontsReady ? 300 : 500)
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
                <Route path='fuel-prices' element={<FuelPrices />} />
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
                <Route
                  path='instructor-status'
                  element={<InstructorStatus />}
                />
                <Route path='billing' element={<Billing />} />
                <Route path='documents' element={<Documents />} />
                <Route path='stats' element={<Stats />} />
              </Route>
              <Route
                path='/profile/email-change/verify'
                element={<EmailChangeVerify />}
              />
              <Route path='/accounting'>
                <Route index element={<InvoicingAdminDashboard />} />
                <Route path='invoicing' element={<FlightInvoicing />} />
                <Route path='items' element={<InvoiceItemsPage />} />
                <Route path='tools' element={<ToolsPage />} />
                <Route path='tax-report' element={<TaxReport />} />
                <Route path='traficom-report' element={<TraficomReport />} />
                <Route path='uplift-report' element={<UpliftReport />} />
                <Route
                  path='instructor-worktime'
                  element={<InstructorWorktimeReport />}
                />
              </Route>
              <Route path='/shop'>
                <Route index element={<ShopPage />} />
                <Route path='products/:id' element={<ProductPage />} />
                <Route path='cart' element={<CartPage />} />
                <Route path='orders' element={<OrdersPage />} />
                <Route
                  path='flight-packages'
                  element={<MyFlightPackagesPage />}
                />
                <Route path='orders/:orderId' element={<OrderDetailPage />} />
              </Route>
              <Route path='/exams'>
                <Route index element={<ExamsPage />} />
                <Route path=':examId' element={<ExamDetailPage />} />
                <Route
                  path='attempt/:attemptId'
                  element={<ExamAttemptPage />}
                />
                <Route path='review/:attemptId' element={<ExamReviewPage />} />
                <Route path='history' element={<MyExamHistoryPage />} />
              </Route>
              <Route path='/admin'>
                <Route index element={<Navigate to='outbox' replace />} />
                <Route path='outbox' element={<Outbox />} />
                <Route path='non-renewals' element={<NonRenewals />} />
                <Route path='shop' element={<ShopAdminDashboard />} />
                <Route path='shop/products' element={<ProductsAdmin />} />
                <Route path='shop/categories' element={<CategoriesAdmin />} />
                <Route path='shop/orders' element={<OrdersAdmin />} />
                <Route
                  path='shop/discount-codes'
                  element={<DiscountCodesAdmin />}
                />
                <Route
                  path='shop/flight-packages'
                  element={<FlightPackagesAdmin />}
                />
                <Route path='exams' element={<ExamsAdminPage />} />
                <Route
                  path='exams/versions/:versionId'
                  element={<ExamVersionEditorPage />}
                />
                <Route path='exams/attempts' element={<AttemptsAdminPage />} />
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
        {/* Service Worker Update Notification */}
        <Snackbar
          open={isUpdateAvailable}
          autoHideDuration={null}
          onClose={dismissUpdate}
          message={t('common.updateAvailable')}
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button color='primary' size='small' onClick={refreshApp}>
                {t('common.refresh')}
              </Button>
              <Button color='inherit' size='small' onClick={dismissUpdate}>
                {t('common.dismiss')}
              </Button>
            </Box>
          }
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        />
      </ServerClockProvider>
    </LocalizationProvider>
  )
}

export default App
