import {
  AirfieldListResponse,
  FlightLogMemberRequest,
} from '@backend/routes/flight-log/models'
import { Autocomplete, TextField } from '@mui/material'
import { t } from 'i18next'
import { Control, Controller, GlobalError } from 'react-hook-form'
import useApi from '../../../hooks/useApi'

interface AirfieldsProps {
  control: Control<FlightLogMemberRequest>
  name: keyof FlightLogMemberRequest
  error?: GlobalError
}

export const Airfields = ({ control, name, error }: AirfieldsProps) => {
  const { data } = useApi<AirfieldListResponse>(
    {
      url: 'v1/flight-logs/airfields',
      params: {
        isMembershipApproved: true,
      },
    },
    {
      // members do not change while adding a flight
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
          value={airfields.find((airfield) => airfield.ident === value) ?? null}
          getOptionLabel={(option) => `${option.ident}: ${option.name}`}
          renderInput={(params) => (
            <TextField
              {...params}
              required
              label={t(`flightLog.${name}`)}
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
