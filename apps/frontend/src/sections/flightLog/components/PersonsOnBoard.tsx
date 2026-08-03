import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import { Box, Typography, ToggleButtonGroup, ToggleButton, FormHelperText } from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { formatRequiredFieldError, shouldShowFieldError } from '../../../utils/formErrors'

interface Props {
  control: Control<FlightLogUpsertRequest>
  seats: number
  crew: (string | null)[]
  disabled?: boolean
  required?: boolean
}

export const PersonsOnBoard = ({ control, seats, crew, disabled, required }: Props) => {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)

  // number of crew members (pic not included)
  const crewCount = crew.filter(Boolean).length

  // seats is 0 until an aircraft is selected (or aircraft data is still loading) —
  // no real aircraft has 0 seats, so this reliably signals "no aircraft yet"
  const noAircraftSelected = seats === 0

  return (
    <Controller
      name='personsOnBoard'
      control={control}
      render={({ field, fieldState: { error, isDirty } }) => {
        const isUnset = field.value === undefined || field.value === null
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        return (
          <Box
            sx={{
              m: '',
            }}
          >
            <Typography variant='body2' gutterBottom>
              {t('flightLog.personsOnBoard')}
              {required && (
                <Box component='span' sx={{ color: 'error.main' }}>
                  {' *'}
                </Box>
              )}
            </Typography>
            {noAircraftSelected ? (
              <FormHelperText sx={{ mx: 0, mb: 1 }}>
                {t('flightLog.selectAircraftFirst')}
              </FormHelperText>
            ) : (
              <ToggleButtonGroup
                {...field}
                disabled={disabled}
                value={field.value?.toString() ?? ''}
                exclusive
                onChange={(_, value) => field.onChange(Number(value))}
                aria-label='time format'
                size='small'
                fullWidth
                sx={{
                  mb: 1,
                  ...(isUnset &&
                    !disabled && {
                      '& .MuiToggleButton-root': {
                        borderColor: 'warning.main',
                      },
                    }),
                }}
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
            )}
            {showError && (
              <FormHelperText error>
                {formatRequiredFieldError(error, t('flightLog.error.fieldRequired'))}
              </FormHelperText>
            )}
          </Box>
        )
      }}
    />
  )
}
