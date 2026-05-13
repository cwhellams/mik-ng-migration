/**
 * SimplBooks Dry-Run Mode
 *
 * When SIMPLBOOKS_DRY_RUN=true, the outbox worker processes every invoice
 * event without making any HTTP calls to SimplBooks.  Instead:
 *   - Invoice creation assigns a local timestamp-based ID.
 *   - Invoice emails are sent with full item rows so the generated payload
 *     can be inspected visually.
 *   - Member sync (addMember) assigns a fake billing ID.
 *   - Marking invoices as sent in SimplBooks is skipped.
 *
 * This mode is designed for local development and beta testing.
 * It CANNOT be enabled when APP_ENV=production.
 *
 * .env usage:
 *   SIMPLBOOKS_DRY_RUN=true
 */

import logger from '../../lib/logger.ts'

/**
 * Returns true when dry-run mode is active.
 * Refuses to activate when APP_ENV=production so this can never accidentally
 * be left on in production. The test environment uses NODE_ENV=production for
 * correct cookie security, so APP_ENV is used as the production guard instead.
 */
export function isDryRunEnabled(): boolean {
  const enabled = process.env.SIMPLBOOKS_DRY_RUN === 'true'

  if (enabled && process.env.APP_ENV === 'production') {
    logger.error(
      '[DRY RUN] SIMPLBOOKS_DRY_RUN=true is set but APP_ENV=production — dry-run mode is DISABLED to protect production data.',
    )
    return false
  }

  return enabled
}

/**
 * Generates a unique fake invoice / client ID for dry-run mode.
 *
 * Uses the current timestamp in milliseconds (~1.7 × 10¹²) which:
 *   • Fits in PostgreSQL bigint (Int8) used by accts.invoice.id.
 *   • Is orders of magnitude larger than real SimplBooks IDs (sequential
 *     integers starting at 1), so there is no realistic collision risk.
 *   • Is clearly non-production when you see it in the database.
 *
 * The outbox worker enforces a 1-second delay between tasks, so consecutive
 * calls will always produce distinct values.
 */
export function generateDryRunInvoiceId(): number {
  return Date.now()
}

/**
 * Minimal task shape carried through the SEND_INVOICE_PDF outbox payload in
 * dry-run mode so the email can render the invoice line-item table without
 * calling SimplBooks.  All fields are optional because different invoice
 * creators populate different subsets.
 */
export interface DryRunTask {
  article_id?: number
  name?: string
  contents?: string
  amount?: number
  price_per_unit?: number
  unit?: string
  discount?: number
}
