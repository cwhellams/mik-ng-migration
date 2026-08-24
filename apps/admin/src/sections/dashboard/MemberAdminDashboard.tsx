import { MemberListFilters, MemberListResponse, Member } from '@mik/contracts/members'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Box } from '@mui/system'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import useApi from '@mik/ui/hooks/useApi'
import { MemberAppLink } from '../../components/MemberAppLink'
import { useTranslation } from 'react-i18next'
import { endpoints } from '../../api/endpoints'

export const MemberAdminDashboard = () => {
  const { t } = useTranslation()

  // enable sudo mode when navigating to member details

  const unapprovedUsersFilter: MemberListFilters = {
    showUnapproved: true,
  }

  const { data, isLoading, error } = useApi<MemberListResponse, Member>({
    url: endpoints.members.root,
    params: unapprovedUsersFilter,
    alwaysSudo: true,
  })

  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant='h5'>{t('dashboard.pendingMemberApprovals')}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <RemoteContent isLoading={isLoading} error={error}>
          {data?.members.length === 0 && (
            <Typography>{t('dashboard.noMembersAwaitingApproval')}</Typography>
          )}

          <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
            <List>
              {data?.members.map((member) => (
                <ListItem key={member.memberId}>
                  <ListItemText
                    primary={
                      <MemberAppLink to={`/club/members/${member.memberId}`}>
                        {member.first} {member.last}
                      </MemberAppLink>
                    }
                    secondary={member.email}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </RemoteContent>
      </AccordionDetails>
    </Accordion>
  )
}
