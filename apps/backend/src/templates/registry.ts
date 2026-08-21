import 'dotenv/config'

/**
 * Every markdown-backed email the app sends, as data.
 *
 * Each entry names a set of `<key>-<lang>.md` files in this directory and the
 * subject line that goes with them. Previously each of these was its own
 * `*EmailTemplate.ts` file wrapping the same two functions — a `switch (lang)`
 * for the subject and a second one to pick the markdown file. Keeping them in
 * one table means adding an email is one entry, and the whole set of subjects
 * is reviewable (and translatable) in one place.
 *
 * Render an entry with `renderEmail()` from `./renderEmail.ts`.
 */

export type EmailLang = 'en' | 'fi' | 'sv'

export const EMAIL_LANGUAGES: readonly EmailLang[] = ['en', 'fi', 'sv']

export interface EmailTemplateSpec {
  /**
   * Subject per language. Handlebars, rendered against the same vars as the
   * body, so `'Expense claim approved: {{claimTitle}}'` works. Values are
   * plain text and are not HTML-escaped.
   */
  subject: Record<EmailLang, string>
  /** Optional small-print line rendered under the body's horizontal rule. */
  footer?: Record<EmailLang, string>
  /**
   * Markdown files that exist for this template. Defaults to all three; the
   * kalusto notifications are English-only, so a Finnish recipient still gets
   * the English body rather than a `readFileSync` crash.
   */
  languages?: readonly EmailLang[]
  /**
   * Constants merged into the vars before rendering, for values the markdown
   * references but no caller should have to supply. These take precedence over
   * caller-supplied vars: the wrappers this table replaced spread them last
   * (`{ ...vars, BILLING_EMAIL }`), so no payload could redirect the address
   * printed in an email, and that stays true here. A function, not an object,
   * so env vars are read at send time rather than frozen at import.
   */
  defaults?: () => Record<string, unknown>
}

const BILLING_EMAIL = 'laskutus@mik.fi'

/**
 * The training department mailbox. Exported because the qualification expiry
 * worker CCs the same address on its escalation mail — one definition, so a
 * change here can't leave that copy stale.
 */
export const TRAINING_EMAIL = 'koulutus@mik.fi'

const publicUrl = () => process.env.PUBLIC_URL ?? 'http://localhost:5173'

export const emailTemplates = {
  // ─── Authentication and registration ──────────────────────────────────────
  login: {
    subject: {
      fi: 'Kirjaudu MIK sivustolle',
      sv: 'Bekräfta din inloggning till MIK Intranet',
      en: 'Confirm your login to MIK Intranet',
    },
    footer: {
      fi: 'Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.',
      sv: 'Om du inte begärde detta e-postmeddelande kan du lugnt ignorera det.',
      en: 'If you didn’t request this email, you can safely ignore it.',
    },
  },
  'registration-submit': {
    subject: {
      fi: 'Tervetuloa Malmin ilmailukerhoon',
      sv: 'Välkommen till Malmin Ilmailukerho',
      en: 'Welcome to Malmin Ilmailukerho',
    },
    footer: {
      fi: 'Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.',
      sv: 'Om du inte begärde detta e-postmeddelande kan du lugnt ignorera det.',
      en: "If you didn't request this email, you can safely ignore it.",
    },
  },
  'registration-approved': {
    subject: {
      fi: 'Tervetuloa Malmin ilmailukerhoon',
      sv: 'MIK - ditt medlemskap är godkänt',
      en: 'MIK - your membership is approved',
    },
    defaults: () => ({ MIK_RULES_URL: process.env.MIK_RULES_URL ?? 'https://mik.fi/rules' }),
  },
  'email-change-verify': {
    subject: {
      fi: 'Vahvista uusi sähköpostiosoitteesi',
      sv: 'Verifiera din nya e-postadress',
      en: 'Verify your new email address',
    },
    footer: {
      fi: 'Jos et pyytänyt tätä muutosta, voit huoletta sivuuttaa tämän sähköpostin.',
      sv: 'Om du inte begärde denna ändring kan du lugnt ignorera detta e-postmeddelande.',
      en: "If you didn't request this change, you can safely ignore this email.",
    },
  },

  // ─── Membership lifecycle ─────────────────────────────────────────────────
  'new-member': {
    subject: {
      fi: 'Uusi jäsen rekisteröitynyt',
      sv: 'Ny medlem registrerad',
      en: 'New member registered',
    },
  },
  'junior-promotion': {
    subject: {
      fi: 'MIK - Tervetuloa täysjäseneksi!',
      sv: 'MIK - Välkommen som fullständig medlem!',
      en: 'MIK - Welcome to Full Membership!',
    },
  },
  'member-nonrenewal-reminder': {
    subject: {
      fi: 'Viimeinen muistutus: jäsenmaksusi on maksamatta - jäsenyytesi päättyy pian - Malmin Ilmailukerho',
      sv: 'Sista påminnelsen: din medlemsavgift är obetald – ditt medlemskap upphör snart – Malmin Ilmailukerho',
      en: 'Last reminder: your membership fee is unpaid - your membership will end soon - Malmin Ilmailukerho',
    },
  },
  'member-removed': {
    subject: {
      fi: 'Jäsenyytesi on päättynyt - Malmin Ilmailukerho',
      sv: 'Ditt medlemskap har upphört - Malmin Ilmailukerho',
      en: 'Your membership has been terminated - Malmin Ilmailukerho',
    },
  },
  'dto-student-removed': {
    subject: {
      fi: 'DTO-oppilas poistettu jäsenrekisteristä',
      sv: 'DTO-student borttagen från medlemsregistret',
      en: 'DTO student removed from member registry',
    },
  },

  // ─── Bookings ─────────────────────────────────────────────────────────────
  'booking-confirmed': {
    subject: {
      fi: 'MIK varauksesi on vahvistettu',
      sv: 'Din MIK-bokning är bekräftad',
      en: 'Your MIK booking is confirmed',
    },
  },
  'booking-updated': {
    subject: {
      fi: 'MIK varauksesi on päivitetty',
      sv: 'Din MIK-bokning har uppdaterats',
      en: 'Your MIK booking has been updated',
    },
  },
  'booking-cancelled': {
    subject: {
      fi: 'MIK varauksesi on peruttu',
      sv: 'Din MIK-bokning har blivit inställd',
      en: 'Your MIK booking is cancelled',
    },
  },
  'booking-reminder': {
    subject: {
      fi: 'MIK muistutus tulevasta varauksesta',
      sv: 'Påminnelse om din kommande MIK-bokning',
      en: 'Reminder: Your upcoming MIK booking',
    },
  },

  // ─── Item reservations (#1139) ────────────────────────────────────────────
  'item-reservation-confirmed': {
    subject: {
      fi: 'MIK varauksesi {{itemName}} on vahvistettu',
      sv: 'Din MIK-bokning av {{itemName}} är bekräftad',
      en: 'Your MIK reservation for {{itemName}} is confirmed',
    },
  },
  'item-reservation-updated': {
    subject: {
      fi: 'MIK varauksesi {{itemName}} on päivitetty',
      sv: 'Din MIK-bokning av {{itemName}} har uppdaterats',
      en: 'Your MIK reservation for {{itemName}} has been updated',
    },
  },
  'item-reservation-cancelled': {
    subject: {
      fi: 'MIK varauksesi {{itemName}} on peruttu',
      sv: 'Din MIK-bokning av {{itemName}} är inställd',
      en: 'Your MIK reservation for {{itemName}} is cancelled',
    },
  },
  'booking-transferred-from': {
    subject: {
      fi: 'MIK varauksesi on siirretty toiselle jäsenelle',
      sv: 'Din MIK-bokning har överförts till en annan medlem',
      en: 'Your MIK booking has been transferred to another member',
    },
  },
  'booking-transferred-to': {
    subject: {
      fi: 'Sinulle on siirretty MIK-varaus',
      sv: 'En MIK-bokning har överförts till dig',
      en: 'A MIK booking has been transferred to you',
    },
  },
  'booking-instructor-confirmed': {
    subject: {
      fi: 'Sinut on merkitty ohjaajaksi MIK-varaukseen',
      sv: 'Du har utsetts till instruktör för en MIK-bokning',
      en: "You've been assigned as instructor for a MIK booking",
    },
  },
  'booking-instructor-updated': {
    subject: {
      fi: 'MIK-varaus, jossa olet ohjaajana, on päivitetty',
      sv: 'En MIK-bokning där du är instruktör har uppdaterats',
      en: "A MIK booking where you're the instructor has been updated",
    },
  },
  'booking-instructor-cancelled': {
    subject: {
      fi: 'MIK-varaus, jossa olit ohjaajana, on peruttu',
      sv: 'En MIK-bokning där du var instruktör har ställts in',
      en: 'A MIK booking where you were the instructor has been cancelled',
    },
  },

  // ─── Expense claims ───────────────────────────────────────────────────────
  'expense-approved': {
    subject: {
      fi: 'Kulukorvaus hyväksytty: {{claimTitle}}',
      sv: 'Utgiftsanspråk godkänt: {{claimTitle}}',
      en: 'Expense claim approved: {{claimTitle}}',
    },
  },
  'expense-rejected': {
    subject: {
      fi: 'Kulukorvaus hylätty: {{claimTitle}}',
      sv: 'Utgiftsanspråk avvisat: {{claimTitle}}',
      en: 'Expense claim rejected: {{claimTitle}}',
    },
  },
  'expense-request-info': {
    subject: {
      fi: 'Lisätietoja vaaditaan: {{claimTitle}}',
      sv: 'Ytterligare information krävs: {{claimTitle}}',
      en: 'Further information required: {{claimTitle}}',
    },
  },
  'expense-set-to-draft': {
    subject: {
      fi: 'Kuluhakemus palautettu luonnokseksi: {{claimTitle}}',
      sv: 'Utgiftsanmälan återförd till utkast: {{claimTitle}}',
      en: 'Expense claim returned to draft: {{claimTitle}}',
    },
  },
  'expense-treasurer-edited': {
    subject: {
      fi: 'Kuluhakemustasi korjattiin: {{claimTitle}}',
      sv: 'Din utgiftsanmälan korrigerades: {{claimTitle}}',
      en: 'Your expense claim was corrected: {{claimTitle}}',
    },
  },

  // ─── Invoicing ────────────────────────────────────────────────────────────
  'overdue-invoice': {
    subject: {
      fi: 'MIK - Muistutus erääntyneestä laskusta',
      sv: 'MIK - Påminnelse om förfallen faktura',
      en: 'MIK - Overdue Invoice Reminder',
    },
    defaults: () => ({ BILLING_EMAIL }),
  },
  'reservation-suspended': {
    subject: {
      fi: 'Lentokoneen varausoikeus keskeytetty',
      sv: 'Flygplansreservationsrättigheter har upphävts',
      en: 'Aircraft Reservation Privileges Suspended',
    },
    defaults: () => ({ BILLING_EMAIL, href: `${publicUrl()}/club/billing` }),
  },

  // ─── Safety and maintenance ───────────────────────────────────────────────
  'occurrence-notification': {
    subject: {
      fi: 'Uusi poikkeama ilmoitettu',
      sv: 'Ny händelse rapporterad',
      en: 'New occurrence reported',
    },
  },
  'occurrence-camo-notification': {
    subject: {
      fi: 'Poikkeamailmoitus jaettu CAMOlle',
      sv: 'Händelserapport delad med CAMO',
      en: 'Occurrence report shared with CAMO',
    },
  },
  'qualification-expiry-reminder': {
    subject: {
      fi: 'MIK - Pätevyyden vanhentumismuistutus',
      sv: 'MIK - Påminnelse om kvalifikationsutgång',
      en: 'MIK - Qualification Expiry Reminder',
    },
    defaults: () => ({ TRAINING_EMAIL }),
  },
  'qualification-expired': {
    subject: {
      fi: 'MIK - Pätevyys vanhentunut',
      sv: 'MIK - Kvalifikation har upphört',
      en: 'MIK - Qualification Expired',
    },
    defaults: () => ({ TRAINING_EMAIL }),
  },
  // Sent to kalusto@mik.fi, which works in English — no translated bodies exist.
  'aircraft-document-expiry-reminder': {
    subject: {
      fi: 'MIK Kalusto – Aircraft document expiring soon: {{documentType}} ({{aircraftRegistration}})',
      sv: 'MIK Kalusto – Aircraft document expiring soon: {{documentType}} ({{aircraftRegistration}})',
      en: 'MIK Kalusto – Aircraft document expiring soon: {{documentType}} ({{aircraftRegistration}})',
    },
    languages: ['en'],
  },
  'aircraft-document-expired': {
    subject: {
      fi: 'MIK Kalusto – Aircraft document expired: {{documentType}} ({{aircraftRegistration}})',
      sv: 'MIK Kalusto – Aircraft document expired: {{documentType}} ({{aircraftRegistration}})',
      en: 'MIK Kalusto – Aircraft document expired: {{documentType}} ({{aircraftRegistration}})',
    },
    languages: ['en'],
  },
} as const satisfies Record<string, EmailTemplateSpec>

export type EmailTemplateKey = keyof typeof emailTemplates

/**
 * What each template's caller has to hand `renderEmail()`.
 *
 * The `*EmailTemplate.ts` wrappers this table replaced each took a named vars
 * type, so a dropped or misspelled var failed to compile. A shared
 * `Record<string, unknown>` would have given that up: a missing `{{firstName}}`
 * renders as empty text, which no test and no runtime check would catch. This
 * map keeps the per-template contract, keyed by the same key as the subject.
 *
 * Values supplied by an entry's `defaults()` are deliberately absent — callers
 * neither need nor can override them. Fields the markdown only uses inside an
 * `{{#if}}` are optional.
 *
 * `renderEmail` indexes this by `EmailTemplateKey`, so forgetting to add an
 * entry for a new template is a compile error there, not a silent gap.
 */
export interface EmailTemplateVars {
  // ─── Authentication and registration ──────────────────────────────────────
  login: { firstName: string; href: string; code: string | number }
  'registration-submit': { firstName: string; href: string }
  'registration-approved': { firstName: string }
  'email-change-verify': { firstName: string; newEmail: string; href: string }

  // ─── Membership lifecycle ─────────────────────────────────────────────────
  'new-member': { firstName: string; href: string }
  'junior-promotion': { firstName: string }
  'member-nonrenewal-reminder': { firstName: string; year: number }
  'member-removed': { firstName: string }
  'dto-student-removed': { firstName: string; lastName: string; memberId: string }

  // ─── Bookings ─────────────────────────────────────────────────────────────
  // Built with `bookingEmailVars()` from ./bookingEmailHelpers.ts, which
  // supplies everything but the recipient-specific names.
  'booking-confirmed': BookingEmailVars
  'booking-updated': BookingEmailVars
  'booking-cancelled': BookingEmailVars
  'booking-reminder': BookingEmailVars
  'booking-transferred-from': BookingEmailVars & { newMemberName: string }
  'booking-transferred-to': BookingEmailVars & { previousMemberName: string }
  'booking-instructor-confirmed': BookingEmailVars & { studentName: string }
  'booking-instructor-updated': BookingEmailVars & { studentName: string }
  'booking-instructor-cancelled': BookingEmailVars & { studentName: string }

  // ─── Item reservations ────────────────────────────────────────────────────
  // Built with `itemReservationEmailVars()` from ./itemReservationEmailHelpers.ts.
  'item-reservation-confirmed': ItemReservationEmailVars
  'item-reservation-updated': ItemReservationEmailVars
  'item-reservation-cancelled': ItemReservationEmailVars & { cancellationNote: string }

  // ─── Expense claims ───────────────────────────────────────────────────────
  'expense-approved': ExpenseEmailVars
  'expense-rejected': ExpenseEmailVars & { rejectionReason: string }
  'expense-request-info': ExpenseEmailVars & { adminMessage: string }
  'expense-set-to-draft': ExpenseEmailVars
  'expense-treasurer-edited': ExpenseEmailVars & { changesSummary: string }

  // ─── Invoicing ────────────────────────────────────────────────────────────
  'overdue-invoice': {
    firstName: string
    invoiceId: string | number
    amount: number
    dueDate: string | Date | null
  }
  'reservation-suspended': {
    firstName: string
    invoiceCount: number
    totalAmount: number
    cancelledBookingsCount: number
  }

  // ─── Safety and maintenance ───────────────────────────────────────────────
  // Built with `occurrenceEmailVars()` from ./occurrenceEmailHelpers.ts.
  // `firstName` is optional because an occurrence carries no reporter name —
  // the greeting has always rendered without one.
  'occurrence-notification': {
    firstName?: string
    aircraftRegistration: string | null
    reportDate: string
    href: string
    new: boolean
    anonymized: boolean
    hasAttachments: boolean
    attachmentCount: number
    deadLine?: string
  }
  'occurrence-camo-notification': {
    aircraftRegistration: string | null
    reportDate: string
    href: string
  }
  'qualification-expiry-reminder': {
    firstName: string
    qualificationLabel: string
    expiryDate: string
    daysUntilExpiry?: number
  }
  'qualification-expired': {
    firstName: string
    qualificationLabel: string
    expiryDate: string
  }
  'aircraft-document-expiry-reminder': AircraftDocumentEmailVars & { daysUntilExpiry: number }
  'aircraft-document-expired': AircraftDocumentEmailVars
}

interface BookingEmailVars {
  firstName: string
  registration: string
  bookingTime: string
  /** Unused by the cancellation bodies, but every booking email is built alike. */
  calendarLink: string
  href: string
}

interface ItemReservationEmailVars {
  firstName: string
  /** The item's name in the recipient's language, already resolved. */
  itemName: string
  /** `"3 × "` for a multi-unit reservation, empty for a single one. */
  quantityLabel: string
  /** The reserved unit's asset tag, or empty when any unit from the pool will do. */
  unitTag: string
  reservationTime: string
  href: string
}

interface ExpenseEmailVars {
  memberName: string
  claimTitle: string
  claimUrl: string
}

interface AircraftDocumentEmailVars {
  aircraftRegistration: string
  documentType: string
  documentTitle: string
  expiryDate: string
}
