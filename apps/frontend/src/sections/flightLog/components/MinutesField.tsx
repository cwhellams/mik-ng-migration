import { FormControl, FormHelperText } from '@mui/material'
import { t } from 'i18next'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import { TimeField } from '@mui/x-date-pickers/TimeField'
import { durationToDayjs } from '@mik/ui/utils/duration'

interface MinutesFieldProps {
  name: keyof FlightLogUpsertRequest
  control: Control<FlightLogUpsertRequest>
  disabled?: boolean
}

export const MinutesField = ({ name, control, disabled }: MinutesFieldProps) => {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <FormControl fullWidth error={!!error}>
          <TimeField
            {...field}
            disabled={disabled}
            ampm={false}
            value={
              // convert minutes to dayjs
              durationToDayjs(field.value as number)
            }
            onChange={(time) => {
              // convert dayjs to minutes
              field.onChange(time ? time.hour() * 60 + time.minute() : null)
            }}
            label={t(`flightLog.${name}`)}
            slotProps={{
              textField: {
                margin: 'normal',
              },
            }}
          />
          {error && <FormHelperText>{error.message?.toString()}</FormHelperText>}
        </FormControl>
      )}
    />
  )
}
