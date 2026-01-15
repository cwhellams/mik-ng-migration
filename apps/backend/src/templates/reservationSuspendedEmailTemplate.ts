import type { MIKLang } from '../routes/members/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'

export const BILLING_EMAIL = 'laskutus@mik.fi'

export interface ReservationSuspendedEmailVars {
  firstName: string
  invoiceCount: number
  totalAmount: number
  cancelledBookingsCount: number
}

export function reservationSuspendedEmailSubject(lang: string): string {
  switch (lang) {
    case 'fi':
      return 'Lentokoneen varausoikeus keskeytetty'
    case 'sv':
      return 'Flygplansreservationsrättigheter har upphävts'
    default:
      return 'Aircraft Reservation Privileges Suspended'
  }
}

// English HTML template
export const reservationSuspendedEmailBodyHtml = (
  lang: MIKLang,
  vars: ReservationSuspendedEmailVars,
) =>
  markdownEmailTemplate(`reservation-suspended-${lang}.md`, {
    ...vars,
    BILLING_EMAIL,
    href: `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/club/billing`,
  })
