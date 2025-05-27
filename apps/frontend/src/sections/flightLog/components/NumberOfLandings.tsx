import { Box, TextField, Button, ButtonGroup, Typography } from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogMemberRequest } from '@backend/routes/flight-log/models'
import { useTranslation } from 'react-i18next'

interface Props {
  control: Control<FlightLogMemberRequest>
}

export const NumberOfLandings = ({ control }: Props) => {
  const { t } = useTranslation()
  return (
    <Controller
      name={'numberOfLandings'}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <Box>
          <Typography variant='body2' gutterBottom>
            {t('flightLog.numberOfLandings')}
          </Typography>

          <ButtonGroup sx={{ mb: 3 }}>
            <Button
              value='-'
              fullWidth
              onClick={() => field.onChange(Math.max(1, field.value - 1))}
            >
              -
            </Button>

            <TextField
              {...field}
              value={field.value ?? ''}
              onChange={({ target }) => {
                const parsedValue = Number(target.value)
                field.onChange(Math.max(1, Math.min(50, parsedValue)))
              }}
              margin='none'
              size='small'
              sx={{ input: { textAlign: 'center' } }}
              error={!!error}
              helperText={error?.message?.toString()}
            />

            <Button
              value='+'
              fullWidth
              onClick={() => field.onChange(Math.min(50, field.value + 1))}
            >
              +
            </Button>
          </ButtonGroup>
        </Box>
      )}
    />
  )
}
