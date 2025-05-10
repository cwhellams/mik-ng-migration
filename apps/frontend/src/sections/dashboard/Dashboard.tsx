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

const Dashboard = () => {
  const roles = useRoles()
  const isAdmin = roles.isMembersAdmin

  const unapprovedUsersFilter: MemberListFilters = {
    name: '',
    role: '',
    isMembershipApproved: false,
  }

  const { data, isLoading, error } = useApi<MemberListResponse, Member>(
    {
      url: 'v1/members',
      params: unapprovedUsersFilter,
      skipFetch: !isAdmin,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    }
  )

  return (
    <Box>
      <Typography variant='h2' gutterBottom>
        Dashboard
      </Typography>

      {isAdmin && (
        <Box mt={4}>
          <Card>
            <CardContent>
              <RemoteContent isLoading={isLoading} error={error}>
                <Typography variant='h5' gutterBottom>
                  Pending Member Approvals
                </Typography>
                {data && (
                  <>
                    {data.members.length === 0 ? (
                      <Typography>No members awaiting approval.</Typography>
                    ) : (
                      <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                        <List>
                          {data.members.map((member) => (
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
                    )}
                  </>
                )}
              </RemoteContent>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  )
}

export default Dashboard
