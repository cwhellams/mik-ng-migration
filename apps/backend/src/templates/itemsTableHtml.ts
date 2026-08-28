import { escapeHtml } from '@mik/contracts/sanitizers'
import type { EmailLang } from './registry.ts'
import { normaliseEmailLang } from './renderEmail.ts'

/**
 * The responsive line-item table shared by every email that lists what someone
 * is being charged for or has ordered.
 *
 * It lives here rather than in the invoicing service because the CSS it relies
 * on always did: the `.items-table-desktop` / `.items-table-mobile` media
 * queries are in `emailTemplate.ts`, i.e. the base wrapper every markdown email
 * renders through. It was private to `services/simplbooks/simplBooksEmailer.ts`
 * only because the invoice email happened to need it first (#1248).
 *
 * The emitted HTML is unchanged from that original — same inline styles, same
 * class names, same `€x.xx` formatting — so the invoice email's snapshot and
 * layout assertions still hold.
 */

/**
 * One line of the table, in domain-neutral terms.
 *
 * `lineTotal` is the caller's to compute rather than `qty * unitPrice`: an
 * invoice task carries a per-line `discount` percentage that a shop order item
 * has no equivalent for, so the arithmetic belongs with whoever knows the
 * domain.
 */
export interface ItemsTableRow {
  name: string
  /** Small grey second line under the name (an invoice task's `contents`). */
  note?: string | null
  qty?: number | null
  /** Unit of measure printed after the quantity (`h`, `kpl`, …). */
  unit?: string | null
  unitPrice?: number | null
  lineTotal?: number | null
}

/** Line-item table column headings, keyed like the registry's subject table. */
const ITEMS_TABLE_HEADERS: Record<
  EmailLang,
  { description: string; qty: string; unitPrice: string; total: string }
> = {
  fi: { description: 'Kuvaus', qty: 'Määrä', unitPrice: 'À-hinta', total: 'Yhteensä' },
  sv: { description: 'Beskrivning', qty: 'Antal', unitPrice: 'À-pris', total: 'Totalt' },
  en: { description: 'Description', qty: 'Qty', unitPrice: 'Unit price', total: 'Total' },
}

/**
 * Renders `rows` as a desktop table plus a phone-width card fallback.
 *
 * Returns `undefined` for an empty list, so a caller can hand the result
 * straight to a `{{#if itemsTableHtml}}` block.
 *
 * The returned string is already-escaped HTML and must be interpolated with a
 * Handlebars triple-stash.
 */
export function buildItemsTableHtml(rows: ItemsTableRow[], lang: string): string | undefined {
  if (rows.length === 0) return undefined

  const headers = ITEMS_TABLE_HEADERS[normaliseEmailLang(lang)]

  const items = rows.map((row) => {
    const name = escapeHtml(row.name ?? '')
    const contents = row.note ? `<br><small style="color:#666">${escapeHtml(row.note)}</small>` : ''
    const qty = row.qty != null ? String(row.qty) : ''
    const unit = row.unit ? escapeHtml(row.unit) : ''
    const unitPrice = row.unitPrice != null ? Number(row.unitPrice).toFixed(2) : ''
    const lineTotal = row.lineTotal != null ? Number(row.lineTotal).toFixed(2) : ''
    return { name, contents, qty, unit, unitPrice, lineTotal }
  })

  const rowsHtml = items
    .map(
      ({ name, contents, qty, unit, unitPrice, lineTotal }) => `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${name}${contents}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${qty}${unit ? `&nbsp;${unit}` : ''}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${unitPrice ? `€${unitPrice}` : ''}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${lineTotal ? `€${lineTotal}` : ''}</td>
        </tr>`,
    )
    .join('')

  const desktopTable = `<table class="items-table-desktop" style="width:100%;border-collapse:collapse;font-size:0.9em;margin:16px 0">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd">${headers.description}</th>
          <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd">${headers.qty}</th>
          <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd">${headers.unitPrice}</th>
          <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd">${headers.total}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`

  // Card-stacking layout shown only on narrow screens (see .items-table-mobile
  // media query in emailTemplate.ts) — a 4-column table can't reflow legibly
  // on a phone, so each row becomes a labeled block instead.
  const cardsHtml = items
    .map(
      ({
        name,
        contents,
        qty,
        unit,
        unitPrice,
        lineTotal,
      }) => `<div style="padding:10px 0;border-bottom:1px solid #eee">
          <div style="font-weight:bold">${name}${contents}</div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.9em;color:#333">
            <span>${headers.qty}: ${qty}${unit ? `&nbsp;${unit}` : ''}</span>
            <span>${headers.unitPrice}: ${unitPrice ? `€${unitPrice}` : ''}</span>
          </div>
          <div style="text-align:right;font-weight:bold;margin-top:4px">${headers.total}: ${lineTotal ? `€${lineTotal}` : ''}</div>
        </div>`,
    )
    .join('')

  const mobileCards = `<div class="items-table-mobile" style="display:none;margin:16px 0;font-size:0.9em">${cardsHtml}</div>`

  return desktopTable + mobileCards
}
