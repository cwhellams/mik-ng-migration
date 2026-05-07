import bwipjs from 'bwip-js'
import QRCode from 'qrcode'

/**
 * Finnish virtual barcode (pankkiviivakoodi) generator.
 *
 * Generates a version-4 barcode string per the Finnish financial industry standard:
 * https://www.finanssiala.fi/wp-content/uploads/2021/03/Bank_bar_code_guide.pdf
 *
 * Version 4 is used when the payee's account is in IBAN format and the reference
 * is in the Finnish national reference format (as opposed to version 5, which uses
 * the international RF reference format).
 *
 * Format (54 characters):
 *   [1]  Version      : "4"
 *   [16] IBAN digits  : Finnish IBAN without the "FI" country-code prefix (16 digits)
 *   [8]  Amount       : 6 euro digits + 2 cent digits, zero-padded, no decimal separator
 *   [3]  Reserved     : "000"
 *   [20] Reference    : Finnish national reference number, right-justified, zero-padded
 *   [6]  Due date     : YYMMDD (or "000000" when no due date)
 */

/**
 * Validates an IBAN string using the ISO 7064 MOD-97 checksum algorithm.
 * Expects the input to already be stripped of whitespace and uppercased.
 */
function validateIBANChecksum(iban: string): boolean {
  // Move first 4 characters (country code + check digits) to the end
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  // Replace each letter with its numeric value (A=10 … Z=35)
  const numeric = rearranged.replace(/[A-Z]/g, ch => (ch.charCodeAt(0) - 55).toString())
  // Process digit-by-digit to avoid integer overflow
  let remainder = 0
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97
  }
  return remainder === 1
}

/**
 * Strips whitespace from an IBAN string, validates the Finnish format
 * (starts with "FI" + exactly 16 digits), and verifies the MOD-97 checksum.
 */
export function parseIBAN(raw: string): string {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (!/^FI\d{16}$/.test(iban)) {
    throw new Error(`Invalid Finnish IBAN: ${raw}`)
  }
  if (!validateIBANChecksum(iban)) {
    throw new Error(`Invalid Finnish IBAN checksum: ${raw}`)
  }
  return iban
}

/**
 * Formats an amount in euros to the 8-character barcode representation:
 * 6 euro digits + 2 cent digits (e.g. 482.52 → "00048252").
 */
function formatAmount(euros: number): string {
  if (!Number.isFinite(euros)) {
    throw new Error(`Amount must be a finite number, got ${euros}`)
  }
  if (euros < 0) {
    throw new Error(`Amount must be non-negative, got ${euros}`)
  }
  if (euros >= 1_000_000) {
    throw new Error(`Amount must be less than 1 000 000 €, got ${euros}`)
  }
  const totalCents = Math.round(euros * 100)
  const euroStr = Math.floor(totalCents / 100)
    .toString()
    .padStart(6, '0')
  const centStr = (totalCents % 100).toString().padStart(2, '0')
  return euroStr + centStr
}

/**
 * Formats a Finnish national reference number to the 20-character barcode
 * representation (right-justified, zero-padded).
 * Accepts a digit string to avoid precision loss with large reference numbers.
 */
function formatReference(reference: string): string {
  if (!/^\d+$/.test(reference)) {
    throw new Error(`Reference must contain only digits, got "${reference}"`)
  }
  if (reference.length > 20) {
    throw new Error(`Reference number too long (max 20 digits): ${reference}`)
  }
  return reference.padStart(20, '0')
}

/**
 * Formats a due date string (YYYY-MM-DD) to the 6-character barcode
 * representation (YYMMDD).  Returns "000000" if the date is absent or invalid.
 */
function formatDueDate(due: string | undefined): string {
  if (!due || due === '0000-00-00') {
    return '000000'
  }
  const match = due.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return '000000'
  }
  const yy = match[1].slice(2)
  return yy + match[2] + match[3]
}

/**
 * Generates a Finnish version-5 virtual barcode string (54 characters).
 *
 * @param iban      - The payee's Finnish IBAN (e.g. "FI21 1234 5600 0007 85")
 * @param amount    - Invoice total in euros (e.g. 482.52)
 * @param reference - Finnish national reference number as a digit string
 * @param dueDate   - Due date in YYYY-MM-DD format (optional)
 * @returns 54-character barcode string
 */
export function generateFinnishBankingBarcode(
  iban: string,
  amount: number,
  reference: string,
  dueDate?: string,
): string {
  const parsedIban = parseIBAN(iban)
  const ibanDigits = parsedIban.slice(2) // Remove "FI" prefix → 16 digits
  const amountStr = formatAmount(amount)
  const refStr = formatReference(reference)
  const dueDateStr = formatDueDate(dueDate)

  return `4${ibanDigits}${amountStr}000${refStr}${dueDateStr}`
}

/**
 * Formats a Finnish reference number for human-readable display,
 * grouping digits in blocks of five from the right (e.g. "1 23456 78901").
 */
export function formatFinnishReference(reference: string): string {
  const digits = reference
  const remainder = digits.length % 5
  const groups: string[] = []
  let start = 0

  if (remainder > 0) {
    groups.push(digits.slice(0, remainder))
    start = remainder
  }

  for (let i = start; i < digits.length; i += 5) {
    groups.push(digits.slice(i, i + 5))
  }

  return groups.join(' ')
}

/**
 * Renders the 54-digit Finnish banking barcode string as a Code 128 Set C
 * barcode image (PNG Buffer).
 *
 * Per section 6 of the Finnish banking bar code standard, the barcode uses
 * USS Code 128 with character set C: every pair of adjacent digits is encoded
 * as a single Code 128 symbol, yielding 27 data symbols for the 54-digit string.
 *
 * @param barcodeString - The 54-character virtual barcode string produced by
 *                        {@link generateFinnishBankingBarcode}
 * @returns PNG image as a Buffer
 */
export async function generateBankBarcodeImage(barcodeString: string): Promise<Buffer> {
  const buf = bwipjs.toBuffer({
    bcid: 'code128',
    text: barcodeString,
    scale: 3,
    height: 10,
    includetext: false,
    paddingwidth: 5,
    paddingheight: 5,
  })
  return buf as Promise<Buffer>
}

/**
 * Generates an EPC QR Code payload string for a SEPA Credit Transfer.
 *
 * Follows the Finnish Finance Finland (Finanssiala) specification, based on
 * EPC069-12. The payload encodes payment details that Finnish banking apps can
 * scan to pre-fill a payment form.
 *
 * Format: up to 12 newline-separated fields:
 *   BCD / version / charset / SCT / BIC / beneficiary name / IBAN / amount /
 *   purpose / structured remittance (Finnish national reference) /
 *   unstructured remittance (empty) / due date (ReqdExctnDt/YYYY-MM-DD)
 *
 * Per the Finanssiala specification, the structured remittance field (line 10)
 * accepts either an ISO 11649 RF reference or a domestic reference number.
 * The due date is encoded in line 12 as the ISO 20022 tag ReqdExctnDt/YYYY-MM-DD.
 *
 * @param iban            - Beneficiary IBAN (Finnish, e.g. "FI1080001870592137")
 * @param amount          - Payment amount in euros (e.g. 123.45); 0 leaves the amount field blank
 * @param beneficiaryName - Name of the payee (max 70 chars)
 * @param reference       - Finnish national reference number (digits only)
 * @param bic             - BIC/SWIFT code of the beneficiary's bank (optional in version 002)
 * @param dueDate         - Due date in YYYY-MM-DD format (optional)
 */
export function generateEpcQrCodeData(
  iban: string,
  amount: number,
  beneficiaryName: string,
  reference: string,
  bic?: string,
  dueDate?: string,
): string {
  const parsedIban = parseIBAN(iban)
  const amountStr = amount > 0 ? `EUR${amount.toFixed(2)}` : ''
  const name = beneficiaryName.slice(0, 70)
  const fields = [
    'BCD', // Service Tag
    '002', // Version
    '1', // Character set: UTF-8
    'SCT', // Identification: SEPA Credit Transfer
    bic ?? '', // BIC of beneficiary's bank (optional in v002)
    name, // Name of beneficiary
    parsedIban, // IBAN of beneficiary
    amountStr, // Amount
    '', // Purpose of credit transfer (optional, empty)
    reference, // Remittance information – structured (Finnish national reference or RF ref)
  ]
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate !== '0000-00-00') {
    fields.push('') // Remittance information – unstructured (empty)
    fields.push(`ReqdExctnDt/${dueDate}`) // Beneficiary-to-originator info: due date
  }
  return fields.join('\n')
}

/**
 * Renders an EPC QR Code payload as a PNG image buffer.
 *
 * @param data - EPC QR Code payload from {@link generateEpcQrCodeData}
 * @returns PNG image as a Buffer
 */
export async function generateEpcQrCodeImage(data: string): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    type: 'png',
    width: 200,
    errorCorrectionLevel: 'M',
  }) as Promise<Buffer>
}
