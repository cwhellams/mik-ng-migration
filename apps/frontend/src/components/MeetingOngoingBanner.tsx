import { Alert, Button } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import useApi from '../hooks/useApi'
import type { Meeting } from '@backend/routes/meetings/models'

export function MeetingOngoingBanner() {
  const { t } = useTranslation()
  const { data: activeMeeting } = useApi<Meeting | null>(
    { url: 'v1/meetings/active' },
    { refreshInterval: 5000 },
  )

  if (activeMeeting?.status !== 'ONGOING') {
    return null
  }

  return (
    <Alert
      severity='info'
      square
      sx={{ borderRadius: 0 }}
      action={
        <Button
          color='inherit'
          size='small'
          component={RouterLink}
          to='/club/meetings'
          sx={{ whiteSpace: 'nowrap' }}
        >
          {t('meetings.banner.action')}
        </Button>
      }
    >
      {t('meetings.banner.ongoing', { title: activeMeeting.title })}
    </Alert>
  )
}
