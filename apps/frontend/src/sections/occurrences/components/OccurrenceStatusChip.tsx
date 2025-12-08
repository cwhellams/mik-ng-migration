import { Box, Chip } from '@mui/material'
import { OccurrenceStatus } from '@backend/routes/occurrences/models'
import { t } from 'i18next'
import { Icon } from '@iconify/react/dist/iconify.js'

const getColor = (status: OccurrenceStatus) => {
  switch (status) {
    case OccurrenceStatus.NEW:
      return 'warning'
    case OccurrenceStatus.ANONYMIZING:
      return 'secondary'
    case OccurrenceStatus.ANONYMIZED:
      return 'primary'
    case OccurrenceStatus.RECEIVED:
    case OccurrenceStatus.CLOSED:
      return 'success'
    default:
      return 'default'
  }
}

export const OccurrenceStatusChip = ({
  status,
}: {
  status: OccurrenceStatus
}) => {
  return (
    <Box display='flex' alignItems='center'>
      <Chip
        label={t(`occurrences.statuses.${status}`)}
        color={getColor(status)}
        size='small'
      />

      {status != OccurrenceStatus.RECEIVED &&
        status != OccurrenceStatus.CLOSED && (
          <Icon
            icon='mdi:bell-ring'
            color='red'
            style={{ marginLeft: '0.5em' }}
          />
        )}
    </Box>
  )
}
