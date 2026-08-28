import { describe, expect, it } from '@jest/globals'
import { MIKLang } from '@mik/contracts/members'
import { buildItemsTableHtml, type ItemsTableRow } from '../../src/templates/itemsTableHtml.ts'

// The builder moved here out of services/simplbooks/simplBooksEmailer.ts in
// #1248 so the shop order emails could reuse it. These tests pin the HTML it
// emits; simplBooksEmailer.test.ts is the other half of that safety net, since
// it asserts the invoice email still carries both layouts.

const row = (overrides: Partial<ItemsTableRow> = {}): ItemsTableRow => ({
  name: 'MIK cap, navy',
  qty: 2,
  unitPrice: 25,
  lineTotal: 50,
  ...overrides,
})

describe('buildItemsTableHtml', () => {
  it('returns undefined for an empty row list, so {{#if}} skips the section', () => {
    expect(buildItemsTableHtml([], MIKLang.EN)).toBeUndefined()
  })

  it('renders both a desktop table and a mobile card layout', () => {
    const html = buildItemsTableHtml([row()], MIKLang.EN)!

    expect(html).toMatch(/<table[^>]+class="[^"]*items-table-desktop[^"]*"/)
    expect(html).toMatch(/<div[^>]+class="[^"]*items-table-mobile[^"]*"/)
    // The name appears once per layout
    expect(html.match(/MIK cap, navy/g)).toHaveLength(2)
  })

  it.each([
    [MIKLang.EN, 'Description', 'Qty', 'Unit price', 'Total'],
    [MIKLang.FI, 'Kuvaus', 'Määrä', 'À-hinta', 'Yhteensä'],
    [MIKLang.SV, 'Beskrivning', 'Antal', 'À-pris', 'Totalt'],
  ])('uses the %s column headings', (lang, description, qty, unitPrice, total) => {
    const html = buildItemsTableHtml([row()], lang)!

    expect(html).toContain(description)
    expect(html).toContain(qty)
    expect(html).toContain(unitPrice)
    expect(html).toContain(total)
  })

  it('falls back to English headings for an untranslated language', () => {
    expect(buildItemsTableHtml([row()], 'de')).toContain('Description')
  })

  it('formats prices as € with two decimals', () => {
    const html = buildItemsTableHtml([row({ unitPrice: 7.5, lineTotal: 15 })], MIKLang.EN)!

    expect(html).toContain('€7.50')
    expect(html).toContain('€15.00')
  })

  it('appends the unit to the quantity when there is one', () => {
    expect(buildItemsTableHtml([row({ qty: 3, unit: 'h' })], MIKLang.EN)).toContain('3&nbsp;h')
  })

  it('renders the note as a small grey second line under the name', () => {
    const html = buildItemsTableHtml([row({ note: 'Flight OH-STL 12.08.' })], MIKLang.EN)!

    expect(html).toContain('<br><small style="color:#666">Flight OH-STL 12.08.</small>')
  })

  it('leaves cells blank rather than printing NaN or €undefined', () => {
    const html = buildItemsTableHtml(
      [{ name: 'Membership fee', qty: null, unitPrice: null, lineTotal: null }],
      MIKLang.EN,
    )!

    expect(html).toContain('Membership fee')
    expect(html).not.toContain('€')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })

  it('escapes HTML in the name and the note', () => {
    const html = buildItemsTableHtml(
      [row({ name: '<script>alert(1)</script>', note: '<b>bold</b>' })],
      MIKLang.EN,
    )!

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('lets cells wrap on narrow screens', () => {
    expect(buildItemsTableHtml([row()], MIKLang.EN)).not.toContain('white-space:nowrap')
  })
})
