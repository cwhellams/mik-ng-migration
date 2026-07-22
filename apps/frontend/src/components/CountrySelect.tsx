import { Autocomplete, Box, TextField } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { COUNTRIES, countryCodeToFlagEmoji } from '../data/countries'

interface CountrySelectProps {
  value: string | null | undefined
  onChange: (code: string) => void
  label?: string
  required?: boolean
  fullWidth?: boolean
  margin?: 'none' | 'dense' | 'normal'
}

export const CountrySelect = ({
  value,
  onChange,
  label,
  required,
  fullWidth = true,
  margin = 'none',
}: CountrySelectProps) => {
  const { t } = useTranslation()
  const selected = COUNTRIES.find((country) => country.code === value) ?? null

  return (
    <Autocomplete
      options={COUNTRIES}
      fullWidth={fullWidth}
      value={selected}
      disableClearable={required}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.code === val.code}
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
            <span>{option.name}</span>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label ?? t('member.country')}
          required={required}
          margin={margin}
          slotProps={{
            ...params.slotProps,

            input: {
              ...params.slotProps.input,
              startAdornment: selected ? (
                <Box component='span' sx={{ ml: '2px', mr: '-4px' }}>
                  {countryCodeToFlagEmoji(selected.code)}
                </Box>
              ) : undefined,
            },
          }}
        />
      )}
      onChange={(_e, option) => onChange(option?.code ?? '')}
    />
  )
}
