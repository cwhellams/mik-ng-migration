import { emailTemplate } from './emailTemplate.ts'

const BILLING_EMAIL = 'laskutus@mik.fi'

export type OverdueInvoiceEmailVars = {
  firstName: string
  invoiceId: string
  amount: number
  dueDate: string
  currency: string
}

export const overdueInvoiceEmailSubject = (lang: string | undefined): string =>
  lang === 'fi' ? 'MIK - Muistutus erääntyneestä laskusta' : 'MIK - Overdue Invoice Reminder'

export const overdueInvoiceEmailBodyHtmlEn = ({
  firstName,
  invoiceId,
  amount,
  dueDate,
  currency,
}: OverdueInvoiceEmailVars): string =>
  emailTemplate(
    'Overdue Invoice Reminder',
    `
      <p>Dear ${firstName},</p>

      <p>
        This is a reminder that invoice <strong>#${invoiceId}</strong> for <strong>${currency} ${amount.toFixed(2)}</strong> 
        was due on <strong>${dueDate}</strong> and remains unpaid.
      </p>

      <p>
        Please arrange payment at your earliest convenience.
      </p>

      <p style="color: #cc0000; font-weight: bold;">
        ⚠️ Warning: If this invoice remains unpaid, your ability to make aircraft reservations may be suspended.
      </p>

      <p>
        If you have already made payment or believe this notice is in error, please contact us immediately at <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a>
      </p>

      <p>
        Thank you for your prompt attention to this matter.
      </p>
    `,
    'Malmin Ilmailukerho - MIK',
  )

export const overdueInvoiceEmailBodyHtmlFi = ({
  firstName,
  invoiceId,
  amount,
  dueDate,
  currency,
}: OverdueInvoiceEmailVars): string =>
  emailTemplate(
    'Muistutus erääntyneestä laskusta',
    `
      <p>Hyvä ${firstName},</p>

      <p>
        Tämä on muistutus siitä, että lasku <strong>#${invoiceId}</strong> summaltaan <strong>${currency} ${amount.toFixed(2)}</strong> 
        erääntyi <strong>${dueDate}</strong> ja on edelleen maksamatta.
      </p>

      <p>
        Pyydämme sinua suorittamaan maksun mahdollisimman pian.
      </p>

      <p style="color: #cc0000; font-weight: bold;">
        ⚠️ Varoitus: Jos tämä lasku jää maksamatta, mahdollisuutesi varata lentokoneita voidaan jäädyttää.
      </p>

      <p>
        Jos olet jo suorittanut maksun tai uskot tämän muistutuksen olevan virhe, ota meihin yhteyttä välittömästi: <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a>
      </p>

      <p>
        Kiitos huomiostasi tähän asiaan.
      </p>
    `,
    'Malmin Ilmailukerho - MIK',
  )

export const overdueInvoiceEmailPlainTextEn = ({
  firstName,
  invoiceId,
  amount,
  dueDate,
  currency,
}: OverdueInvoiceEmailVars): string => `
Dear ${firstName},

This is a reminder that invoice #${invoiceId} for ${currency} ${amount.toFixed(2)} was due on ${dueDate} and remains unpaid.

Please arrange payment at your earliest convenience.

⚠️ Warning: If this invoice remains unpaid, your ability to make aircraft reservations may be suspended.

If you have already made payment or believe this notice is in error, please contact us immediately at ${BILLING_EMAIL}

Thank you for your prompt attention to this matter.

---
Malmin Ilmailukerho - MIK
`

export const overdueInvoiceEmailPlainTextFi = ({
  firstName,
  invoiceId,
  amount,
  dueDate,
  currency,
}: OverdueInvoiceEmailVars): string => `
Hyvä ${firstName},

Tämä on muistutus siitä, että lasku #${invoiceId} summaltaan ${currency} ${amount.toFixed(2)} erääntyi ${dueDate} ja on edelleen maksamatta.

Pyydämme sinua suorittamaan maksun mahdollisimman pian.

⚠️ Varoitus: Jos tämä lasku jää maksamatta, mahdollisuutesi varata lentokoneita voidaan jäädyttää.

Jos olet jo suorittanut maksun tai uskot tämän muistutuksen olevan virhe, ota meihin yhteyttä välittömästi: ${BILLING_EMAIL}

Kiitos huomiostasi tähän asiaan.

---
Malmin Ilmailukerho - MIK
`
