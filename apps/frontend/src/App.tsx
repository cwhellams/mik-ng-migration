import { useState, useEffect } from 'react'
import { dayjs } from './utils/date'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MIKPermissions } from '@backend/routes/members/models'
import { useRoles } from './hooks/useRoles'
import { Snackbar, Button, Box } from '@mui/material'
import SplashScreen from './components/SplashScreen'
import RequirePermission from './components/RequirePermission'
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
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
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
import MemberChangeLog from './sections/members/MemberChangeLog'
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
import NotificationBannerAdmin from './sections/admin/NotificationBannerAdmin'
import UsefulPhoneNumbersAdminPage from './sections/admin/UsefulPhoneNumbersAdminPage'
import { UnpaidOverdueInvoices } from './sections/accounting/UnpaidOverdueInvoices'
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
import OrderDetailAdmin from './sections/admin/shop/OrderDetailAdmin'
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
import DtoProgramsAdminPage from './sections/admin/dto/DtoProgramsAdminPage'
import DtoSyllabusEditorPage from './sections/admin/dto/DtoSyllabusEditorPage'
import DtoImportPage from './sections/admin/dto/DtoImportPage'
import DtoProgressPage from './sections/dto/DtoProgressPage'
import DtoVerificationPage from './sections/dto/DtoVerificationPage'
import DtoMyTrainingPage from './sections/dto/DtoMyTrainingPage'
import DtoStudentDetailPage from './sections/dto/DtoStudentDetailPage'
import EventsList from './sections/events/EventsList'
import EventsAdmin from './sections/admin/events/EventsAdmin'
import InventoryPage from './sections/inventory/InventoryPage'
import InventoryItemPage from './sections/inventory/InventoryItemPage'
import InventoryAdminPage from './sections/admin/inventory/InventoryAdminPage'
import { ServerClockProvider } from './hooks/useServerClock'
import ExpensesList from './sections/expenses/ExpensesList'
import ExpenseClaimForm from './sections/expenses/ExpenseClaimForm'
import ExpenseClaimWizard from './sections/expenses/ExpenseClaimWizard'
import ExpenseClaimDetail from './sections/expenses/ExpenseClaimDetail'
import { ExpenseApproval } from './sections/accounting/ExpenseApproval'
import { ExpenseClaimAdminDetail } from './sections/accounting/ExpenseClaimAdminDetail'
import { MileageAllowancesPage } from './sections/accounting/MileageAllowancesPage'
import { CostCentresPage } from './sections/accounting/CostCentresPage'
import AmeList from './sections/ame/AmeList'
import AmeSubmitForm from './sections/ame/AmeSubmitForm'
import AmeAdminList from './sections/admin/ame/AmeAdminList'

function DtoIndexRedirect() {
  const { hasAccess } = useRoles()
  const isElevated = hasAccess(MIKPermissions.DTO_INSTRUCTOR) || hasAccess(MIKPermissions.DTO_ADMIN)
  return <Navigate to={isElevated ? 'verify' : 'my-training'} replace />
}

function App() {
  const [loading, setLoading] = useState(true)
  const { i18n, t } = useTranslation()
  const { isUpdateAvailable, dismissUpdate, refreshApp } = useServiceWorkerUpdate()

  // Keep dayjs's global default locale (month/day names used by plain dayjs().format()
  // calls throughout the app) in sync with the selected app language. This must run
  // synchronously during render (not in a useEffect) — App re-renders before its
  // children on a language change, so setting it here guarantees the locale is already
  // correct by the time any child calls dayjs().format(). A useEffect here runs after
  // commit, one render too late: children would render with the previous locale on the
  // language-change render, only catching up on whatever the *next* unrelated re-render
  // happens to be — visible as each language showing the previous one's month names.
  dayjs.locale(i18n.language)

  useEffect(() => {
    // Check if document fonts are loaded with a hard timeout to prevent infinite loading on mobile
    const checkFontsLoaded = async () => {
      let fontsReady = false

      // Race: fonts.ready vs. hard timeout
      try {
        await Promise.race([
          document.fonts?.ready || Promise.resolve(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ])
        fontsReady = true
      } catch {
        fontsReady = false
      }

      // Add a small delay to ensure smooth transition
      setTimeout(
        () => {
          setLoading(false)
        },
        fontsReady ? 300 : 500,
      )
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
                <Route
                  path='members/changelog'
                  element={
                    <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
                      <MemberChangeLog />
                    </RequirePermission>
                  }
                />
                <Route path='members/:memberId' element={<Member />} />
                <Route path='instructor-status' element={<InstructorStatus />} />
                <Route path='billing' element={<Billing />} />
                <Route path='documents' element={<Documents />} />
                <Route path='stats' element={<Stats />} />
                <Route path='events' element={<EventsList />} />
                <Route path='ame-list' element={<AmeList />} />
                <Route path='ame-list/new' element={<AmeSubmitForm />} />
              </Route>
              <Route path='/profile/email-change/verify' element={<EmailChangeVerify />} />
              <Route path='/expenses'>
                <Route index element={<ExpensesList />} />
                <Route path='new' element={<ExpenseClaimWizard />} />
                <Route path=':id' element={<ExpenseClaimDetail />} />
                <Route path=':id/edit' element={<ExpenseClaimForm />} />
              </Route>
              <Route path='/accounting'>
                <Route
                  index
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <InvoicingAdminDashboard />
                    </RequirePermission>
                  }
                />
                <Route
                  path='invoicing'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <FlightInvoicing />
                    </RequirePermission>
                  }
                />
                <Route
                  path='items'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <InvoiceItemsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='tools'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <ToolsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='tax-report'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <TaxReport />
                    </RequirePermission>
                  }
                />
                <Route
                  path='traficom-report'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <TraficomReport />
                    </RequirePermission>
                  }
                />
                <Route
                  path='uplift-report'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <UpliftReport />
                    </RequirePermission>
                  }
                />
                <Route
                  path='instructor-worktime'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <InstructorWorktimeReport />
                    </RequirePermission>
                  }
                />
                <Route
                  path='unpaid-overdue'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVOICING_ADMIN]}>
                      <UnpaidOverdueInvoices />
                    </RequirePermission>
                  }
                />
                <Route
                  path='expenses'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EXPENSE_ADMIN]}>
                      <ExpenseApproval />
                    </RequirePermission>
                  }
                />
                <Route
                  path='expenses/:id'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EXPENSE_ADMIN]}>
                      <ExpenseClaimAdminDetail />
                    </RequirePermission>
                  }
                />
                <Route
                  path='mileage-allowances'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EXPENSE_ADMIN]}>
                      <MileageAllowancesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='cost-centres'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EXPENSE_ADMIN]}>
                      <CostCentresPage />
                    </RequirePermission>
                  }
                />
              </Route>
              <Route path='/shop'>
                <Route index element={<ShopPage />} />
                <Route path='products/:id' element={<ProductPage />} />
                <Route path='cart' element={<CartPage />} />
                <Route path='orders' element={<OrdersPage />} />
                <Route path='flight-packages' element={<MyFlightPackagesPage />} />
                <Route path='orders/:orderId' element={<OrderDetailPage />} />
              </Route>
              <Route path='/exams'>
                <Route index element={<ExamsPage />} />
                <Route path=':examId' element={<ExamDetailPage />} />
                <Route path='attempt/:attemptId' element={<ExamAttemptPage />} />
                <Route path='review/:attemptId' element={<ExamReviewPage />} />
                <Route path='history' element={<MyExamHistoryPage />} />
              </Route>
              <Route path='/admin'>
                <Route index element={<Navigate to='outbox' replace />} />
                <Route
                  path='outbox'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.OUTBOX_ADMIN]}>
                      <Outbox />
                    </RequirePermission>
                  }
                />
                <Route
                  path='non-renewals'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.MEMBER_ADMIN]}>
                      <NonRenewals />
                    </RequirePermission>
                  }
                />
                <Route
                  path='notification-banner'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.MEMBER_ADMIN]}>
                      <NotificationBannerAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='shop'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.STORE_ADMIN]}>
                      <ShopAdminDashboard />
                    </RequirePermission>
                  }
                />
                <Route
                  path='shop/products'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.STORE_ADMIN]}>
                      <ProductsAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='shop/categories'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.STORE_ADMIN]}>
                      <CategoriesAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='shop/orders'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.STORE_ADMIN]}>
                      <OrdersAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='shop/orders/:orderId'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.STORE_ADMIN]}>
                      <OrderDetailAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='shop/discount-codes'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.STORE_ADMIN]}>
                      <DiscountCodesAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='shop/flight-packages'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.STORE_ADMIN]}>
                      <FlightPackagesAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='events'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EVENTS_ADMIN]}>
                      <EventsAdmin />
                    </RequirePermission>
                  }
                />
                <Route
                  path='exams'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EXAM_ADMIN]}>
                      <ExamsAdminPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='exams/versions/:versionId'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EXAM_ADMIN]}>
                      <ExamVersionEditorPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='exams/attempts'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.EXAM_ADMIN]}>
                      <AttemptsAdminPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='dto'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.DTO_ADMIN]}>
                      <DtoProgramsAdminPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='dto/syllabi/:syllabusId'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.DTO_ADMIN]}>
                      <DtoSyllabusEditorPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='dto/programs/:programId/import'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.DTO_ADMIN]}>
                      <DtoImportPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='phone-numbers'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.MEMBER_ADMIN]}>
                      <UsefulPhoneNumbersAdminPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='inventory'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.INVENTORY_ADMIN]}>
                      <InventoryAdminPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path='ame'
                  element={
                    <RequirePermission adminModeOnly permissions={[MIKPermissions.AME_ADMIN]}>
                      <AmeAdminList />
                    </RequirePermission>
                  }
                />
              </Route>
              <Route path='/dto'>
                <Route index element={<DtoIndexRedirect />} />
                <Route path='my-training' element={<DtoMyTrainingPage />} />
                <Route path='progress' element={<DtoProgressPage />} />
                <Route path='progress/:memberSyllabusId' element={<DtoStudentDetailPage />} />
                <Route path='verify' element={<DtoVerificationPage />} />
              </Route>
              <Route path='/inventory'>
                <Route index element={<InventoryPage />} />
                <Route path=':id' element={<InventoryItemPage />} />
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
