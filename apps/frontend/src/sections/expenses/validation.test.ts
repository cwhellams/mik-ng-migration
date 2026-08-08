import { describe, expect, it } from 'vitest'

import { validateHetu, validateIban } from './validation'

describe('validateIban', () => {
  it.each([
    ['FI21 1234 5600 0007 85', 'the canonical Finnish example'],
    ['FI2112345600000785', 'the same number without spaces'],
    ['fi2112345600000785', 'lowercase'],
    ['  FI21 1234 5600 0007 85  ', 'surrounded by whitespace'],
    ['GB82 WEST 1234 5698 7654 32', 'a UK number with letters in the account part'],
    ['DE89 3704 0044 0532 0130 00', 'a German number'],
  ])('accepts %s (%s)', (iban) => {
    expect(validateIban(iban)).toBe(true)
  })

  it('rejects a number whose MOD-97 check digits are wrong', () => {
    // One digit off the valid FI21… number above.
    expect(validateIban('FI21 1234 5600 0007 86')).toBe(false)
  })

  it('rejects a transposition of the last two digits', () => {
    // The classic typo MOD-97 exists to catch.
    expect(validateIban('FI2112345600000758')).toBe(false)
  })

  it.each([
    ['FI211234', 'shorter than the 15-character minimum'],
    ['FI21123456000078512345678901234567890', 'longer than the 34-character maximum'],
    ['2112345600000785', 'missing the country prefix'],
    ['F121 1234 5600 0007 85', 'a digit where the country code belongs'],
    ['FIXX 1234 5600 0007 85', 'letters where the check digits belong'],
    ['FI21-1234-5600-0007-85', 'separated by dashes rather than spaces'],
    ['', 'empty'],
  ])('rejects %s (%s)', (iban) => {
    expect(validateIban(iban)).toBe(false)
  })

  it('only strips whitespace, not other punctuation', () => {
    // Dashes are a common way to write an IBAN by hand, and they are rejected —
    // the form is expected to accept spaces only.
    expect(validateIban('FI21 1234 5600 0007 85')).toBe(true)
    expect(validateIban('FI21-1234-5600-0007-85')).toBe(false)
  })
})

describe('validateHetu', () => {
  it.each([
    ['131052-308T', '1900s, the canonical DVV example'],
    ['131052+308T', 'the same digits born in the 1800s'],
    ['131002A308W', '2000s'],
    ['  131052-308t  ', 'lowercase and padded — trimmed and upper-cased first'],
  ])('accepts %s (%s)', (hetu) => {
    expect(validateHetu(hetu)).toBe(true)
  })

  it('accepts 29 February in a leap year', () => {
    expect(validateHetu('290200A1239')).toBe(true)
  })

  it('rejects 29 February in a non-leap year', () => {
    // 1900 was not a leap year; 2000 was. Same digits, different century sign.
    expect(validateHetu('290200-1239')).toBe(false)
  })

  it('rejects a wrong check character', () => {
    expect(validateHetu('131052-308U')).toBe(false)
  })

  it.each([
    ['310252-308T', 'a day that does not exist in that month'],
    ['131352-308T', 'month 13'],
    ['001052-308T', 'day 00'],
    ['130052-308T', 'month 00'],
    ['131052/308T', 'an unknown century separator'],
    ['131052-30T', 'too few digits in the individual number'],
    ['131052-308', 'no check character'],
    ['13105-2308T', 'misplaced separator'],
    ['', 'empty'],
  ])('rejects %s (%s)', (hetu) => {
    expect(validateHetu(hetu)).toBe(false)
  })

  it('rejects the century markers introduced by DVV in 2023', () => {
    // Only '+', '-' and 'A' are recognised. Since 2023 the register also issues
    // Y/X/W/V/U (1900s) and B/C/D/E/F (2000s), so a genuine modern HETU using one
    // of those is refused here. '010594Y9021' is a checksum-valid 1994 code.
    expect(validateHetu('010594Y9021')).toBe(false)
    expect(validateHetu('010594-9021')).toBe(true)
  })
})
