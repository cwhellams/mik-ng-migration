import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { toLocal } from '../util/date.ts'
import { OccurrenceStatus, type Occurrence } from '../routes/occurrences/models.ts'
import { type MIKLang } from '../routes/members/models.ts'
import { getMembers } from '../db/member-queries.ts'
import type { sendEmail } from '../lib/sendGmail.ts'

export const sendOccurrenceNotification = async (
  sendEmailFn: typeof sendEmail,
  roles: string[],
  occurrence: Occurrence,
) => {
  const members = await getMembers(true, roles, {})
  if (members.length === 0) {
    console.warn(
      `No members found with roles [${roles.join(', ')}], skipping occurrence notification for occurrence ${occurrence.id}`,
    )
    return
  }

  for (const member of members) {
    console.log(
      `Sending occurrence ${occurrence.id} in status ${occurrence.status} a notification member ${member.email} in roles [${roles.join(', ')}]`,
    )
    sendEmailFn(
      member.email,
      occurrenceNotificationEmailSubject(member.lang),
      occurrenceNotificationEmailBodyHtml(member.lang, occurrence),
    )
  }
}

export const occurrenceNotificationEmailSubject = (lang: MIKLang): string => {
  switch (lang) {
    case 'fi':
      return 'Uusi poikkeama ilmoitettu'
    case 'sv':
      return 'Ny händelse rapporterad'
    default:
      return 'New occurrence reported'
  }
}

export const occurrenceNotificationEmailBodyHtml = (lang: MIKLang, occurrence: Occurrence) =>
  markdownEmailTemplate(`occurrence-notification-${lang}.md`, {
    ...occurrence,
    new: occurrence.status === OccurrenceStatus.NEW,
    anonymized: occurrence.status === OccurrenceStatus.ANONYMIZED,
    reportDate: formatDate(occurrence.reportDate),
    deadLine: occurrence.deadLine ? formatDate(occurrence.deadLine) : undefined,
    href: `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/logs/occurrences/${occurrence.id}`,
  })

const formatDate = (date: string) => toLocal(date).format('DD.MM.YYYY HH:mm')
