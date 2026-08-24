import { formatFullPhoneNumber } from '../data/callingCodes'

// countryCode (ISO 3166-1 alpha-2) is optional — pass it when available (e.g.
// member.phoneCountry) since dial codes alone are ambiguous (e.g. +44 is shared by the
// UK, Guernsey, Isle of Man and Jersey). Without it, the country is guessed from the
// dial code prefix.
export function formatPhoneNumber(phone: string, countryCode?: string | null): string {
  return formatFullPhoneNumber(phone.replace(/[^\d+]/g, ''), countryCode)
}

// Legacy function kept for backward compatibility
export function formatFinnishPhoneNumber(phone: string): string {
  return formatPhoneNumber(phone)
}

export const eurFormatter = new Intl.NumberFormat('fi-FI', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

export const formatHHMM = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : ''
  const absMinutes = Math.abs(minutes)
  const hrs = Math.trunc(absMinutes / 60)
  const mins = absMinutes % 60
  return `${sign}${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

export const formatDecimalHours = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : ''
  const hours = Math.abs(minutes) / 60
  return `${sign}${hours.toFixed(2).replace('.', ',')}`
}
