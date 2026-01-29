import { getMemberById } from '../../db/member-queries.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { getInvoice, getInvoicePdf } from './simplbooksApiClient.ts'
import { escapeHtml } from '../../util/sanitizers.ts'
import { markdownEmailTemplate } from '../../templates/emailTemplate.ts'

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

  const emailVars = {
    invoiceId: invoice.data.Invoice.id!.toString(),
    firstName: member.firstName,
    amount: invoice.data.Invoice.total_sum!.toString(),
    dueDate: invoice.data.Invoice.due!,
  }

  // Note: Email subject doesn't need HTML escaping as it's plain text in email headers,
  // but we sanitize it for consistency and safety
  const subject =
    member.lang === 'fi'
      ? `Malmin Ilmailukerhon lasku - ${escapeHtml(emailVars.invoiceId)}`
      : `MIK New Invoice - ${escapeHtml(emailVars.invoiceId)}`

  const attachments = [
    {
      filename: `mik_lasku_${emailVars.invoiceId}.pdf`,
      content: invoicePdfBase64,
      encoding: 'base64' as const,
    },
  ]
  sendEmail(
    member.email,
    subject,
    markdownEmailTemplate(`invoice-created-${member.lang}.md`, emailVars),
    attachments,
  )
  logger.info(`Sent invoice ${invoiceId} email to member ${memberId}`)
}
