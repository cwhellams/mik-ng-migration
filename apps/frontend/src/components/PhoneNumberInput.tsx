import { useState, useEffect } from 'react'
import { Autocomplete, TextField, Box, Grid } from '@mui/material'
import {
  PHONE_COUNTRIES,
  PHONE_COUNTRIES_BY_DIAL_CODE_LENGTH,
  DEFAULT_PHONE_COUNTRY,
  countryCodeToFlagEmoji,
  formatLocalPhoneNumber,
  type PhoneCountry,
} from '../data/callingCodes'

interface PhoneNumberInputProps {
  value: string
  onChange: (value: string) => void
  // ISO 3166-1 alpha-2 country selected alongside the number. Several dial codes are
  // ambiguous (e.g. +44 is shared by the UK, Guernsey, Isle of Man and Jersey), so this
  // should be persisted rather than re-derived from the number on every load.
  countryCode?: string | null
  onCountryCodeChange?: (code: string) => void
  label: string
  fullWidth?: boolean
  required?: boolean
  error?: boolean
  helperText?: string
}

export const PhoneNumberInput = ({
  value,
  onChange,
  countryCode,
  onCountryCodeChange,
  label,
  fullWidth = false,
  required = false,
  error = false,
  helperText,
}: PhoneNumberInputProps) => {
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY)
  const [phoneNumber, setPhoneNumber] = useState('')

  // Resolve the selected country and the local (non-dial-code) digits whenever the
  // incoming value or stored country code changes.
  useEffect(() => {
    // Prefer the explicitly stored country — it's unambiguous, unlike the dial code alone.
    const storedCountry = countryCode
      ? PHONE_COUNTRIES.find((c) => c.code === countryCode)
      : undefined

    if (!value) {
      setPhoneNumber('')
      if (storedCountry) setCountry(storedCountry)
      return
    }

    if (storedCountry && value.startsWith(storedCountry.dialCode)) {
      setCountry(storedCountry)
      setPhoneNumber(value.substring(storedCountry.dialCode.length))
      return
    }

    // No (usable) stored country — fall back to guessing from the dial code prefix, for
    // numbers saved before this field existed. Longest match first, since dial codes are
    // variable-length and some are prefixes of others, e.g. '+1' vs '+1264'.
    const matchedCountry = PHONE_COUNTRIES_BY_DIAL_CODE_LENGTH.find((c) =>
      value.startsWith(c.dialCode),
    )
    if (matchedCountry) {
      setCountry(matchedCountry)
      setPhoneNumber(value.substring(matchedCountry.dialCode.length))
    } else {
      // If no country code found, treat as local number
      setCountry(DEFAULT_PHONE_COUNTRY)
      setPhoneNumber(value.startsWith('0') ? value.substring(1) : value)
    }
  }, [value, countryCode])

  const handleCountryChange = (newCountry: PhoneCountry) => {
    setCountry(newCountry)
    onCountryCodeChange?.(newCountry.code)
    // Emit the combined value
    if (phoneNumber) {
      onChange(newCountry.dialCode + phoneNumber)
    } else {
      onChange('')
    }
  }

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value

    // Remove all non-digit characters
    input = input.replace(/\D/g, '')

    // Remove leading zero if present (it's redundant with country code)
    if (input.startsWith('0')) {
      input = input.substring(1)
    }

    setPhoneNumber(input)

    // Emit the combined value
    if (input) {
      onChange(country.dialCode + input)
    } else {
      onChange('')
    }
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Grid container spacing={1}>
        <Grid size={{ xs: 5, sm: 4 }}>
          <Autocomplete
            options={PHONE_COUNTRIES}
            value={country}
            disableClearable
            autoHighlight
            isOptionEqualToValue={(option, val) => option.code === val.code}
            getOptionLabel={(option) => option.dialCode}
            filterOptions={(options, state) => {
              const input = state.inputValue.trim().toLowerCase()
              if (!input) return options
              return options.filter(
                (option) =>
                  option.name.toLowerCase().includes(input) ||
                  option.dialCode.includes(input.replace(/^\+/, '+')),
              )
            }}
            renderOption={(props, option) => {
              const { key, ...optionProps } = props
              return (
                <Box
                  component='li'
                  key={key}
                  {...optionProps}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <span>{countryCodeToFlagEmoji(option.code)}</span>
                  <span style={{ flexGrow: 1 }}>{option.name}</span>
                  <span style={{ opacity: 0.7 }}>{option.dialCode}</span>
                </Box>
              )
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label='Code'
                size='medium'
                slotProps={{
                  ...params.slotProps,

                  input: {
                    ...params.slotProps.input,
                    startAdornment: (
                      <Box component='span' sx={{ ml: '2px' }}>
                        {countryCodeToFlagEmoji(country.code)}
                      </Box>
                    ),
                  },
                }}
              />
            )}
            onChange={(_e, newCountry) => newCountry && handleCountryChange(newCountry)}
          />
        </Grid>
        <Grid size={{ xs: 7, sm: 8 }}>
          <TextField
            fullWidth={fullWidth}
            required={required}
            label={label}
            value={formatLocalPhoneNumber(phoneNumber, country)}
            onChange={handlePhoneNumberChange}
            error={error}
            helperText={helperText}
            placeholder={
              country.dialCode === '+358'
                ? '40 123 4567'
                : country.dialCode === '+1'
                  ? '555 123 4567'
                  : '12 345 6789'
            }
            slotProps={{
              htmlInput: {
                inputMode: 'tel',
              },
            }}
          />
        </Grid>
      </Grid>
    </Box>
  )
}
