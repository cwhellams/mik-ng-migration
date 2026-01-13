import { Box } from '@mui/material'
import { useRoles } from '../../hooks/useRoles'
import { FlightLogAdminDashboard } from './components/FlightLogAdminDashboard'
import { MemberAdminDashboard } from './components/MemberAdminDashboard'
import { BookingUserDashboard } from './components/BookingUserDashboard'
import { EquipmentFeeBanner } from './components/EquipmentFeeBanner'
import { OverdueInvoiceBanner } from './components/OverdueInvoiceBanner'
import { ReservationsSuspendedBanner } from './components/ReservationsSuspendedBanner'
import { WeatherWidget } from './components/WeatherWidget'
import { MIKPermissions } from '@backend/routes/members/models'
import { Title } from '../../components/Title'
import { t } from 'i18next'
import { FlightLogUserDashboard } from './components/FlightLogUserDashboard'
import { PendingReviewBanner } from './components/PendingReviewBanner'
import { ProfileUpdateRequiredBanner } from './components/ProfileUpdateRequiredBanner'

const Dashboard = () => {
  const { hasAccess, me } = useRoles()

  const isMember = hasAccess(MIKPermissions.MEMBER)
  const bookingUser = hasAccess(
    MIKPermissions.BOOKING_USER,
    MIKPermissions.BOOKING_ADMIN
  )
  const flyingUser = hasAccess(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN
  )

  return (
    <Box>
      <Title label={t('header.dashboard')} />

      <ProfileUpdateRequiredBanner />

      {isMember && (
        <>
          <ReservationsSuspendedBanner />

          <OverdueInvoiceBanner />

          {flyingUser && <EquipmentFeeBanner />}
        </>
      )}
      {me?.isMembershipApproved === false && <PendingReviewBanner />}

      {bookingUser && <WeatherWidget />}

      {bookingUser && <BookingUserDashboard />}

      {flyingUser && <FlightLogUserDashboard />}

      {hasAccess(MIKPermissions.MEMBER_ADMIN) && <MemberAdminDashboard />}

      {hasAccess(MIKPermissions.FLIGHTLOG_ADMIN) && <FlightLogAdminDashboard />}
    </Box>
  )
}

export default Dashboard
