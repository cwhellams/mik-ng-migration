import { AirfieldListResponse } from '@backend/routes/flight-log/models'
import { Autocomplete, TextField } from '@mui/material'
import {
  Control,
  Controller,
  FieldPath,
  FieldValues,
  GlobalError,
} from 'react-hook-form'
import useApi from '../hooks/useApi'

interface AirfieldsProps<T extends FieldValues> {
  control: Control<T>
  disabled?: boolean
  name: FieldPath<T>
  label: string
  error?: GlobalError
}

export const Airfields = <T extends FieldValues>({
  control,
  disabled,
  name,
  label,
  error,
}: AirfieldsProps<T>) => {
  const { data } = useApi<AirfieldListResponse>(
    {
      url: 'v1/flight-logs/airfields',
    },
    {
      // airfields do not change while adding a flight
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const airfields = data?.airfields ?? []

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value } }) => (
        <Autocomplete
          options={airfields}
          disabled={disabled}
          value={airfields.find((airfield) => airfield.ident === value) ?? null}
          getOptionLabel={(option) => `${option.ident}: ${option.name}`}
          renderInput={(params) => (
            <TextField
              {...params}
              required
              label={label}
              placeholder='ICAO'
              margin='normal'
              slotProps={{
                inputLabel: {
                  shrink: true,
                },
              }}
              error={!!error}
              helperText={error?.message?.toString()}
            />
          )}
          onChange={(_e, airfield) => {
            onChange(airfield?.ident ?? '')
          }}
        />
      )}
    />
  )
}
