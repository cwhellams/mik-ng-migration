import { getMemberById } from '../../db/member-queries.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import {
  newInvoiceEmailBodyHtmlEn,
  newInvoiceEmailBodyHtmlFi,
} from '../../templates/invoiceEmailTemplate.ts'
import { getInvoice, getInvoicePdf, markInvoiceAsSent } from './simplbooksApiClient.ts'

export async function sendSimplbooksInvoiceEmail(invoiceId: number, memberId: string) {
  const member = await getMemberById(memberId)

  if (!member) {
    throw new Error(`Member with ID ${memberId} not found`)
  }

  const invoice = await getInvoice(invoiceId)

  if (!invoice.data.Invoice) {
    throw new Error(`Invoice with ID ${invoiceId} not found`)
  }

  const invoicePdfBase64 = await getInvoicePdf(invoiceId.toString())

  if (!invoicePdfBase64 || typeof invoicePdfBase64 !== 'string') {
    throw new Error(`Invalid PDF data received for invoice ${invoiceId}`)
  }

  const emailVars = {
    invoiceId: invoice.data.Invoice.id!.toString(),
    firstName: member.firstName,
    amount: invoice.data.Invoice.total_sum!,
    dueDate: invoice.data.Invoice.due!,
  }

  const emailBodyHtml =
    member.lang === 'fi'
      ? newInvoiceEmailBodyHtmlFi(emailVars)
      : newInvoiceEmailBodyHtmlEn(emailVars)

  const subject =
    member.lang === 'fi'
      ? `Malmin Ilmailukerhon lasku - ${emailVars.invoiceId}`
      : `MIK New Invoice - ${emailVars.invoiceId}`

  const attachments = [
    {
      filename: `mik_lasku_${emailVars.invoiceId}.pdf`,
      content: invoicePdfBase64,
      encoding: 'base64' as const,
    },
  ]
  sendEmail(member.email, subject, emailBodyHtml, '', attachments)
  logger.info(`Sent invoice ${invoiceId} email to member ${memberId}`)

  // Mark the invoice as sent in SimplBooks
  await markInvoiceAsSent(invoice.data.Invoice.id!)
  logger.info(`Marked invoice ${invoiceId} as sent in SimplBooks`)
}
