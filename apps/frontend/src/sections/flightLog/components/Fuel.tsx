import { Box, Slider, Typography, useMediaQuery, useTheme } from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import { useTranslation } from 'react-i18next'

interface Props {
  control: Control<FlightLogUpsertRequest>
  usableFuelLitres: number
}

export const Fuel = ({ control, usableFuelLitres }: Props) => {
  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const marks = [
    {
      value: usableFuelLitres * 0.1,
      label: '10%',
    },
    isMd && {
      value: usableFuelLitres * 0.2,
      label: '20%',
    },
    {
      value: usableFuelLitres * 0.3,
      label: '30%',
    },
    isMd && {
      value: usableFuelLitres * 0.4,
      label: '40%',
    },
    {
      value: usableFuelLitres * 0.5,
      label: '50%',
    },
    isMd && {
      value: usableFuelLitres * 0.6,
      label: '60%',
    },
    {
      value: usableFuelLitres * 0.7,
      label: '70%',
    },
    isMd && {
      value: usableFuelLitres * 0.8,
      label: '80%',
    },
    {
      value: usableFuelLitres * 0.9,
      label: '90%',
    },
    isMd && {
      value: usableFuelLitres,
      label: '100%',
    },
  ].filter((m) => !!m)

  const label = (value: number) =>
    `${Math.round(value)}L = ${Math.round(value / 3.785)}USG`

  const { t } = useTranslation()
  return (
    <Controller
      name={'fuelRemainingLitres'}
      control={control}
      render={({ field }) => (
        <Box>
          <Typography variant='body2' gutterBottom mb={4}>
            {t('flightLog.fuelRemainingLitres')}
          </Typography>

          <Slider
            value={field.value ?? 0}
            onChange={(_, value: number | number[]) => {
              field.onChange(value as number)
            }}
            valueLabelFormat={label}
            min={3.785}
            step={3.785}
            max={usableFuelLitres}
            valueLabelDisplay='on'
            marks={marks}
          />
        </Box>
      )}
    />
  )
}
