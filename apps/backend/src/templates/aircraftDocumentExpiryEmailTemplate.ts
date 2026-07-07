import { markdownEmailTemplate } from './emailTemplate.ts'

export const KALUSTO_EMAIL = 'kalusto@mik.fi'

export type AircraftDocumentExpiryEmailVars = {
  aircraftRegistration: string
  documentType: string
  documentTitle: string
  expiryDate: string
  daysUntilExpiry?: number
}

export function aircraftDocumentExpiryReminderSubject(
  aircraftRegistration: string,
  documentType: string,
): string {
  return `MIK Kalusto – Aircraft document expiring soon: ${documentType} (${aircraftRegistration})`
}

export function aircraftDocumentExpiryReminderBodyHtml(
  vars: AircraftDocumentExpiryEmailVars,
): string {
  return markdownEmailTemplate('aircraft-document-expiry-reminder-en.md', vars)
}

export function aircraftDocumentExpiredSubject(
  aircraftRegistration: string,
  documentType: string,
): string {
  return `MIK Kalusto – Aircraft document expired: ${documentType} (${aircraftRegistration})`
}

export function aircraftDocumentExpiredBodyHtml(vars: AircraftDocumentExpiryEmailVars): string {
  return markdownEmailTemplate('aircraft-document-expired-en.md', vars)
}
