import {
  Typography,
  Box,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import { useRoles } from '../../hooks/useRoles'
import useApi from '../../hooks/useApi'
import {
  Member,
  MemberListFilters,
  MemberListResponse,
} from '@backend/routes/members/models'
import { Link } from 'react-router-dom'
import { RemoteContent } from '../../components/RemoteContent'
import { AjlbListResponse } from '@backend/routes/ajlb/model'

const Dashboard = () => {
  const roles = useRoles()

  const unapprovedUsersFilter: MemberListFilters = {
    isMembershipApproved: false,
  }

  const {
    data: unapprovedMembers,
    isLoading: isLoadingMembers,
    error: membersError,
  } = useApi<MemberListResponse, Member>({
    url: 'v1/members',
    params: unapprovedUsersFilter,
    skipFetch: !roles.isMembersAdmin,
  })

  // fetch list of aircraft journey log books
  const {
    data: logbooks,
    isLoading: isLoadingLogbooks,
    error: logbooksError,
  } = useApi<AjlbListResponse>(
    {
      url: 'v1/ajlb',
      skipFetch: !roles.isFlightLogAdmin,
    },
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    }
  )

  const logbooksToValidate = logbooks?.books.filter(
    (logbook) => logbook.newFlightsCount > 0
  )

  return (
    <Box>
      <Typography variant='h2' gutterBottom>
        Dashboard
      </Typography>

      {roles.isMembersAdmin && (
        <Card sx={{ mt: 4 }}>
          <CardContent>
            <RemoteContent isLoading={isLoadingMembers} error={membersError}>
              <Typography variant='h5' gutterBottom>
                Pending Member Approvals
              </Typography>

              {unapprovedMembers?.members.length === 0 && (
                <Typography>No members awaiting approval.</Typography>
              )}

              <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                <List>
                  {unapprovedMembers?.members.map((member) => (
                    <ListItem key={member.memberId}>
                      <ListItemText
                        primary={
                          <Link to={`/members/${member.memberId}`}>
                            {member.first} {member.last}
                          </Link>
                        }
                        secondary={member.email}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </RemoteContent>
          </CardContent>
        </Card>
      )}

      {roles.isFlightLogAdmin && (
        <Card sx={{ mt: 4 }}>
          <CardContent>
            <RemoteContent isLoading={isLoadingLogbooks} error={logbooksError}>
              <Typography variant='h5' gutterBottom>
                New Flights to Validate
              </Typography>

              <List>
                {logbooksToValidate?.length === 0 && (
                  <Typography>No new flights to validate.</Typography>
                )}
                {logbooksToValidate?.map((ajlb) => (
                  <ListItem key={`${ajlb.aircraftRegistration}-${ajlb.seqNo}`}>
                    <ListItemText
                      primary={
                        <Link
                          to={`/flight-logs?aircraftRegistration=${ajlb.aircraftRegistration}&ajlbSeqNo=${ajlb.seqNo}&page=${ajlb.newFlightsPage}`}
                        >
                          {ajlb.aircraftRegistration} - {ajlb.seqNo}
                        </Link>
                      }
                      secondary={`${ajlb.newFlightsCount} new flights`}
                    />
                  </ListItem>
                ))}
              </List>
            </RemoteContent>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}

export default Dashboard
