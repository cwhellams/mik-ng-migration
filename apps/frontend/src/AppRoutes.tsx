import { Routes, Route, Navigate } from 'react-router'

import Aircrafts from './sections/aircrafts/Aircrafts'
import AmeAdminList from './sections/admin/ame/AmeAdminList'
import AmeList from './sections/ame/AmeList'
import AmeSubmitForm from './sections/ame/AmeSubmitForm'
import AttemptsAdminPage from './sections/admin/exams/AttemptsAdminPage'
import AuthLayout from './layouts/AuthLayout'
import Billing from './sections/billing/Billing'
import CartPage from './sections/shop/CartPage'
import CategoriesAdmin from './sections/admin/shop/CategoriesAdmin'
import Dashboard from './sections/dashboard/Dashboard'
import DiscountCodesAdmin from './sections/admin/shop/DiscountCodesAdmin'
import Documents from './sections/documents/Documents'
import DtoImportPage from './sections/admin/dto/DtoImportPage'
import DtoMyTrainingPage from './sections/dto/DtoMyTrainingPage'
import DtoProgramsAdminPage from './sections/admin/dto/DtoProgramsAdminPage'
import DtoProgressPage from './sections/dto/DtoProgressPage'
import DtoStudentDetailPage from './sections/dto/DtoStudentDetailPage'
import DtoSyllabusEditorPage from './sections/admin/dto/DtoSyllabusEditorPage'
import DtoVerificationPage from './sections/dto/DtoVerificationPage'
import EmailChangeVerify from './sections/members/EmailChangeVerify'
import EventsAdmin from './sections/admin/events/EventsAdmin'
import EventsList from './sections/events/EventsList'
import ExamAttemptPage from './sections/exams/ExamAttemptPage'
import ExamDetailPage from './sections/exams/ExamDetailPage'
import ExamReviewPage from './sections/exams/ExamReviewPage'
import ExamsAdminPage from './sections/admin/exams/ExamsAdminPage'
import ExamsPage from './sections/exams/ExamsPage'
import ExamVersionEditorPage from './sections/admin/exams/ExamVersionEditorPage'
import ExpenseClaimDetail from './sections/expenses/ExpenseClaimDetail'
import ExpenseClaimForm from './sections/expenses/ExpenseClaimForm'
import ExpenseClaimWizard from './sections/expenses/ExpenseClaimWizard'
import ExpensesList from './sections/expenses/ExpensesList'
import FlightLogsList from './sections/flightLog/FlightLogsList'
import FlightPackagesAdmin from './sections/admin/shop/FlightPackagesAdmin'
import FuelPrices from './sections/fuelPrices/FuelPrices'
import InstructorStatus from './sections/members/InstructorStatus'
import InventoryAdminPage from './sections/admin/inventory/InventoryAdminPage'
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
import MeetingsAdminPage from './sections/admin/meetings/MeetingsAdminPage'
import Member from './sections/members/Member'
import MemberChangeLog from './sections/members/MemberChangeLog'
import Members from './sections/members/Members'
import MemberTrash from './sections/members/MemberTrash'
import MyExamHistoryPage from './sections/exams/MyExamHistoryPage'
import MyFlightPackagesPage from './sections/shop/MyFlightPackagesPage'
import NewFlightLogEntry from './sections/flightLog/FlightLogEntry'
import NonRenewals from './sections/admin/NonRenewals'
import NotFound from './sections/error/NotFound'
import NotificationBannerAdmin from './sections/admin/NotificationBannerAdmin'
import OrderDetailAdmin from './sections/admin/shop/OrderDetailAdmin'
import OrderDetailPage from './sections/shop/OrderDetailPage'
import OrdersAdmin from './sections/admin/shop/OrdersAdmin'
import OrdersPage from './sections/shop/OrdersPage'
import Outbox from './sections/admin/Outbox'
import ProductPage from './sections/shop/ProductPage'
import ProductsAdmin from './sections/admin/shop/ProductsAdmin'
import Register from './sections/login/Register'
import RegistrationVerify from './sections/login/RegistrationVerify'
import RequirePermission from './components/RequirePermission'
import Roles from './sections/members/Roles'
import Schedule from './sections/schedule/Schedule'
import ShopAdminDashboard from './sections/admin/shop/ShopAdminDashboard'
import ShopPage from './sections/shop/ShopPage'
import ToolsPage from './sections/accounting/ToolsPage'
import UsefulPhoneNumbersAdminPage from './sections/admin/UsefulPhoneNumbersAdminPage'
import { AccessCodes } from './sections/accessCodes/AccessCodes'
import { CostCentresPage } from './sections/accounting/CostCentresPage'
import { ExpenseApproval } from './sections/accounting/ExpenseApproval'
import { ExpenseClaimAdminDetail } from './sections/accounting/ExpenseClaimAdminDetail'
import { FlightInvoicing } from './sections/accounting/FlightInvoicing'
import { InstructorWorktimeReport } from './sections/accounting/InstructorWorktimeReport'
import { InvoiceItemsPage } from './sections/accounting/InvoiceItems'
import { InvoicingAdminDashboard } from './sections/accounting/Dashboard'
import { MIKPermissions } from '@backend/routes/members/models'
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
          <Route
            path='meetings'
            element={
              <RequirePermission adminModeOnly permissions={[MIKPermissions.MEETING_ADMIN]}>
                <MeetingsAdminPage />
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
  )
}
