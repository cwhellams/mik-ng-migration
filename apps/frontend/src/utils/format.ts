export function formatFinnishPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')

  // If it starts with 358 or 0, format accordingly
  if (digits.startsWith('358')) {
    return digits.replace(/^358(\d{2})(\d{3})(\d{4})$/, '+358 $1 $2 $3')
  } else if (digits.startsWith('0')) {
    return digits.replace(/^0(\d{2})(\d{3})(\d{4})$/, '0$1 $2 $3')
  }

  return phone // fallback
}
