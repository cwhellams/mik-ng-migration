import { Typography, Box } from '@mui/material'
import { useRoles } from '../../hooks/useRoles'
import { FlightLogAdminDashboard } from './components/FlightLogAdminDashboard'
import { MemberAdminDashboard } from './components/MemberAdminDashboard'
import { BookingUserDashboard } from './components/BookingUserDashboard'
import { MIKPermissions } from '@backend/routes/members/models'

const Dashboard = () => {
  const roles = useRoles()

  return (
    <Box>
      <Typography variant='h2' gutterBottom>
        Dashboard
      </Typography>

      {roles.hasAccess(
        MIKPermissions.BOOKING_USER,
        MIKPermissions.BOOKING_ADMIN
      ) && <BookingUserDashboard />}


      {roles.isMembersAdmin && <MemberAdminDashboard />}

      {roles.isFlightLogAdmin && <FlightLogAdminDashboard />}
    </Box>
  )
}

export default Dashboard
