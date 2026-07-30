import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Controller } from 'react-hook-form'
import type { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { FlightType } from '@backend/routes/flight-log/models'
import { ButtonPicker } from '../components/ButtonPicker'
import { flightTypes } from '../../constants'
import type { WizardFormProps } from '../types'

interface Props extends WizardFormProps {
  aircraftData: AircraftListResponse | undefined
}

export const AircraftFlightTypeStep = ({ control, setValue, getValues, aircraftData }: Props) => {
  const { t } = useTranslation()
  const aircrafts = aircraftData?.aircrafts ?? []

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box>
        <Typography variant='subtitle1' gutterBottom>
          {t('flightLog.aircraft')}
        </Typography>
        <Controller
          name='aircraftRegistration'
          control={control}
          render={({ field }) => (
            <ButtonPicker
              columns={3}
              options={aircrafts.map((a) => ({ value: a.registration, label: a.registration }))}
              value={field.value || null}
              onChange={(reg) => {
                field.onChange(reg)
                const plane = aircrafts.find((a) => a.registration === reg)
                if (!getValues('departureAirport') && plane?.status?.lastLandingAirport) {
                  setValue('departureAirport', plane.status.lastLandingAirport)
                }
                if (!getValues('fuelRemainingLitres') && plane?.status?.remainingFuelLitres) {
                  setValue('fuelRemainingLitres', plane.status.remainingFuelLitres)
                }
              }}
            />
          )}
        />
      </Box>
      <Box>
        <Typography variant='subtitle1' gutterBottom>
          {t('flightLog.flightType')}
        </Typography>
        <Controller
          name='flightType'
          control={control}
          render={({ field }) => (
            <ButtonPicker<FlightType>
              columns={2}
              options={flightTypes.map((ft) => ({
                value: ft,
                label: t(`flightLog.flightTypes.${ft}`),
              }))}
              value={field.value || null}
              onChange={field.onChange}
            />
          )}
        />
      </Box>
    </Box>
  )
}
