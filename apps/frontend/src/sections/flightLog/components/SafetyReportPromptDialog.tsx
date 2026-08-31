import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useTimezone } from '@mik/ui/hooks/useTimezone'

import type { OccurrencePrefill } from '../safetyOccurrence'

type Props = {
  open: boolean
  prefill?: OccurrencePrefill
  onClose: () => void
  onConfirm: () => void
}

/**
 * Asked once a flight log entry carrying a remark, defect or observation is saved
 * (#1225). Repeats the flight it is about — the issue asks for the aircraft, airports
 * and date, since by this point the pilot has already left the entry behind and a
 * bare yes/no would be about nothing they can still see.
 *
 * Dismissing it is a "no": the entry is already saved either way, so the question is
 * only ever about where the pilot goes next.
 */
export const SafetyReportPromptDialog = ({ open, prefill, onClose, onConfirm }: Props) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()

  const route = [prefill?.departureAirport, prefill?.arrivalAirport].filter(Boolean).join(' → ')

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon icon='mdi:shield-alert-outline' width={24} height={24} />
        {t('flightLog.safetyPrompt.title')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{t('flightLog.safetyPrompt.body')}</DialogContentText>
        {prefill && (
          <Stack spacing={0.5} sx={{ mt: 2 }}>
            <Typography variant='body2'>{prefill.aircraftRegistration}</Typography>
            {route && <Typography variant='body2'>{route}</Typography>}
            <Typography variant='body2'>{formatDateTime(prefill.occurrenceDate)}</Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant='outlined'>
          {t('flightLog.safetyPrompt.no')}
        </Button>
        <Button onClick={onConfirm} variant='contained' color='warning' autoFocus>
          {t('flightLog.safetyPrompt.yes')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
