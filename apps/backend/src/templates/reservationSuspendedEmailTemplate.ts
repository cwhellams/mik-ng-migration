import { emailTemplate } from './emailTemplate.ts'

export const BILLING_EMAIL = 'laskutus@mik.fi'

export interface ReservationSuspendedEmailVars {
  firstName: string
  invoiceCount: number
  totalAmount: number
  currency: string
  cancelledBookingsCount: number
}

export function reservationSuspendedEmailSubject(lang: string): string {
  switch (lang) {
    case 'fi':
      return 'Lentokoneen varausoikeus keskeytetty - Aircraft Reservation Privileges Suspended'
    case 'sv':
      return 'Flygplansreservationsrättigheter har upphävts - Aircraft Reservation Privileges Suspended'
    default:
      return 'Aircraft Reservation Privileges Suspended'
  }
}

// English HTML template
export function reservationSuspendedEmailBodyHtmlEn(vars: ReservationSuspendedEmailVars): string {
  const cancelledMessage =
    vars.cancelledBookingsCount > 0
      ? `<li><strong>${vars.cancelledBookingsCount} existing reservation(s) have been cancelled</strong></li>`
      : '<li>You have no existing reservations affected</li>'

  const content = `
    <h2 style="color: #d32f2f;">Aircraft Reservation Privileges Suspended</h2>
    
    <p>Dear ${vars.firstName},</p>
    
    <p>Your ability to make aircraft reservations has been <strong>suspended</strong> due to unpaid flight invoices.</p>
    
    <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Outstanding Flight Invoices:</strong></p>
      <p style="margin: 5px 0 0 0;">Count: <strong>${vars.invoiceCount}</strong></p>
      <p style="margin: 5px 0 0 0;">Total Amount: <strong>${vars.currency} ${vars.totalAmount.toFixed(2)}</strong></p>
    </div>
    
    <p><strong>What this means:</strong></p>
    <ul>
      <li>You cannot make new aircraft reservations until all overdue flight invoices are paid</li>
      ${cancelledMessage}
      <li>This suspension only affects flight booking privileges</li>
      <li>Your reservation privileges will be automatically restored once all flight invoices are paid</li>
    </ul>
    
    <p><strong>Action Required:</strong></p>
    <p>Please pay all overdue flight invoices immediately. You can view and pay your invoices by logging into the MIK Intranet.</p>
    
    <p style="margin: 20px 0;">
      <a href="${process.env.FRONTEND_URL}/club/billing" 
         style="background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        View My Invoices
      </a>
    </p>
    
    <p>If you have questions about your invoices or need payment assistance, please contact our billing department:</p>
    <p><a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a></p>
    
    <p>Thank you for your prompt attention to this matter.</p>
    
    <p>Best regards,<br>
    MIK ry</p>
  `

  return emailTemplate('Aircraft Reservation Privileges Suspended', content)
}

// Finnish HTML template
export function reservationSuspendedEmailBodyHtmlFi(vars: ReservationSuspendedEmailVars): string {
  const cancelledMessage =
    vars.cancelledBookingsCount > 0
      ? `<li><strong>${vars.cancelledBookingsCount} olemassa oleva(a) varausta on peruutettu</strong></li>`
      : '<li>Sinulla ei ole olemassa olevia varauksia, joihin tämä vaikuttaisi</li>'

  const content = `
    <h2 style="color: #d32f2f;">Lentokoneen varausoikeus keskeytetty</h2>
    
    <p>Hyvä ${vars.firstName},</p>
    
    <p>Kykysi tehdä lentokoneen varauksia on <strong>keskeytetty</strong> maksamattomien lentolaskujen vuoksi.</p>
    
    <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Maksamattomat lentolaskut:</strong></p>
      <p style="margin: 5px 0 0 0;">Määrä: <strong>${vars.invoiceCount}</strong></p>
      <p style="margin: 5px 0 0 0;">Kokonaissumma: <strong>${vars.currency} ${vars.totalAmount.toFixed(2)}</strong></p>
    </div>
    
    <p><strong>Mitä tämä tarkoittaa:</strong></p>
    <ul>
      <li>Et voi tehdä uusia lentokoneen varauksia ennen kuin kaikki erääntyneet lentolaskut on maksettu</li>
      ${cancelledMessage}
      <li>Tämä keskeytys koskee vain lentokoneen varausoikeuksia</li>
      <li>Varausoikeutesi palautetaan automaattisesti, kun kaikki lentolaskut on maksettu</li>
    </ul>
    
    <p><strong>Vaadittu toimenpide:</strong></p>
    <p>Maksa kaikki erääntyneet lentolaskut välittömästi. Voit tarkastella ja maksaa laskusi kirjautumalla MIK Intranetiin.</p>
    
    <p style="margin: 20px 0;">
      <a href="${process.env.FRONTEND_URL}/club/billing" 
         style="background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        Näytä laskuni
      </a>
    </p>
    
    <p>Jos sinulla on kysymyksiä laskuistasi tai tarvitset apua maksamisessa, ota yhteyttä laskutusosastoomme:</p>
    <p><a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a></p>
    
    <p>Kiitos huomiostasi tähän asiaan.</p>
    
    <p>Ystävällisin terveisin,<br>
    Malmin Ilmailukerho</p>
  `

  return emailTemplate('Lentokoneen varausoikeus keskeytetty', content)
}

// Swedish HTML template
export function reservationSuspendedEmailBodyHtmlSv(vars: ReservationSuspendedEmailVars): string {
  const cancelledMessage =
    vars.cancelledBookingsCount > 0
      ? `<li><strong>${vars.cancelledBookingsCount} befintlig(a) reservation(er) har avbokats</strong></li>`
      : '<li>Du har inga befintliga reservationer som påverkas</li>'

  const content = `
    <h2 style="color: #d32f2f;">Flygplansreservationsrättigheter har upphävts</h2>
    
    <p>Bästa ${vars.firstName},</p>
    
    <p>Din möjlighet att göra flygplansreservationer har <strong>upphävts</strong> på grund av obetalda flygfakturor.</p>
    
    <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Utestående flygfakturor:</strong></p>
      <p style="margin: 5px 0 0 0;">Antal: <strong>${vars.invoiceCount}</strong></p>
      <p style="margin: 5px 0 0 0;">Totalt belopp: <strong>${vars.currency} ${vars.totalAmount.toFixed(2)}</strong></p>
    </div>
    
    <p><strong>Vad detta betyder:</strong></p>
    <ul>
      <li>Du kan inte göra nya flygplansreservationer förrän alla förfallna flygfakturor är betalda</li>
      ${cancelledMessage}
      <li>Detta upphävande påverkar endast flygbokningsrättigheter</li>
      <li>Dina reservationsrättigheter kommer automatiskt att återställas när alla flygfakturor är betalda</li>
    </ul>
    
    <p><strong>Åtgärd krävs:</strong></p>
    <p>Vänligen betala alla förfallna flygfakturor omedelbart. Du kan visa och betala dina fakturor genom att logga in på MIK Intranet.</p>
    
    <p style="margin: 20px 0;">
      <a href="${process.env.FRONTEND_URL}/club/billing" 
         style="background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        Visa mina fakturor
      </a>
    </p>
    
    <p>Om du har frågor om dina fakturor eller behöver hjälp med betalning, vänligen kontakta vår faktureringsavdelning:</p>
    <p><a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a></p>
    
    <p>Tack för din snabba uppmärksamhet på detta ärende.</p>
    
    <p>Med vänliga hälsningar,<br>
    MIK ry</p>
  `

  return emailTemplate('Flygplansreservationsrättigheter har upphävts', content)
}

// English plain text template
export function reservationSuspendedEmailPlainTextEn(vars: ReservationSuspendedEmailVars): string {
  const cancelledMessage =
    vars.cancelledBookingsCount > 0
      ? `- ${vars.cancelledBookingsCount} existing reservation(s) have been cancelled`
      : '- You have no existing reservations affected'

  return `
Aircraft Reservation Privileges Suspended

Dear ${vars.firstName},

Your ability to make aircraft reservations has been SUSPENDED due to unpaid flight invoices.

Outstanding Flight Invoices:
- Count: ${vars.invoiceCount}
- Total Amount: ${vars.currency} ${vars.totalAmount.toFixed(2)}

What this means:
- You cannot make new aircraft reservations until all overdue flight invoices are paid
${cancelledMessage}
- This suspension only affects flight booking privileges
- Your reservation privileges will be automatically restored once all flight invoices are paid

Action Required:
Please pay all overdue flight invoices immediately. You can view and pay your invoices by logging into the MIK Intranet at:
${process.env.FRONTEND_URL}/club/billing

If you have questions about your invoices or need payment assistance, please contact our billing department:
${BILLING_EMAIL}

Thank you for your prompt attention to this matter.

Best regards,
MIK ry
`.trim()
}

// Finnish plain text template
export function reservationSuspendedEmailPlainTextFi(vars: ReservationSuspendedEmailVars): string {
  const cancelledMessage =
    vars.cancelledBookingsCount > 0
      ? `- ${vars.cancelledBookingsCount} olemassa oleva(a) varausta on peruutettu`
      : '- Sinulla ei ole olemassa olevia varauksia, joihin tämä vaikuttaisi'

  return `
Lentokoneen varausoikeus keskeytetty

Hyvä ${vars.firstName},

Kykysi tehdä lentokoneen varauksia on KESKEYTETTY maksamattomien lentolaskujen vuoksi.

Maksamattomat lentolaskut:
- Määrä: ${vars.invoiceCount}
- Kokonaissumma: ${vars.currency} ${vars.totalAmount.toFixed(2)}

Mitä tämä tarkoittaa:
- Et voi tehdä uusia lentokoneen varauksia ennen kuin kaikki erääntyneet lentolaskut on maksettu
${cancelledMessage}
- Tämä keskeytys koskee vain lentokoneen varausoikeuksia
- Varausoikeutesi palautetaan automaattisesti, kun kaikki lentolaskut on maksettu

Vaadittu toimenpide:
Maksa kaikki erääntyneet lentolaskut välittömästi. Voit tarkastella ja maksaa laskusi kirjautumalla MIK Intranetiin:
${process.env.FRONTEND_URL}/club/billing

Jos sinulla on kysymyksiä laskuistasi tai tarvitset apua maksamisessa, ota yhteyttä laskutusosastoomme:
${BILLING_EMAIL}

Kiitos huomiostasi tähän asiaan.

Ystävällisin terveisin,
Malmin Ilmailukerho
`.trim()
}

// Swedish plain text template
export function reservationSuspendedEmailPlainTextSv(vars: ReservationSuspendedEmailVars): string {
  const cancelledMessage =
    vars.cancelledBookingsCount > 0
      ? `- ${vars.cancelledBookingsCount} befintlig(a) reservation(er) har avbokats`
      : '- Du har inga befintliga reservationer som påverkas'

  return `
Flygplansreservationsrättigheter har upphävts

Bästa ${vars.firstName},

Din möjlighet att göra flygplansreservationer har UPPHÄVTS på grund av obetalda flygfakturor.

Utestående flygfakturor:
- Antal: ${vars.invoiceCount}
- Totalt belopp: ${vars.currency} ${vars.totalAmount.toFixed(2)}

Vad detta betyder:
- Du kan inte göra nya flygplansreservationer förrän alla förfallna flygfakturor är betalda
${cancelledMessage}
- Detta upphävande påverkar endast flygbokningsrättigheter
- Dina reservationsrättigheter kommer automatiskt att återställas när alla flygfakturor är betalda

Åtgärd krävs:
Vänligen betala alla förfallna flygfakturor omedelbart. Du kan visa och betala dina fakturor genom att logga in på MIK Intranet:
${process.env.FRONTEND_URL}/club/billing

Om du har frågor om dina fakturor eller behöver hjälp med betalning, vänligen kontakta vår faktureringsavdelning:
${BILLING_EMAIL}

Tack för din snabba uppmärksamhet på detta ärende.

Med vänliga hälsningar,
MIK ry
`.trim()
}
