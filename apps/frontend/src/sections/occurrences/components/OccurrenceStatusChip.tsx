import { Box, Chip, Stack } from '@mui/material'
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
    case OccurrenceStatus.PROCESSED:
      return 'primary'
    case OccurrenceStatus.RECEIVED:
    case OccurrenceStatus.CLOSED:
      return 'success'
    default:
      return 'default'
  }
}

export const OccurrenceStatusChip = ({ status }: { status: OccurrenceStatus }) => {
  return (
    <Box display='flex' alignItems='center'>
      <Chip label={t(`occurrences.statuses.${status}`)} color={getColor(status)} size='small' />

      {status != OccurrenceStatus.RECEIVED && status != OccurrenceStatus.CLOSED && (
        <Icon icon='mdi:bell-ring' color='red' style={{ marginLeft: '0.5em' }} />
      )}
    </Box>
  )
}

export const OccurrenceStatusFilter = ({
  selected,
  onChange,
}: {
  selected: OccurrenceStatus
  onChange: (status: OccurrenceStatus) => void
}) => {
  return (
    <Stack direction='row' spacing={1} display='inline-flex' flexWrap='wrap' mb={2}>
      {[
        OccurrenceStatus.NEW,
        OccurrenceStatus.ANONYMIZING,
        OccurrenceStatus.ANONYMIZED,
        OccurrenceStatus.PROCESSED,
        OccurrenceStatus.CLOSED,
      ].map((status) => (
        <Chip
          key={status}
          label={t(`occurrences.statuses.${status}`)}
          color={getColor(status)}
          variant={status == selected ? 'filled' : 'outlined'}
          onClick={() => onChange(status)}
          sx={{ cursor: 'pointer', fontWeight: 500 }}
        />
      ))}
    </Stack>
  )
}
