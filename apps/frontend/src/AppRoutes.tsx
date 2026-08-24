import { Routes, Route, Navigate } from 'react-router'
import AdminAppRedirect from './components/AdminAppRedirect'

import Aircrafts from './sections/aircrafts/Aircrafts'
import AmeEditSuggestionForm from './sections/ame/AmeEditSuggestionForm'
import AmeList from './sections/ame/AmeList'
import AmeSubmitForm from './sections/ame/AmeSubmitForm'
import AuthLayout from './layouts/AuthLayout'
import Billing from './sections/billing/Billing'
import CartPage from './sections/shop/CartPage'
import Dashboard from './sections/dashboard/Dashboard'
import Documents from './sections/documents/Documents'
import DtoMyTrainingPage from './sections/dto/DtoMyTrainingPage'
import DtoProgressPage from './sections/dto/DtoProgressPage'
import DtoStudentDetailPage from './sections/dto/DtoStudentDetailPage'
import DtoVerificationPage from './sections/dto/DtoVerificationPage'
import EmailChangeVerify from './sections/members/EmailChangeVerify'
import EventsList from './sections/events/EventsList'
import ExamAttemptPage from './sections/exams/ExamAttemptPage'
import ExamDetailPage from './sections/exams/ExamDetailPage'
import ExamReviewPage from './sections/exams/ExamReviewPage'
import ExamsPage from './sections/exams/ExamsPage'
import ExpenseClaimDetail from './sections/expenses/ExpenseClaimDetail'
import ExpenseClaimForm from './sections/expenses/ExpenseClaimForm'
import ExpenseClaimWizard from './sections/expenses/ExpenseClaimWizard'
import ExpensesList from './sections/expenses/ExpensesList'
import FlightLogsList from './sections/flightLog/FlightLogsList'
import FuelPrices from './sections/fuelPrices/FuelPrices'
import InstructorStatus from './sections/members/InstructorStatus'
import InventoryItemPage from './sections/inventory/InventoryItemPage'
import InventoryPage from './sections/inventory/InventoryPage'
import LogbookFlights from './sections/flightLog/LogbookPage'
import LogbooksList from './sections/flightLog/LogbooksList'
import Login from './sections/login/Login'
import LoginSent from './sections/login/Sent'
import LoginValidate from './sections/login/Validate'
import LogoutSuccess from './sections/login/LogoutSuccess'
import Mailbox from './sections/mailbox/Mailbox'
import MainLayout from './layouts/MainLayout'
import MassBalance from './sections/massBalance/MassBalance'
import MeetingPage from './sections/meetings/MeetingPage'
import Member from './sections/members/Member'
import MemberChangeLog from './sections/members/MemberChangeLog'
import Members from './sections/members/Members'
import MemberTrash from './sections/members/MemberTrash'
import MyExamHistoryPage from './sections/exams/MyExamHistoryPage'
import MyFlightPackagesPage from './sections/shop/MyFlightPackagesPage'
import NewFlightLogEntry from './sections/flightLog/FlightLogEntry'
import NotFound from './sections/error/NotFound'
import OrderDetailPage from './sections/shop/OrderDetailPage'
import OrdersPage from './sections/shop/OrdersPage'
import ProductPage from './sections/shop/ProductPage'
import Register from './sections/login/Register'
import RegistrationVerify from './sections/login/RegistrationVerify'
import RequirePermission from './components/RequirePermission'
import Roles from './sections/members/Roles'
import Schedule from './sections/schedule/Schedule'
import ShopPage from './sections/shop/ShopPage'
import ToolsPage from './sections/accounting/ToolsPage'
import { AccessCodes } from './sections/accessCodes/AccessCodes'
import { CostCentresPage } from './sections/accounting/CostCentresPage'
import { ExpenseApproval } from './sections/accounting/ExpenseApproval'
import { ExpenseClaimAdminDetail } from './sections/accounting/ExpenseClaimAdminDetail'
import { FlightInvoicing } from './sections/accounting/FlightInvoicing'
import { InstructorWorktimeReport } from './sections/accounting/InstructorWorktimeReport'
import { InvoiceItemsPage } from './sections/accounting/InvoiceItems'
import { InvoicingAdminDashboard } from './sections/accounting/Dashboard'
import { MIKPermissions } from '@mik/contracts/members'
import { MileageAllowancesPage } from './sections/accounting/MileageAllowancesPage'
import { MileageTulorekisteriReport } from './sections/accounting/MileageTulorekisteriReport'
import { OccurrenceEntry } from './sections/occurrences/OccurrenceEntry'
import { Occurrences } from './sections/occurrences/Occurences'
import { Stats } from './sections/stats/Stats'
import { TaxReport } from './sections/accounting/TaxReport'
import { TraficomReport } from './sections/accounting/TraficomReport'
import { UnpaidOverdueInvoices } from './sections/accounting/UnpaidOverdueInvoices'
import { UpliftReport } from './sections/accounting/UpliftReport'
import { useRoles } from './hooks/useRoles'

function DtoIndexRedirect() {
  const { hasAccess } = useRoles()
  const isElevated = hasAccess(MIKPermissions.DTO_INSTRUCTOR) || hasAccess(MIKPermissions.DTO_ADMIN)
  return <Navigate to={isElevated ? 'verify' : 'my-training'} replace />
}

/**
 * The application's route tree.
 *
 * Kept apart from `App` so it can be mounted inside any router — `App` supplies
 * a `BrowserRouter`, while tests mount it in a `MemoryRouter` to visit a given
 * path (see `AppRoutes.permissions.test.tsx`).
 */
export default function AppRoutes() {
  return (
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
            <Route path=':aircraftRegistration/:ajlbSeqNo/:page?' element={<LogbookFlights />} />
          </Route>
          <Route path='occurrences'>
            <Route index element={<Occurrences />} />
            <Route path=':reportId' element={<OccurrenceEntry />} />
          </Route>
        </Route>
        <Route path='/club'>
          <Route index element={<Members />} />
          <Route path='members/roles' element={<Roles />} />
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
          <Route path='ame-list/:id/edit' element={<AmeEditSuggestionForm />} />
          <Route path='meetings' element={<MeetingPage />} />
        </Route>
        <Route path='/profile/email-change/verify' element={<EmailChangeVerify />} />
        <Route path='/mailbox' element={<Mailbox />} />
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
            path='tulorekisteri-report'
            element={
              <RequirePermission adminModeOnly permissions={[MIKPermissions.EXPENSE_HETU_ADMIN]}>
                <MileageTulorekisteriReport />
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
        {/* Ported to apps/admin (#1233). Deep links and bookmarks to the old
            in-app admin pages are redirected to the same path in the admin app,
            rather than 404ing — the sub-paths were kept identical for exactly
            this reason. */}
        <Route path='/admin/*' element={<AdminAppRedirect />} />
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
  )
}
