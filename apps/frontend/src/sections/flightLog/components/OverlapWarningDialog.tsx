import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import type { FlightLogOverlapConflict } from '@backend/routes/flight-log/models'

type Props = {
  open: boolean
  conflicts: FlightLogOverlapConflict[]
  onCancel: () => void
  onConfirm: () => void
}

// Soft warning listing the entries that overlap the times being submitted. The user
// can still submit, in which case the database trigger has the final say.
export const OverlapWarningDialog = ({ open, conflicts, onCancel, onConfirm }: Props) => {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth='sm'>
      <DialogTitle>{t('flightLog.overlapWarningTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('flightLog.overlapWarningBody', {
            registration: conflicts[0]?.aircraftRegistration ?? '',
          })}
        </DialogContentText>
        <Stack spacing={1} sx={{ mt: 2 }}>
          {conflicts.map((conflict) => (
            <Stack
              key={conflict.flightId}
              direction='row'
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <Typography variant='body2'>
                {`${dayjs.utc(conflict.offBlockTimeUtc).format('DD.MM.YYYY HH:mm')} – ${dayjs
                  .utc(conflict.onBlockTimeUtc)
                  .format('HH:mm')} UTC`}
              </Typography>
              <Chip label={conflict.status} size='small' />
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('general.cancel')}</Button>
        <Button variant='contained' color='warning' onClick={onConfirm}>
          {t('flightLog.overlapWarningConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
