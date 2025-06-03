import { TextField, TextFieldProps } from '@mui/material'
import { Control, Controller } from 'react-hook-form'
import { FlightLogUpsertRequest } from '@backend/routes/flight-log/models'
import { useTranslation } from 'react-i18next'

interface Props {
  control: Control<FlightLogUpsertRequest>
  name: keyof FlightLogUpsertRequest
  props: TextFieldProps
}

export const TxtField = ({ name, control, props }: Props) => {
  const { t } = useTranslation()
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          onChange={({ target }) => {
            if (props.type === 'number') {
              field.onChange(target.value ? Number(target.value) : null)
            } else {
              field.onChange(target.value)
            }
          }}
          fullWidth
          label={t(`flightLog.${name}`)}
          error={!!error}
          helperText={error?.message?.toString()}
          {...props}
        />
      )}
    />
  )
}
