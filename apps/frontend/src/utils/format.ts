export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''

  // Remove all non-digit and non-plus characters
  const cleaned = phone.replace(/[^\d+]/g, '')

  // Check if it starts with a country code
  if (cleaned.startsWith('+358')) {
    // Finnish number with country code: +358 XX XXX XXXX
    const digits = cleaned.substring(4)
    if (digits.length >= 2) {
      return cleaned.replace(
        /^\+358(\d{2})(\d{0,3})(\d{0,4})/,
        (_, p1, p2, p3) => {
          let formatted = '+358 ' + p1
          if (p2) formatted += ' ' + p2
          if (p3) formatted += ' ' + p3
          return formatted
        }
      )
    }
    return cleaned
  } else if (
    cleaned.startsWith('+46') ||
    cleaned.startsWith('+47') ||
    cleaned.startsWith('+45')
  ) {
    // Nordic countries: +XX XX XXX XXX
    if (cleaned.length >= 5) {
      return cleaned.replace(
        /^(\+\d{2})(\d{2})(\d{0,3})(\d{0,3})/,
        (_, c, p1, p2, p3) => {
          let formatted = c + ' ' + p1
          if (p2) formatted += ' ' + p2
          if (p3) formatted += ' ' + p3
          return formatted
        }
      )
    }
    return cleaned
  } else if (cleaned.startsWith('+')) {
    // Other international numbers: +XXX XXX XXX XXXX
    return cleaned.replace(
      /^(\+\d{1,3})(\d{0,3})(\d{0,3})(\d{0,4})/,
      (_, c, p1, p2, p3) => {
        let formatted = c
        if (p1) formatted += ' ' + p1
        if (p2) formatted += ' ' + p2
        if (p3) formatted += ' ' + p3
        return formatted
      }
    )
  } else if (cleaned.startsWith('0')) {
    // Legacy Finnish format without country code: 0XX XXX XXXX
    return cleaned.replace(/^0(\d{2})(\d{0,3})(\d{0,4})/, (_, p1, p2, p3) => {
      let formatted = '0' + p1
      if (p2) formatted += ' ' + p2
      if (p3) formatted += ' ' + p3
      return formatted
    })
  }

  return phone
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
