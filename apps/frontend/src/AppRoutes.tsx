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
import ItemReservationCalendar from './sections/inventoryReservations/ItemReservationCalendar'
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
import MemberEfficiencyReport from './sections/members/MemberEfficiencyReport'
import Members from './sections/members/Members'
import EditLiquidRecord from './sections/liquid/EditLiquidRecord'
import LiquidReportPage from './sections/liquid/LiquidReportForm'
import LiquidScanPage from './sections/liquid/LiquidScanPage'
import MyLiquidRecords from './sections/liquid/MyLiquidRecords'
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
import Schedule from './sections/schedule/Schedule'
import ShopPage from './sections/shop/ShopPage'
import { AccessCodes } from './sections/accessCodes/AccessCodes'
import { MIKPermissions } from '@mik/contracts/members'
import { OccurrenceEntry } from './sections/occurrences/OccurrenceEntry'
import { Occurrences } from './sections/occurrences/Occurences'
import { Stats } from './sections/stats/Stats'
import { useRoles } from '@mik/ui/hooks/useRoles'

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
          {/* members/roles, members/trash and members/changelog moved to
              apps/admin (#1233). They are caught by the redirect below rather
              than listed here, so the three old URLs still resolve. */}
          <Route path='members/roles' element={<AdminAppRedirect />} />
          <Route path='members/trash' element={<AdminAppRedirect />} />
          <Route path='members/changelog' element={<AdminAppRedirect />} />
          {/* The one route-level gate left in this app after #1233 moved the
              rest to apps/admin. It stays here because both ways in did: the
              summary card on the member's own page, and the drill-down from
              the club-wide efficiency report in Stats. `RequirePermission`
              rather than an ungated page because every word on it is
              members-admin content — see AppRoutes.permissions.test.tsx. */}
          <Route
            path='members/:memberId/efficiency'
            element={
              <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
                <MemberEfficiencyReport />
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
        {/* Ported to apps/admin (#1233), like /admin/* below. Both prefixes are
            kept verbatim over there, so an old bookmark is a prefix swap. */}
        <Route path='/accounting/*' element={<AdminAppRedirect />} />
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
        {/* Ungated at the route, like /schedule: this is a page every member
            may open. Who may *do* anything on it is the API's call, and the nav
            entry carries the permission so it doesn't advertise itself to a
            member without it. */}
        <Route path='/inventory-reservations' element={<ItemReservationCalendar />} />
        {/* Ungated at the route level, like /inventory, /expenses and /exams:
            every liquid endpoint requires liquid.user, and a member without it
            gets the 403 that RemoteContent renders as "no access". A
            RequirePermission here would be the app's only route-level gate on a
            plain user permission — see AppRoutes.permissions.test.tsx. */}
        <Route path='/liquid'>
          <Route index element={<MyLiquidRecords />} />
          <Route path='new' element={<LiquidReportPage />} />
          <Route path=':recordId/edit' element={<EditLiquidRecord />} />
          {/* Where a scanned QR code lands. The page renders whatever the server
              resolved, because only the server knows whether this scanner may
              assign an unused code. */}
          <Route path='scan/:code' element={<LiquidScanPage />} />
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
