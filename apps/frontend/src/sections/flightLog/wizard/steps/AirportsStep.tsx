import { Box, Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Airfields } from '../../../../components/Airfields'
import type { WizardFormProps } from '../types'

// Quick shortcut for the club's home field — most flights land back at EFNU, so a
// single tap beats typing/searching it every time.
const QUICK_ARRIVAL_AIRFIELD = 'EFNU'

export const AirportsStep = ({ control, watch, setValue }: WizardFormProps) => {
  const { t } = useTranslation()
  const arrivalAirport = watch('arrivalAirport')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Airfields
        control={control}
        name='departureAirport'
        label={t('flightLog.departureAirport')}
        required
      />
      <Airfields
        control={control}
        name='arrivalAirport'
        label={t('flightLog.arrivalAirport')}
        required
      />
      <Button
        fullWidth
        variant={arrivalAirport === QUICK_ARRIVAL_AIRFIELD ? 'contained' : 'outlined'}
        onClick={() => setValue('arrivalAirport', QUICK_ARRIVAL_AIRFIELD)}
        sx={{ minHeight: 44 }}
      >
        {t('flightLog.wizard.quickArrival', { airfield: QUICK_ARRIVAL_AIRFIELD })}
      </Button>
    </Box>
  )
}
