// Finnish personal identity code (henkilötunnus) validation.
//
// Mileage reimbursements are reported to Tulorekisteri (the Finnish income register)
// per person, so a mileage claim is worthless without a HETU that actually identifies
// someone — a typo is only discovered at filing time, long after approval and payment.
// The frontend validates the same way (validateHetu in expenseShared.tsx); this is the
// enforcement, since the API is reachable without it.

const CHECK_CHARACTERS = '0123456789ABCDEFHJKLMNPRSTUVWXY'
const CENTURY_BASE_YEAR: Record<string, number> = { '+': 1800, '-': 1900, A: 2000 }

export function isValidHetu(raw: string | null | undefined): boolean {
  if (!raw) return false
  const hetu = raw.trim().toUpperCase()
  const match = /^(\d{2})(\d{2})(\d{2})([+\-A])(\d{3})([0-9A-Z])$/.exec(hetu)
  if (!match) return false
  const [, day, month, yearOfCentury, centurySign, individualNumber, checkChar] = match

  const year = CENTURY_BASE_YEAR[centurySign] + Number(yearOfCentury)
  const date = new Date(year, Number(month) - 1, Number(day))
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  if (!isRealDate) return false

  return (
    CHECK_CHARACTERS[Number(`${day}${month}${yearOfCentury}${individualNumber}`) % 31] === checkChar
  )
}
