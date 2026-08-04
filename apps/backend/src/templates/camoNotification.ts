import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { toLocal } from '../util/date.ts'
import { type Occurrence } from '../routes/occurrences/models.ts'
import { type MIKLang } from '../routes/members/models.ts'
import { getMembers } from '../db/member-queries.ts'
import type { sendEmail } from '../lib/sendGmail.ts'

export const sendCamoNotification = async (
  sendEmailFn: typeof sendEmail,
  roles: string[],
  occurrence: Occurrence,
) => {
  const members = await getMembers(true, roles, {})
  if (members.length === 0) {
    console.warn(
      `No members found with roles [${roles.join(', ')}], skipping CAMO notification for occurrence ${occurrence.id}`,
    )
    return
  }

  for (const member of members) {
    console.log(
      `Sending occurrence ${occurrence.id} CAMO notification to member ${member.email} in roles [${roles.join(', ')}]`,
    )
    sendEmailFn(
      member.email,
      camoNotificationEmailSubject(member.lang),
      camoNotificationEmailBodyHtml(member.lang, occurrence),
    )
  }
}

export const camoNotificationEmailSubject = (lang: MIKLang): string => {
  switch (lang) {
    case 'fi':
      return 'Poikkeamailmoitus jaettu CAMOlle'
    case 'sv':
      return 'Händelserapport delad med CAMO'
    default:
      return 'Occurrence report shared with CAMO'
  }
}

export const camoNotificationEmailBodyHtml = (lang: MIKLang, occurrence: Occurrence) =>
  markdownEmailTemplate(`occurrence-camo-notification-${lang}.md`, {
    ...occurrence,
    reportDate: formatDate(occurrence.reportDate),
    href: `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/logs/occurrences/${occurrence.id}`,
  })

const formatDate = (date: string) => toLocal(date).format('DD.MM.YYYY HH:mm')
