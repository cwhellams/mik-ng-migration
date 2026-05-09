/**
 * Smoke test script for the SimplBooks createClientNote integration.
 *
 * Usage:
 *   node --experimental-transform-types scripts/smokeTestOverdueInvoiceWorker.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Print what would be called without hitting the real SimplBooks API.
 *
 * Uses fixed test data: member Matti1 (billingId=277), invoiceId=252.
 * Reads configuration from apps/backend/.env (loaded automatically via dotenv/config).
 * Ensure SIMPLBOOKS_BASE_URI, SIMPLBOOKS_API_KEY, and SIMPLBOOKS_COMPANY_ID point at the
 * real SimplBooks environment before running.
 */
import 'dotenv/config'
import { createClientNote } from '../src/services/simplbooks/simplbooksApiClient.ts'

const TEST_CLIENT_ID = 277 // Matti1 billingId
const TEST_INVOICE_ID = 252 // fixed test invoice
const NOTE = 'Test note to simulate overdue reminder sent from mik.intra'

const isDryRun = process.argv.includes('--dry-run')

console.log('=== Overdue Invoice Worker smoke test ===')
console.log(`Mode       : ${isDryRun ? 'DRY RUN (no real API call)' : 'LIVE'}`)
console.log(`SimplBooks : ${process.env.SIMPLBOOKS_BASE_URI}`)
console.log(`Payload    : clientId=${TEST_CLIENT_ID}, invoiceId=${TEST_INVOICE_ID}, note="${NOTE}"`)
console.log()

if (isDryRun) {
  console.log(
    `[dry-run] Would call createClientNote(${TEST_CLIENT_ID}, ${TEST_INVOICE_ID}, "${NOTE}")`,
  )
  console.log('\nDry run complete.')
} else {
  try {
    await createClientNote(TEST_CLIENT_ID, TEST_INVOICE_ID, NOTE)
    console.log('createClientNote succeeded.')
  } catch (err) {
    console.error('createClientNote failed:', err)
    process.exit(1)
  }
}
