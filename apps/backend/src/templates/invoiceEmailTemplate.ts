import { emailTemplate } from './emailTemplate.ts'
import { escapeHtml } from '../util/sanitizers.ts'

export type InvoiceEmailVars = {
  invoiceId: string
  firstName: string
  amount: number
  dueDate: string
}

export const newInvoiceEmailBodyHtmlEn = ({
  invoiceId,
  firstName,
  amount,
  dueDate,
}: InvoiceEmailVars): string =>
  emailTemplate(
    `MIK New Invoice - ${escapeHtml(invoiceId)}`,
    `
      <p>
        Hi ${escapeHtml(firstName)} , You have a new invoice with Id ${escapeHtml(invoiceId)} for € ${escapeHtml(amount.toString())} due on ${escapeHtml(dueDate)}.
      </p>

      <p>
        Please find your invoice attached.
      </p>

`,
  )

export const newInvoiceEmailBodyHtmlFi = ({
  invoiceId,
  firstName,
  amount,
  dueDate,
}: InvoiceEmailVars): string =>
  emailTemplate(
    `Malmin Ilmailukerhon lasku - ${escapeHtml(invoiceId)}`,
    `
      <p>
        Hei ${escapeHtml(firstName)} , Viestin liiteenä on lasku ${escapeHtml(invoiceId)} , summa € ${escapeHtml(amount.toString())}.
        Laskun eräpäivä on ${escapeHtml(dueDate)}.
      </p>

`,
  )
