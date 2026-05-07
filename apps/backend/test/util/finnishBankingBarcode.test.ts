import {
  generateFinnishBankingBarcode,
  formatFinnishReference,
  parseIBAN,
  generateEpcQrCodeData,
} from '../../src/util/finnishBankingBarcode.ts'

describe('generateFinnishBankingBarcode', () => {
  // Barcode encoding verified against the Finnish financial industry standard:
  // Bank_bar_code_guide.pdf (English) / Pankkiviivakoodi-opas.pdf (Finnish).
  // Version 4 is used when the payee's account is in IBAN format and the reference
  // is in the Finnish national format (version 5 is for international RF references).
  it('produces the correct 54-character barcode for a known example', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 482.52, '13', '2010-06-12')
    expect(result).toHaveLength(54)
    expect(result).toBe('421101735000001210004825200000000000000000000013100612')
  })

  it('starts with version digit "4"', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 100, '12345', '2025-12-31')
    expect(result[0]).toBe('4')
  })

  it('encodes the IBAN digits in positions 1-16', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 100, '12345', '2025-12-31')
    expect(result.slice(1, 17)).toBe('2110173500000121')
  })

  it('encodes a zero amount as "00000000"', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 0, '1', '2025-01-01')
    expect(result.slice(17, 25)).toBe('00000000')
  })

  it('encodes a whole-euro amount correctly', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 150, '1', '2025-01-01')
    // 150 EUR, 0 cents → "00015000"
    expect(result.slice(17, 25)).toBe('00015000')
  })

  it('encodes a fractional amount correctly', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 150.99, '1', '2025-01-01')
    // 150 EUR, 99 cents → "00015099"
    expect(result.slice(17, 25)).toBe('00015099')
  })

  it('places three reserved zeros at positions 25-27', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 100, '1', '2025-01-01')
    expect(result.slice(25, 28)).toBe('000')
  })

  it('zero-pads the reference number to 20 digits', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 100, '42', '2025-01-01')
    expect(result.slice(28, 48)).toBe('00000000000000000042')
  })

  it('encodes the due date as YYMMDD', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 100, '1', '2025-12-31')
    expect(result.slice(48, 54)).toBe('251231')
  })

  it('uses "000000" when due date is absent', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 100, '1')
    expect(result.slice(48, 54)).toBe('000000')
  })

  it('uses "000000" for the zero date "0000-00-00"', () => {
    const result = generateFinnishBankingBarcode('FI2110173500000121', 100, '1', '0000-00-00')
    expect(result.slice(48, 54)).toBe('000000')
  })

  it('accepts IBAN with spaces', () => {
    const result = generateFinnishBankingBarcode(
      'FI21 1017 3500 0001 21',
      482.52,
      '13',
      '2010-06-12',
    )
    expect(result).toBe('421101735000001210004825200000000000000000000013100612')
  })

  it('throws when IBAN is not a Finnish IBAN', () => {
    expect(() => generateFinnishBankingBarcode('DE89370400440532013000', 100, '1')).toThrow(
      'Invalid Finnish IBAN',
    )
  })

  it('throws when amount is negative', () => {
    expect(() => generateFinnishBankingBarcode('FI2110173500000121', -10, '1')).toThrow(
      'Amount must be non-negative',
    )
  })

  it('throws when reference number is too long', () => {
    expect(() =>
      generateFinnishBankingBarcode('FI2110173500000121', 100, '123456789012345678901'),
    ).toThrow('Reference number too long')
  })

  it('throws when amount is too large', () => {
    expect(() => generateFinnishBankingBarcode('FI2110173500000121', 1_000_000, '1')).toThrow(
      'Amount must be less than 1 000 000',
    )
  })

  it('throws when amount is NaN', () => {
    expect(() => generateFinnishBankingBarcode('FI2110173500000121', NaN, '1')).toThrow(
      'Amount must be a finite number',
    )
  })

  it('throws when reference contains non-digit characters', () => {
    expect(() => generateFinnishBankingBarcode('FI2110173500000121', 100, 'abc123')).toThrow(
      'Reference must contain only digits',
    )
  })
})

describe('formatFinnishReference', () => {
  it('formats a short reference without leading group', () => {
    expect(formatFinnishReference('12345')).toBe('12345')
  })

  it('formats a reference longer than 5 digits with spaces', () => {
    expect(formatFinnishReference('1234567')).toBe('12 34567')
  })

  it('formats a reference exactly 10 digits into two groups', () => {
    expect(formatFinnishReference('1234567890')).toBe('12345 67890')
  })

  it('handles a single-digit reference', () => {
    expect(formatFinnishReference('5')).toBe('5')
  })

  it('handles a 20-digit reference safely', () => {
    expect(formatFinnishReference('12345678901234567890')).toBe('12345 67890 12345 67890')
  })
})

describe('parseIBAN', () => {
  it('accepts a valid Finnish IBAN without spaces', () => {
    expect(parseIBAN('FI2110173500000121')).toBe('FI2110173500000121')
  })

  it('accepts a valid Finnish IBAN with spaces', () => {
    expect(parseIBAN('FI21 1017 3500 0001 21')).toBe('FI2110173500000121')
  })

  it('is case-insensitive', () => {
    expect(parseIBAN('fi2110173500000121')).toBe('FI2110173500000121')
  })

  it('throws for a non-Finnish IBAN', () => {
    expect(() => parseIBAN('DE89370400440532013000')).toThrow('Invalid Finnish IBAN')
  })

  it('throws for an IBAN with wrong number of digits', () => {
    expect(() => parseIBAN('FI211017350000012')).toThrow('Invalid Finnish IBAN')
  })

  it('throws for an IBAN with invalid MOD-97 checksum', () => {
    // Same account number but wrong check digits (correct would be FI21...)
    expect(() => parseIBAN('FI9910173500000121')).toThrow('Invalid Finnish IBAN checksum')
  })
})

describe('generateEpcQrCodeData', () => {
  const iban = 'FI2110173500000121'
  const beneficiary = 'Malmin Ilmailukerho ry'

  it('starts with BCD service tag', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[0]).toBe('BCD')
  })

  it('uses version 002', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[1]).toBe('002')
  })

  it('uses UTF-8 character set (1)', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[2]).toBe('1')
  })

  it('uses SCT identification', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[3]).toBe('SCT')
  })

  it('includes the beneficiary name', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[5]).toBe(beneficiary)
  })

  it('includes the IBAN', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[6]).toBe(iban)
  })

  it('formats the amount as EUR with two decimal places', () => {
    const data = generateEpcQrCodeData(iban, 123.45, beneficiary, '13')
    expect(data.split('\n')[7]).toBe('EUR123.45')
  })

  it('leaves amount blank when zero', () => {
    const data = generateEpcQrCodeData(iban, 0, beneficiary, '13')
    expect(data.split('\n')[7]).toBe('')
  })

  it('places the Finnish reference in the structured remittance field', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[9]).toBe('13')
  })

  it('produces 10 fields when no due date is given', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')).toHaveLength(10)
  })

  it('encodes a due date as ReqdExctnDt on line 12', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13', undefined, '2026-06-30')
    const fields = data.split('\n')
    expect(fields).toHaveLength(12)
    expect(fields[10]).toBe('')
    expect(fields[11]).toBe('ReqdExctnDt/2026-06-30')
  })

  it('omits the due date field when date is absent', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13', undefined, undefined)
    expect(data.split('\n')).toHaveLength(10)
  })

  it('omits the due date field for the zero date 0000-00-00', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13', undefined, '0000-00-00')
    expect(data.split('\n')).toHaveLength(10)
  })

  it('includes an optional BIC', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13', 'NDEAFIHH')
    expect(data.split('\n')[4]).toBe('NDEAFIHH')
  })

  it('leaves BIC field empty when not provided', () => {
    const data = generateEpcQrCodeData(iban, 100, beneficiary, '13')
    expect(data.split('\n')[4]).toBe('')
  })

  it('truncates beneficiary name to 70 characters', () => {
    const longName = 'A'.repeat(80)
    const data = generateEpcQrCodeData(iban, 100, longName, '13')
    expect(data.split('\n')[5]).toHaveLength(70)
  })
})
