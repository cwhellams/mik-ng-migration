import { AirfieldListResponse } from '@mik/contracts/flight-log'
import { Autocomplete, TextField, type TextFieldProps } from '@mui/material'
import useApi from '@mik/ui/hooks/useApi'

interface AirfieldAutocompleteProps {
  value: string
  onChange: (ident: string) => void
  required?: boolean
  disabled?: boolean
  label: string
  error?: boolean
  helperText?: string
  margin?: TextFieldProps['margin']
}

/**
 * The airport picker itself, with no opinion on how its value gets in or out.
 *
 * Pulled out of `Airfields.tsx` (#1119 review finding C4): `LiquidReportForm`
 * needed the same picker but isn't built on react-hook-form, so it had grown
 * its own second copy of this `Autocomplete` rather than reuse the one here,
 * which is wired through a `Controller`. `Airfields` now wraps this with that
 * `Controller`; `LiquidReportForm` drives it directly from plain state.
 */
export const AirfieldAutocomplete = ({
  value,
  onChange,
  required,
  disabled,
  label,
  error,
  helperText,
  margin = 'normal',
}: AirfieldAutocompleteProps) => {
  const { data } = useApi<AirfieldListResponse>(
    {
      url: 'v1/flight-logs/airfields',
    },
    {
      // airfields do not change while filling in a form
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  const airfields = data?.airfields ?? []

  return (
    <Autocomplete
      options={airfields}
      disabled={disabled}
      value={airfields.find((airfield) => airfield.ident === value) ?? null}
      getOptionLabel={(option) => `${option.ident}: ${option.name}`}
      renderInput={(params) => (
        <TextField
          {...params}
          required={required}
          label={label}
          placeholder='ICAO'
          margin={margin}
          slotProps={{
            ...params.slotProps,
            inputLabel: {
              shrink: true,
            },
          }}
          error={error}
          helperText={helperText}
        />
      )}
      onChange={(_e, airfield) => {
        onChange(airfield?.ident ?? '')
      }}
    />
  )
}
