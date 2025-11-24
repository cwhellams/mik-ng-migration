import { useState, useEffect } from 'react'
import { TextField, MenuItem, Box, Grid } from '@mui/material'

interface CountryCode {
  code: string
  country: string
  flag: string
  digits: number
}

const countryCodes: CountryCode[] = [
  { code: '+358', country: 'Finland', flag: '🇫🇮', digits: 9 },
  { code: '+46', country: 'Sweden', flag: '🇸🇪', digits: 9 },
  { code: '+47', country: 'Norway', flag: '🇳🇴', digits: 8 },
  { code: '+45', country: 'Denmark', flag: '🇩🇰', digits: 8 },
  { code: '+372', country: 'Estonia', flag: '🇪🇪', digits: 7 },
  { code: '+371', country: 'Latvia', flag: '🇱🇻', digits: 8 },
  { code: '+370', country: 'Lithuania', flag: '🇱🇹', digits: 8 },
  { code: '+48', country: 'Poland', flag: '🇵🇱', digits: 9 },
  { code: '+31', country: 'Netherlands', flag: '🇳🇱', digits: 9 },
  { code: '+420', country: 'Czech Republic', flag: '🇨🇿', digits: 9 },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸', digits: 10 },
  { code: '+44', country: 'UK', flag: '🇬🇧', digits: 10 },
  { code: '+49', country: 'Germany', flag: '🇩🇪', digits: 10 },
  { code: '+33', country: 'France', flag: '🇫🇷', digits: 9 },
  { code: '+39', country: 'Italy', flag: '🇮🇹', digits: 10 },
  { code: '+34', country: 'Spain', flag: '🇪🇸', digits: 9 },
]

interface PhoneNumberInputProps {
  value: string
  onChange: (value: string) => void
  label: string
  fullWidth?: boolean
  required?: boolean
  error?: boolean
  helperText?: string
}

export const PhoneNumberInput = ({
  value,
  onChange,
  label,
  fullWidth = false,
  required = false,
  error = false,
  helperText,
}: PhoneNumberInputProps) => {
  const [countryCode, setCountryCode] = useState('+358')
  const [phoneNumber, setPhoneNumber] = useState('')

  // Parse incoming value on mount or when value changes externally
  useEffect(() => {
    if (value) {
      // Try to extract country code from the value
      const matchedCountry = countryCodes.find((c) => value.startsWith(c.code))
      if (matchedCountry) {
        setCountryCode(matchedCountry.code)
        setPhoneNumber(value.substring(matchedCountry.code.length))
      } else {
        // If no country code found, treat as local number
        setCountryCode('+358')
        setPhoneNumber(value.startsWith('0') ? value.substring(1) : value)
      }
    } else {
      setPhoneNumber('')
    }
  }, [value])

  const handleCountryCodeChange = (newCode: string) => {
    setCountryCode(newCode)
    // Emit the combined value
    if (phoneNumber) {
      onChange(newCode + phoneNumber)
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
      onChange(countryCode + input)
    } else {
      onChange('')
    }
  }

  // Format the phone number for display
  const formatPhoneNumber = (num: string) => {
    if (!num) return ''

    // Format based on country code
    if (countryCode === '+358' && num.length >= 2) {
      // Finnish format: XX XXX XXXX
      return num.replace(/(\d{2})(\d{0,3})(\d{0,4})/, (_, p1, p2, p3) => {
        let formatted = p1
        if (p2) formatted += ' ' + p2
        if (p3) formatted += ' ' + p3
        return formatted
      })
    } else if (['+46', '+47', '+45'].includes(countryCode) && num.length >= 2) {
      // Nordic format: XX XXX XXX
      return num.replace(/(\d{2})(\d{0,3})(\d{0,3})/, (_, p1, p2, p3) => {
        let formatted = p1
        if (p2) formatted += ' ' + p2
        if (p3) formatted += ' ' + p3
        return formatted
      })
    } else if (num.length >= 3) {
      // Default format: XXX XXX XXXX
      return num.replace(/(\d{3})(\d{0,3})(\d{0,4})/, (_, p1, p2, p3) => {
        let formatted = p1
        if (p2) formatted += ' ' + p2
        if (p3) formatted += ' ' + p3
        return formatted
      })
    }

    return num
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Grid container spacing={1}>
        <Grid size={{ xs: 4, sm: 3 }}>
          <TextField
            select
            fullWidth
            value={countryCode}
            onChange={(e) => handleCountryCodeChange(e.target.value)}
            label='Code'
            size='medium'
          >
            {countryCodes.map((country) => (
              <MenuItem key={country.code} value={country.code}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>{country.flag}</span>
                  <span>{country.code}</span>
                </Box>
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 8, sm: 9 }}>
          <TextField
            fullWidth={fullWidth}
            required={required}
            label={label}
            value={formatPhoneNumber(phoneNumber)}
            onChange={handlePhoneNumberChange}
            error={error}
            helperText={helperText}
            placeholder={
              countryCode === '+358'
                ? '40 123 4567'
                : countryCode === '+1'
                  ? '555 123 4567'
                  : '12 345 6789'
            }
            inputProps={{
              inputMode: 'tel',
            }}
          />
        </Grid>
      </Grid>
    </Box>
  )
}
