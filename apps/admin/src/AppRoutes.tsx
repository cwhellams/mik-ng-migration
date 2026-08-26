import { Routes, Route, Navigate } from 'react-router'
import { MIKPermissions } from '@mik/contracts/members'

import AdminLayout from './layouts/AdminLayout'
import AuthLayout from './layouts/AuthLayout'
import RequirePermission from './components/RequirePermission'
import { ALL_ADMIN_PERMISSIONS } from './config/navItems'

import Dashboard from './sections/dashboard/Dashboard'
import Login from './sections/login/Login'
import LoginSent from './sections/login/Sent'
import LoginValidate from './sections/login/Validate'
import LogoutSuccess from './sections/login/LogoutSuccess'
import NotFound from './sections/error/NotFound'

import AmeAdminList from './sections/ame/AmeAdminList'
import AttemptsAdminPage from './sections/exams/AttemptsAdminPage'
import CategoriesAdmin from './sections/shop/CategoriesAdmin'
import DiscountCodesAdmin from './sections/shop/DiscountCodesAdmin'
import DtoImportPage from './sections/dto/DtoImportPage'
import DtoProgramsAdminPage from './sections/dto/DtoProgramsAdminPage'
import DtoSyllabusEditorPage from './sections/dto/DtoSyllabusEditorPage'
import EventsAdmin from './sections/events/EventsAdmin'
import ExamsAdminPage from './sections/exams/ExamsAdminPage'
import ExamVersionEditorPage from './sections/exams/ExamVersionEditorPage'
import FlightPackagesAdmin from './sections/shop/FlightPackagesAdmin'
import InventoryAdminPage from './sections/inventory/InventoryAdminPage'
import MeetingsAdminPage from './sections/meetings/MeetingsAdminPage'
import NonRenewals from './sections/NonRenewals'
import NotificationBannerAdmin from './sections/NotificationBannerAdmin'
import OccurrenceRegistryPage from './sections/occurrences/OccurrenceRegistryPage'
import OrderDetailAdmin from './sections/shop/OrderDetailAdmin'
import OrdersAdmin from './sections/shop/OrdersAdmin'
import Outbox from './sections/Outbox'
import ProductsAdmin from './sections/shop/ProductsAdmin'
import ShopAdminDashboard from './sections/shop/ShopAdminDashboard'
import UsefulPhoneNumbersAdminPage from './sections/UsefulPhoneNumbersAdminPage'

import { CostCentresPage } from './sections/accounting/CostCentresPage'
import { ExpenseApproval } from './sections/accounting/ExpenseApproval'
import { ExpenseClaimAdminDetail } from './sections/accounting/ExpenseClaimAdminDetail'
import { FlightInvoicing } from './sections/accounting/FlightInvoicing'
import { FuelTaxAdmin } from './sections/accounting/FuelTaxAdmin'
import { InstructorWorktimeReport } from './sections/accounting/InstructorWorktimeReport'
import { InvoiceItemsPage } from './sections/accounting/InvoiceItems'
import { InvoicingAdminDashboard } from './sections/accounting/Dashboard'
import { MileageAllowancesPage } from './sections/accounting/MileageAllowancesPage'
import { MileageTulorekisteriReport } from './sections/accounting/MileageTulorekisteriReport'
import { TaxReport } from './sections/accounting/TaxReport'
import ToolsPage from './sections/accounting/ToolsPage'
import { TraficomReport } from './sections/accounting/TraficomReport'
import { UnpaidOverdueInvoices } from './sections/accounting/UnpaidOverdueInvoices'
import { UpliftReport } from './sections/accounting/UpliftReport'

import CommercialFlightTime from './sections/stats/CommercialFlightTime'
import DocumentsAdmin from './sections/documents/DocumentsAdmin'
import FuelPricesAdmin from './sections/fuelPrices/FuelPricesAdmin'
import LiquidRecordsAdmin from './sections/liquid/LiquidRecordsAdmin'
import MemberChangeLog from './sections/members/MemberChangeLog'
import MemberTrash from './sections/members/MemberTrash'
import OilInventoryAdmin from './sections/liquid/OilInventoryAdmin'
import QrCodesAdmin from './sections/liquid/QrCodesAdmin'
import Roles from './sections/members/Roles'

/**
 * Every route is wrapped in `RequirePermission`, which here checks the
 * permission alone — there is no `adminModeOnly` flag as in the member app,
 * because this app has no sudo toggle (#1233, answer 1).
 *
 * The paths deliberately mirror the member app's old `/admin/*` sub-paths
 * (`/admin/shop/orders` → `/shop/orders`), so `AdminAppRedirect` over there can
 * forward an old bookmark with a plain prefix swap rather than a lookup table.
 */
const AppRoutes = () => {
  return (
    <Routes>
      {/* Admin layout — protected routes */}
      <Route element={<AdminLayout />}>
        <Route path='/' element={<Navigate to='/dashboard' replace />} />
        <Route
          path='/dashboard'
          element={
            <RequirePermission permissions={ALL_ADMIN_PERMISSIONS}>
              <Dashboard />
            </RequirePermission>
          }
        />

        <Route
          path='/outbox'
          element={
            <RequirePermission permissions={[MIKPermissions.OUTBOX_ADMIN]}>
              <Outbox />
            </RequirePermission>
          }
        />
        <Route
          path='/non-renewals'
          element={
            <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
              <NonRenewals />
            </RequirePermission>
          }
        />
        <Route
          path='/notification-banner'
          element={
            <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
              <NotificationBannerAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/phone-numbers'
          element={
            <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
              <UsefulPhoneNumbersAdminPage />
            </RequirePermission>
          }
        />

        <Route
          path='/shop'
          element={
            <RequirePermission permissions={[MIKPermissions.STORE_ADMIN]}>
              <ShopAdminDashboard />
            </RequirePermission>
          }
        />
        <Route
          path='/shop/products'
          element={
            <RequirePermission permissions={[MIKPermissions.STORE_ADMIN]}>
              <ProductsAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/shop/categories'
          element={
            <RequirePermission permissions={[MIKPermissions.STORE_ADMIN]}>
              <CategoriesAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/shop/orders'
          element={
            <RequirePermission permissions={[MIKPermissions.STORE_ADMIN]}>
              <OrdersAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/shop/orders/:orderId'
          element={
            <RequirePermission permissions={[MIKPermissions.STORE_ADMIN]}>
              <OrderDetailAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/shop/discount-codes'
          element={
            <RequirePermission permissions={[MIKPermissions.STORE_ADMIN]}>
              <DiscountCodesAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/shop/flight-packages'
          element={
            <RequirePermission permissions={[MIKPermissions.STORE_ADMIN]}>
              <FlightPackagesAdmin />
            </RequirePermission>
          }
        />

        <Route
          path='/events'
          element={
            <RequirePermission permissions={[MIKPermissions.EVENTS_ADMIN]}>
              <EventsAdmin />
            </RequirePermission>
          }
        />

        <Route
          path='/exams'
          element={
            <RequirePermission permissions={[MIKPermissions.EXAM_ADMIN]}>
              <ExamsAdminPage />
            </RequirePermission>
          }
        />
        <Route
          path='/exams/versions/:versionId'
          element={
            <RequirePermission permissions={[MIKPermissions.EXAM_ADMIN]}>
              <ExamVersionEditorPage />
            </RequirePermission>
          }
        />
        <Route
          path='/exams/attempts'
          element={
            <RequirePermission permissions={[MIKPermissions.EXAM_ADMIN]}>
              <AttemptsAdminPage />
            </RequirePermission>
          }
        />

        <Route
          path='/dto'
          element={
            <RequirePermission permissions={[MIKPermissions.DTO_ADMIN]}>
              <DtoProgramsAdminPage />
            </RequirePermission>
          }
        />
        <Route
          path='/dto/syllabi/:syllabusId'
          element={
            <RequirePermission permissions={[MIKPermissions.DTO_ADMIN]}>
              <DtoSyllabusEditorPage />
            </RequirePermission>
          }
        />
        <Route
          path='/dto/programs/:programId/import'
          element={
            <RequirePermission permissions={[MIKPermissions.DTO_ADMIN]}>
              <DtoImportPage />
            </RequirePermission>
          }
        />

        <Route
          path='/inventory'
          element={
            <RequirePermission permissions={[MIKPermissions.INVENTORY_ADMIN]}>
              <InventoryAdminPage />
            </RequirePermission>
          }
        />
        <Route
          path='/ame'
          element={
            <RequirePermission permissions={[MIKPermissions.AME_ADMIN]}>
              <AmeAdminList />
            </RequirePermission>
          }
        />
        <Route
          path='/meetings'
          element={
            <RequirePermission permissions={[MIKPermissions.MEETING_ADMIN]}>
              <MeetingsAdminPage />
            </RequirePermission>
          }
        />

        {/* Accounting. The paths keep the member app's old /accounting/*
            prefix verbatim, so AdminAppRedirect over there is a prefix swap. */}
        <Route
          path='/accounting'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <InvoicingAdminDashboard />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/invoicing'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <FlightInvoicing />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/items'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <InvoiceItemsPage />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/tools'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <ToolsPage />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/tax-report'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <TaxReport />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/traficom-report'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <TraficomReport />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/uplift-report'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <UpliftReport />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/instructor-worktime'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <InstructorWorktimeReport />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/unpaid-overdue'
          element={
            <RequirePermission permissions={[MIKPermissions.INVOICING_ADMIN]}>
              <UnpaidOverdueInvoices />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/expenses'
          element={
            <RequirePermission permissions={[MIKPermissions.EXPENSE_ADMIN]}>
              <ExpenseApproval />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/expenses/:id'
          element={
            <RequirePermission permissions={[MIKPermissions.EXPENSE_ADMIN]}>
              <ExpenseClaimAdminDetail />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/mileage-allowances'
          element={
            <RequirePermission permissions={[MIKPermissions.EXPENSE_ADMIN]}>
              <MileageAllowancesPage />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/fuel-tax'
          element={
            <RequirePermission permissions={[MIKPermissions.EXPENSE_ADMIN]}>
              <FuelTaxAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/tulorekisteri-report'
          element={
            <RequirePermission permissions={[MIKPermissions.EXPENSE_HETU_ADMIN]}>
              <MileageTulorekisteriReport />
            </RequirePermission>
          }
        />
        <Route
          path='/occurrences/registry'
          element={
            <RequirePermission permissions={[MIKPermissions.SMS_MANAGER]}>
              <OccurrenceRegistryPage />
            </RequirePermission>
          }
        />
        <Route
          path='/accounting/cost-centres'
          element={
            <RequirePermission permissions={[MIKPermissions.EXPENSE_ADMIN]}>
              <CostCentresPage />
            </RequirePermission>
          }
        />

        {/* Member administration. Roles and trash were ungated routes in the
            member app, self-gating inside the page instead; here they get a
            route gate like everything else. */}
        <Route
          path='/members/roles'
          element={
            <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
              <Roles />
            </RequirePermission>
          }
        />
        <Route
          path='/members/trash'
          element={
            <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
              <MemberTrash />
            </RequirePermission>
          }
        />
        <Route
          path='/members/changelog'
          element={
            <RequirePermission permissions={[MIKPermissions.MEMBER_ADMIN]}>
              <MemberChangeLog />
            </RequirePermission>
          }
        />

        {/* Split out of member-app pages in #1233: each was an admin branch on
            an otherwise member-facing screen. */}
        <Route
          path='/documents'
          element={
            <RequirePermission permissions={[MIKPermissions.DOCUMENT_ADMIN]}>
              <DocumentsAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/fuel-prices'
          element={
            <RequirePermission
              permissions={[MIKPermissions.FUEL_PRICES_ADMIN, MIKPermissions.FUEL_PRICES_USER]}
            >
              <FuelPricesAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/stats/commercial'
          element={
            <RequirePermission
              permissions={[
                MIKPermissions.FLIGHTLOG_ADMIN,
                MIKPermissions.AIRCRAFT_ADMIN,
                MIKPermissions.INVOICING_ADMIN,
              ]}
            >
              <CommercialFlightTime />
            </RequirePermission>
          }
        />

        {/* Liquid Management System (#1119) — reporting stayed in the member
            app (fuel now, fly later, at the aircraft); the inventory/QR/records
            console is back-office. */}
        <Route
          path='/liquid/records'
          element={
            <RequirePermission permissions={[MIKPermissions.LIQUID_ADMIN]}>
              <LiquidRecordsAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/liquid/oil'
          element={
            <RequirePermission permissions={[MIKPermissions.LIQUID_ADMIN]}>
              <OilInventoryAdmin />
            </RequirePermission>
          }
        />
        <Route
          path='/liquid/qr'
          element={
            <RequirePermission permissions={[MIKPermissions.LIQUID_ADMIN]}>
              <QrCodesAdmin />
            </RequirePermission>
          }
        />
      </Route>

      {/* Auth layout — unauthenticated routes */}
      <Route element={<AuthLayout />}>
        <Route path='/login' element={<Login />} />
        <Route path='/login/sent' element={<LoginSent />} />
        <Route path='/login/validate' element={<LoginValidate />} />
        <Route path='/logout' element={<LogoutSuccess />} />
      </Route>

      {/* Fallback */}
      <Route path='*' element={<NotFound />} />
    </Routes>
  )
}

export default AppRoutes
