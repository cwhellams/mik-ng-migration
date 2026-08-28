import { getMemberById } from '../../db/member-queries.ts'
import { db } from '../../db/connection.ts'
import logger from '../../lib/logger.ts'
import { sendEmail, type EmailAttachment } from '../../lib/sendGmail.ts'
import { getInvoice, getInvoicePdf } from './simplbooksApiClient.ts'
import { escapeHtml } from '@mik/contracts/sanitizers'
import { markdownEmailTemplate } from '../../templates/emailTemplate.ts'
import { buildItemsTableHtml, type ItemsTableRow } from '../../templates/itemsTableHtml.ts'
import type { EmailLang } from '../../templates/registry.ts'
import { normaliseEmailLang } from '../../templates/renderEmail.ts'
import {
  generateFinnishBankingBarcode,
  generateBankBarcodeImage,
  formatFinnishReference,
  generateEpcQrCodeData,
  generateEpcQrCodeImage,
} from '../../util/finnishBankingBarcode.ts'
import type { DryRunTask } from './simplbooksDryRun.ts'

export async function sendSimplbooksInvoiceEmail(invoiceId: number, memberId: string) {
  const member = await getMemberById(memberId)

  if (!member) {
    throw new Error(`Member with ID ${memberId} not found`)
  }

  logger.info(`Preparing to send invoice ${invoiceId} email to member ${memberId}`)
  const invoice = await getInvoice(invoiceId)

  if (!invoice.data.Invoice) {
    throw new Error(`Invoice with ID ${invoiceId} not found`)
  }

  let invoicePdfBase64: string
  try {
    invoicePdfBase64 = await getInvoicePdf(invoiceId.toString())

    if (!invoicePdfBase64 || typeof invoicePdfBase64 !== 'string') {
      throw new Error(`Invalid PDF data received for invoice ${invoiceId}`)
    }
  } catch (error: unknown) {
    logger.error(
      `Error fetching PDF for invoice ${invoiceId}: ${error instanceof Error ? error.message : String(error)}`,
    )
    throw new Error(
      `Failed to fetch PDF for invoice ${invoiceId}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  logger.info(`Fetched PDF for invoice ${invoiceId} to be sent to member ${memberId}`)

  const invoiceData = invoice.data.Invoice
  const invoiceRows = invoice.data.Task ?? []
  const totalSum = Number(invoiceData.total_sum) || 0
  const dueDate = typeof invoiceData.due === 'string' ? invoiceData.due : ''
  const rawReference = invoiceData.reference
  const reference = rawReference != null ? String(rawReference).replace(/\s+/g, '') : undefined

  let barcode: string | undefined
  let barcodeImageHtml: string | undefined
  const mikIban = 'FI1080001870592137'
  if (reference && /^\d+$/.test(reference)) {
    try {
      barcode = generateFinnishBankingBarcode(mikIban, totalSum, reference, dueDate)
    } catch (err) {
      logger.warn(
        `Could not generate Finnish banking barcode for invoice ${invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const barcodeCid = `barcode-${invoiceId}@mik.fi`
  let barcodeBuffer: Buffer | undefined
  if (barcode) {
    try {
      barcodeBuffer = await generateBankBarcodeImage(barcode)
      barcodeImageHtml = `<div style="margin: 16px 0; text-align: center;"><img src="cid:${barcodeCid}" alt="Barcode" style="max-width: 100%; height: auto; border: 0;" /></div>`
    } catch (err) {
      logger.warn(
        `Could not generate barcode image for invoice ${invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  let qrCodeImageHtml: string | undefined
  const qrCodeCid = `qrcode-${invoiceId}@mik.fi`
  let qrBuffer: Buffer | undefined
  const mikBeneficiaryName = process.env.MIK_BENEFICIARY_NAME ?? 'Malmin Ilmailukerho ry'
  if (reference && /^\d+$/.test(reference)) {
    try {
      const qrData = generateEpcQrCodeData(
        mikIban,
        totalSum,
        mikBeneficiaryName,
        reference,
        undefined,
        dueDate,
      )
      qrBuffer = await generateEpcQrCodeImage(qrData)
      qrCodeImageHtml = `<div style="margin: 16px 0; text-align: center;"><img src="cid:${qrCodeCid}" alt="QR code" style="width: 200px; height: 200px; border: 0;" /></div>`
    } catch (err) {
      logger.warn(
        `Could not generate EPC QR code for invoice ${invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  let itemsTableHtml: string | undefined
  if (invoiceRows.length > 0) {
    itemsTableHtml = buildItemsTableHtml(invoiceRows.map(taskToItemsTableRow), member.lang)
  }

  const emailVars = {
    invoiceId: invoiceData.id!.toString(),
    firstName: member.firstName,
    amount: totalSum.toFixed(2),
    dueDate,
    reference: reference ? formatFinnishReference(reference) : undefined,
    barcode,
    barcodeImageHtml,
    qrCodeImageHtml,
    itemsTableHtml,
  }

  // Note: Email subject doesn't need HTML escaping as it's plain text in email headers,
  // but we sanitize it for consistency and safety
  const subject = invoiceEmailSubject(member.lang, escapeHtml(emailVars.invoiceId))

  const attachments: EmailAttachment[] = [
    {
      filename: `mik_lasku_${emailVars.invoiceId}.pdf`,
      content: invoicePdfBase64,
      encoding: 'base64' as const,
    },
  ]
  if (barcodeBuffer) {
    attachments.push({
      filename: 'barcode.png',
      content: barcodeBuffer,
      contentType: 'image/png',
      cid: barcodeCid,
      contentDisposition: 'inline',
    })
  }
  if (qrBuffer) {
    attachments.push({
      filename: 'qrcode.png',
      content: qrBuffer,
      contentType: 'image/png',
      cid: qrCodeCid,
      contentDisposition: 'inline',
    })
  }
  await sendEmail(
    member.email,
    subject,
    markdownEmailTemplate(`invoice-created-${normaliseEmailLang(member.lang)}.md`, emailVars),
    attachments,
  )
  logger.info(`Sent invoice ${invoiceId} email to member ${memberId}`)
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

type TaskRow = {
  name?: string | null
  contents?: string | null
  amount?: number | null
  price_per_unit?: number | null
  unit?: string | null
  discount?: number | null
}

/**
 * Subject line per language, mirroring the heading of each language's
 * `invoice-created-*.md`. The invoice id is appended by
 * `invoiceEmailSubject()`.
 *
 * Typed `Record<EmailLang, string>` — the same shape `templates/registry.ts`
 * uses — rather than a `switch` with a `default`, so adding a fourth language
 * to `EmailLang` is a compile error here instead of a silent fall-through to
 * English. That fall-through is exactly how Swedish members ended up with an
 * English subject over a Swedish body.
 */
const INVOICE_SUBJECTS: Record<EmailLang, string> = {
  fi: 'Malmin Ilmailukerhon lasku',
  sv: 'MIK Ny faktura',
  en: 'MIK New Invoice',
}

/**
 * Subject line for the invoice email.
 *
 * This email deliberately sits outside the template registry (it carries PDF
 * and barcode attachments, and has a dry-run variant), so the subject/body
 * language pairing has to be kept in step by hand here — hence the shared
 * `EmailLang` keying above.
 */
export function invoiceEmailSubject(lang: string | undefined, invoiceId: string): string {
  return `${INVOICE_SUBJECTS[normaliseEmailLang(lang)]} - ${invoiceId}`
}

/**
 * An invoice task as the line-item table wants it.
 *
 * SimplBooks applies `discount` as a percentage off the line, which is why the
 * line total is worked out here rather than inside the shared builder — see
 * {@link ItemsTableRow}.
 */
const taskToItemsTableRow = (row: TaskRow): ItemsTableRow => ({
  name: row.name ?? '',
  note: row.contents,
  qty: row.amount,
  unit: row.unit,
  unitPrice: row.price_per_unit,
  lineTotal:
    row.amount != null && row.price_per_unit != null
      ? row.amount * row.price_per_unit * (1 - (row.discount ?? 0) / 100)
      : null,
})

// ─── Dry-run invoice email ─────────────────────────────────────────────────────

/** Marks dry-run mail in the subject line. Exported so tests can assert on it. */
export const DRY_RUN_SUBJECT_TAG = '[DEV DRY RUN]'

/**
 * Sends an invoice email in dry-run mode.
 *
 * Reads invoice metadata from the local DB (accts.invoice) and renders the
 * line-item table from the task data stored in the outbox payload — no
 * SimplBooks API calls are made.  The email is clearly marked [DEV DRY RUN]
 * so test recipients are not confused, and no PDF is attached.
 */
export async function sendDryRunInvoiceEmail(
  invoiceId: number,
  memberId: string,
  tasks: DryRunTask[],
): Promise<void> {
  const member = await getMemberById(memberId)
  if (!member) {
    throw new Error(`Member with ID ${memberId} not found`)
  }

  const localInvoice = await db
    .selectFrom('accts.invoice')
    .selectAll()
    .where('id', '=', String(invoiceId))
    .where('memberId', '=', memberId)
    .executeTakeFirst()

  if (!localInvoice) {
    throw new Error(`Local invoice ${invoiceId} not found for member ${memberId}`)
  }

  const totalSum = Number(localInvoice.totalSum) || 0
  const dueDate = localInvoice.dueAt
  const pmt_ref = localInvoice.pmtRef?.trim()
  const reference = pmt_ref ? pmt_ref.replace(/\s+/g, '') : undefined

  const itemsTableHtml = buildItemsTableHtml(tasks.map(taskToItemsTableRow), member.lang)

  const devNotice =
    `<p style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:10px;font-size:0.85em;color:#856404">` +
    `⚠️ <strong>[DEV DRY RUN]</strong> This email was generated without calling SimplBooks. ` +
    `Invoice ID ${invoiceId} is a synthetic local ID. No real invoice exists in SimplBooks.</p>`

  const emailVars = {
    invoiceId: invoiceId.toString(),
    firstName: member.firstName,
    amount: totalSum.toFixed(2),
    dueDate,
    reference: reference ? formatFinnishReference(reference) : undefined,
    barcode: undefined,
    barcodeImageHtml: undefined,
    qrCodeImageHtml: devNotice,
    itemsTableHtml,
  }

  // One uniform, untranslated tag on purpose. This mail only ever reaches
  // developers running with SIMPLBOOKS_DRY_RUN=true, and `[DEV DRY RUN]` is
  // what the warning banner above, `sendDryRunInvoiceEmail`'s doc comment and
  // copilot-instructions.md all name — so a single greppable, filterable token
  // is worth more here than matching the body's language. (It replaced a
  // Finnish-only `[DEV] … (kuiva ajo)` variant; see the dry-run subject tests.)
  const subject = `${DRY_RUN_SUBJECT_TAG} ${invoiceEmailSubject(member.lang, String(invoiceId))}`

  await sendEmail(
    member.email,
    subject,
    markdownEmailTemplate(`invoice-created-${normaliseEmailLang(member.lang)}.md`, emailVars),
    [],
  )

  logger.info(`[DRY RUN] Sent dry-run invoice email for invoice ${invoiceId} to member ${memberId}`)
}
