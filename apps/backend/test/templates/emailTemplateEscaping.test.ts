import { describe, expect, it } from '@jest/globals'
import { markdownEmailTemplate } from '../../src/templates/emailTemplate.ts'

/**
 * `markdownEmailTemplate` backslash-escapes `[` and `]` in every string
 * variable, so a member-supplied value cannot smuggle markdown link or button
 * syntax past Handlebars' HTML escaping. Pre-rendered HTML is the exception:
 * `marked` passes an HTML block through untouched, so a backslash added there
 * is printed rather than consumed.
 *
 * The exemption is read off the template — a triple-stash is the body's own
 * declaration that the value is HTML we built — so these tests use two real
 * templates rather than a fixture: `notes` is double-stashed in the shop order
 * notification, `itemsTableHtml` is triple-stashed in the same file.
 */

const notificationVars = (overrides: Record<string, unknown> = {}) => ({
  orderId: 'ORD00123',
  memberName: 'Matti Virtanen',
  memberEmail: 'matti@example.com',
  orderedAt: '20.08.2026 12:15',
  itemsTableHtml: undefined,
  totalAmount: '50.00',
  notes: '',
  href: 'https://intra.example.fi/admin/shop/orders/ORD00123',
  ...overrides,
})

describe('markdownEmailTemplate bracket escaping', () => {
  it('does not backslash-escape a variable the body inserts with a triple-stash', () => {
    // A product name with brackets is an ordinary choice: "[Limited] Fleece".
    const table =
      '<table class="items-table-desktop"><tbody><tr><td>MIK cap [Navy]</td></tr></tbody></table>'

    const html = markdownEmailTemplate(
      'shop-order-notification-en.md',
      notificationVars({ itemsTableHtml: table }),
    )

    expect(html).toContain('MIK cap [Navy]')
    expect(html).not.toContain('\\[Navy\\]')
  })

  it('will not build a button out of member-supplied text', () => {
    // The note comes out as the literal text the member typed. `marked`'s
    // autolinker still turns the bare URL into a link, but its text is the URL
    // itself — what must not happen is a styled "Free money" button carrying
    // somebody else's href into the shop inbox.
    const html = markdownEmailTemplate(
      'shop-order-notification-en.md',
      notificationVars({ notes: '[button:Free money](http://evil.example)' }),
    )

    expect(html).toContain('[button:Free money](')
    expect(html).not.toMatch(/<a href="http:\/\/evil\.example"[^>]*>\s*Free money/)
  })

  it('leaves the button the template itself declares intact', () => {
    const html = markdownEmailTemplate('shop-order-notification-en.md', notificationVars())

    expect(html).toContain('href="https://intra.example.fi/admin/shop/orders/ORD00123"')
  })
})
