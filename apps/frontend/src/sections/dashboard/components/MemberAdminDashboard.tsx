import {
  MemberListFilters,
  MemberListResponse,
  Member,
} from '@backend/routes/members/models'
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import { Box } from '@mui/system'
import { Link } from 'react-router-dom'
import { RemoteContent } from '../../../components/RemoteContent'
import useApi from '../../../hooks/useApi'

export const MemberAdminDashboard = () => {
  const unapprovedUsersFilter: MemberListFilters = {
    showUnapproved: true,
  }

  const { data, isLoading, error } = useApi<MemberListResponse, Member>({
    url: 'v1/members',
    params: unapprovedUsersFilter,
  })

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <RemoteContent isLoading={isLoading} error={error}>
          <Typography variant='h5' gutterBottom>
            Pending Member Approvals
          </Typography>

          {data?.members.length === 0 && (
            <Typography>No members awaiting approval.</Typography>
          )}

          <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
            <List>
              {data?.members.map((member) => (
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
  )
}
