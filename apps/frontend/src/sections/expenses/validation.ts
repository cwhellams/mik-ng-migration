// Validators for the bank details on an expense claim. Extracted from
// expenseShared.tsx so they can be unit tested without rendering anything —
// both are correctness-critical: a wrong IBAN check means a reimbursement that
// never arrives, and HETU is GDPR-sensitive personal data.

// ─── IBAN validation (MOD-97 algorithm) ──────────────────────────────────────

export function validateIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (iban.length < 15 || iban.length > 34) return false
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const numeric = rearranged
    .split('')
    .map((ch) => (ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch))
    .join('')
  let remainder = 0
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97
  }
  return remainder === 1
}

// ─── HETU validation (Finnish personal identity code checksum) ────────────────

const HETU_CHECK_CHARACTERS = '0123456789ABCDEFHJKLMNPRSTUVWXY'

// DVV added further century markers in 2023, once the original ones ran out for
// people sharing a birth date. Rejecting them locks those members out of mileage
// claims entirely, so all of them are accepted here. Kept in step with the
// backend's own check in `apps/backend/src/util/hetu.ts`.
// https://dvv.fi/en/reform-of-personal-identity-code
const HETU_CENTURY_BASE_YEAR: Record<string, number> = {
  '+': 1800,
  '-': 1900,
  Y: 1900,
  X: 1900,
  W: 1900,
  V: 1900,
  U: 1900,
  A: 2000,
  B: 2000,
  C: 2000,
  D: 2000,
  E: 2000,
  F: 2000,
}

export function validateHetu(raw: string): boolean {
  const hetu = raw.trim().toUpperCase()
  const match = /^(\d{2})(\d{2})(\d{2})([-+YXWVUABCDEF])(\d{3})([0-9A-Z])$/.exec(hetu)
  if (!match) return false
  const [, day, month, yearOfCentury, centurySign, individualNumber, checkChar] = match

  const centuryBase = HETU_CENTURY_BASE_YEAR[centurySign]
  const year = centuryBase + Number(yearOfCentury)
  const date = new Date(year, Number(month) - 1, Number(day))
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  if (!isRealDate) return false

  const digits = Number(`${day}${month}${yearOfCentury}${individualNumber}`)
  return HETU_CHECK_CHARACTERS[digits % 31] === checkChar
}
