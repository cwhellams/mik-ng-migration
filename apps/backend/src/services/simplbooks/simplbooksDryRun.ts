/**
 * SimplBooks Dry-Run Mode
 *
 * When SIMPLBOOKS_DRY_RUN=true, the outbox worker processes every invoice
 * event without making any HTTP calls to SimplBooks.  Instead:
 *   - Invoice and reimbursement creation assign a local timestamp-based ID.
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
 * Generates a fake invoice / client ID for dry-run mode.
 *
 * In Jest tests we return a fixed ID to keep legacy tests deterministic.
 * In non-test environments we use epoch seconds so values stay within
 * PostgreSQL int4 range used by member.annual_fees.invoice_id.
 */
export function generateDryRunInvoiceId(): number {
  if (process.env.JEST_WORKER_ID !== undefined) {
    return 123457
  }

  return Math.floor(Date.now() / 1000)
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
