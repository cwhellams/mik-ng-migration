import { allCountries } from 'country-telephone-data'

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2 code, e.g. 'FI' */
  code: string
  name: string
  /** Dial code including leading '+', e.g. '+358' */
  dialCode: string
  /** National format template from country-telephone-data, e.g. '+... .. .... ....'. Absent for ~20 territories. */
  format?: string
}

/** Converts an ISO 3166-1 alpha-2 code to its flag emoji via Unicode regional indicator symbols. */
export function countryCodeToFlagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return ''
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => 127397 + c.charCodeAt(0)),
  )
}

// country-telephone-data includes the local-script name in parentheses (e.g.
// "Afghanistan (‫افغانستان‬‎)") — strip it for a clean, consistently-Latin display name.
const cleanName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

export const PHONE_COUNTRIES: PhoneCountry[] = allCountries
  .map((country) => ({
    code: country.iso2.toUpperCase(),
    name: cleanName(country.name),
    dialCode: `+${country.dialCode}`,
    format: country.format || undefined,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const DEFAULT_PHONE_COUNTRY: PhoneCountry =
  PHONE_COUNTRIES.find((country) => country.code === 'FI') ?? PHONE_COUNTRIES[0]

// A number of dial codes are shared between a country and one or more dependent
// territories (e.g. +44 is shared by the UK, Guernsey, Isle of Man and Jersey). This only
// matters as a fallback for numbers with no stored country (see PhoneNumberInput) — prefer
// the larger/more common country in each group when guessing.
const PRIMARY_COUNTRY_FOR_SHARED_DIAL_CODE: Record<string, string> = {
  '+358': 'FI', // Finland (Åland Islands / AX also uses +358)
  '+44': 'GB', // United Kingdom (Guernsey / Isle of Man / Jersey also use +44)
  '+1': 'US', // United States (Canada / Dominican Republic / Puerto Rico / US Minor Outlying Islands also use +1)
  '+7': 'RU', // Russia (Kazakhstan also uses +7)
  '+61': 'AU', // Australia (Christmas Island / Cocos (Keeling) Islands also use +61)
  '+47': 'NO', // Norway (Svalbard and Jan Mayen / Bouvet Island also use +47)
  '+39': 'IT', // Italy (Vatican City also uses +39)
  '+64': 'NZ', // New Zealand (Pitcairn Islands also uses +64)
  '+212': 'MA', // Morocco (Western Sahara also uses +212)
  '+590': 'GP', // Guadeloupe (Saint Barthélemy / Saint Martin also use +590)
  '+262': 'RE', // Réunion (Mayotte / French Southern and Antarctic Lands also use +262)
  '+599': 'CW', // Curaçao (Caribbean Netherlands also uses +599)
  '+500': 'FK', // Falkland Islands (South Georgia and the South Sandwich Islands also uses +500)
}

// Longest dial code first, so e.g. '+1264' (Anguilla) is matched before the shorter '+1' (USA/Canada).
// Within a shared dial code, the preferred/primary country (see above) sorts first.
export const PHONE_COUNTRIES_BY_DIAL_CODE_LENGTH = [...PHONE_COUNTRIES].sort((a, b) => {
  if (a.dialCode.length !== b.dialCode.length) return b.dialCode.length - a.dialCode.length
  const preferred = PRIMARY_COUNTRY_FOR_SHARED_DIAL_CODE[a.dialCode]
  if (preferred) {
    if (a.code === preferred) return -1
    if (b.code === preferred) return 1
  }
  return 0
})

// Fallback for the ~20 territories with no format template: group digits in 3s.
const formatGeneric = (digits: string) => digits.replace(/(\d{3})(?=\d)/g, '$1 ')

/**
 * Formats locally-entered digits (dial code excluded — that's a separate field in our UI)
 * using the country's national format template, e.g. '+. (...) ...-....' for the US.
 * Dots in the template are digit placeholders; the leading run of dots matching the dial
 * code length is skipped since the dial code isn't part of `digits`. Literal separators
 * (spaces, dashes, parentheses) are buffered and only emitted once a digit that follows
 * them has actually been typed, so a partially-typed number doesn't trail stray punctuation.
 */
export function formatLocalPhoneNumber(digits: string, country: PhoneCountry): string {
  if (!digits) return ''
  if (!country.format) return formatGeneric(digits)

  const dialCodeDigitCount = country.dialCode.length - 1 // exclude leading '+'
  let dotCount = 0
  let digitIndex = 0
  let literalBuffer = ''
  let result = ''

  for (const ch of country.format) {
    if (digitIndex >= digits.length) break
    if (ch === '+') continue

    if (ch === '.') {
      dotCount++
      if (dotCount <= dialCodeDigitCount) continue
      result += literalBuffer + digits[digitIndex]
      literalBuffer = ''
      digitIndex++
    } else if (dotCount >= dialCodeDigitCount) {
      literalBuffer += ch
    }
  }

  return result.trimStart()
}

/**
 * Formats a full stored phone number (dial code + local digits, e.g. '+447911123456') for
 * display. Prefers the explicitly stored ISO country if given and consistent with the
 * number, falling back to guessing from the dial code prefix otherwise (see
 * PHONE_COUNTRIES_BY_DIAL_CODE_LENGTH for why that guess isn't always unambiguous).
 */
export function formatFullPhoneNumber(phone: string, countryCode?: string | null): string {
  if (!phone) return ''

  if (!phone.startsWith('+')) {
    // Legacy numbers stored without a dial code — assume Finnish local format.
    const digits = phone.startsWith('0') ? phone.slice(1) : phone
    const formatted = formatLocalPhoneNumber(digits, DEFAULT_PHONE_COUNTRY)
    return phone.startsWith('0') ? `0${formatted}` : formatted
  }

  const preferred = countryCode ? PHONE_COUNTRIES.find((c) => c.code === countryCode) : undefined
  const country =
    (preferred && phone.startsWith(preferred.dialCode) ? preferred : undefined) ??
    PHONE_COUNTRIES_BY_DIAL_CODE_LENGTH.find((c) => phone.startsWith(c.dialCode))

  if (!country) return phone

  const localDigits = phone.substring(country.dialCode.length)
  const formattedLocal = formatLocalPhoneNumber(localDigits, country)
  return formattedLocal ? `${country.dialCode} ${formattedLocal}` : country.dialCode
}
