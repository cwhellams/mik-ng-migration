import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'

import type { LongTaxiLeg } from '../useLongTaxiCheck'

type Props = {
  open: boolean
  longLegs: LongTaxiLeg[]
  onClose: () => void
  onConfirm: () => void
}

/**
 * Soft confirmation listing every taxi leg that looks unusually long, one row per
 * leg.
 *
 * Deliberately not the shared ConfirmDialog (#1250): its `message` is a single
 * string, so the two call sites joined the per-leg sentences with a space and a
 * pilot with both legs long read one run-on paragraph saying "please confirm this
 * is correct" twice. Widening `message` to a ReactNode would push that shape onto
 * the eleven other components using it; a list belongs in a dialog of its own, the
 * same way OverlapWarningDialog next door lists its conflicts. Keeps ConfirmDialog's
 * `info` title colour and icon so the two confirmations on this form don't look
 * like different kinds of thing.
 */
export const LongTaxiWarningDialog = ({ open, longLegs, onClose, onConfirm }: Props) => {
  const { t } = useTranslation()
  const theme = useTheme()

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', gap: 1, color: theme.palette.info.main }}
      >
        <Icon icon='mdi:information' width={24} height={24} />
        {t('flightLog.longTaxi.confirmTitle')}
      </DialogTitle>

      <DialogContent>
        <DialogContentText>{t('flightLog.longTaxi.intro')}</DialogContentText>
        <Stack spacing={1} sx={{ mt: 2 }}>
          {longLegs.map((leg) => (
            <Typography key={leg.leg} variant='body2' sx={{ fontWeight: 'medium' }}>
              {t(leg.leg === 'out' ? 'flightLog.longTaxi.outItem' : 'flightLog.longTaxi.inItem', {
                minutes: leg.minutes,
              })}
            </Typography>
          ))}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant='outlined'>
          {t('general.cancel')}
        </Button>
        <Button onClick={onConfirm} variant='contained' color='info' autoFocus>
          {t('flightLog.longTaxi.confirmButton')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
