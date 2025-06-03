import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  FormHelperText,
} from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

interface Props {
  control: Control<FlightLogUpsertRequest>
  seats: number
  crew: (string | null)[]
}

export const PersonsOnBoard = ({ control, seats, crew }: Props) => {
  const { t } = useTranslation()

  // number of crew members (pic not included)
  const crewCount = crew.filter(Boolean).length

  return (
    <Controller
      name='personsOnBoard'
      control={control}
      render={({ field, fieldState: { error } }) => (
        <Box m=''>
          <Typography variant='body2' gutterBottom>
            {t('flightLog.personsOnBoard')}
          </Typography>
          <ToggleButtonGroup
            {...field}
            value={field.value?.toString() ?? ''}
            exclusive
            onChange={(_, value) => field.onChange(Number(value))}
            aria-label='time format'
            size='small'
            fullWidth
            sx={{ mb: 1 }}
          >
            <ToggleButton value='1' fullWidth disabled={crewCount > 0}>
              1
            </ToggleButton>
            {seats >= 2 && (
              <ToggleButton value='2' fullWidth disabled={crewCount > 1}>
                2
              </ToggleButton>
            )}
            {seats >= 3 && (
              <ToggleButton value='3' fullWidth disabled={crewCount > 2}>
                3
              </ToggleButton>
            )}
            {seats >= 4 && (
              <ToggleButton value='4' fullWidth>
                4
              </ToggleButton>
            )}
          </ToggleButtonGroup>
          {error && (
            <FormHelperText>{error.message?.toString()}</FormHelperText>
          )}
        </Box>
      )}
    />
  )
}
