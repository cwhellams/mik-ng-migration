import { emailTemplate } from './emailTemplate.ts'

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
    `MIK New Invoice - ${invoiceId}`,
    `
      <p>
        Hi ${firstName} , You have a new invoice with Id ${invoiceId} for € ${amount} due on ${dueDate}.
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
    `Malmin Ilmailukerhon lasku - ${invoiceId}`,
    `
      <p>
        Hei ${firstName} , Viestin liiteenä on lasku ${invoiceId} , summa € ${amount}.
        Laskun eräpäivä on ${dueDate}.
      </p>

`,
  )
