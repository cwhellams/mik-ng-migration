import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { toLocal } from '../util/date.ts'
import { OccurrenceStatus, type Occurrence } from '../routes/occurrences/models.ts'
import { MIKPermissions, type MIKLang } from '../routes/members/models.ts'
import { getMemberRolesByPermission, getMembers } from '../db/member-queries.ts'
import type { sendEmail } from '../lib/sendGmail.ts'

export const sendOccurrenceNotification = async (
  sendEmailFn: typeof sendEmail,
  occurrence: Occurrence,
) => {
  const targetGroup =
    occurrence.status === OccurrenceStatus.ANONYMIZED
      ? MIKPermissions.SMS_TEAM
      : MIKPermissions.SMS_ADMIN

  const roles = await getMemberRolesByPermission(targetGroup)
  if (roles.length === 0) {
    console.warn(
      `No member roles found with permission ${targetGroup}, skipping occurrence notification for occurrence ${occurrence.id}`,
    )
    return
  }

  const members = await getMembers(
    true,
    undefined,
    roles.map(r => r.roleId),
  )
  if (members.length === 0) {
    console.warn(
      `No members found with roles ${roles.map(r => r.roleId).join(', ')}, skipping occurrence notification for occurrence ${occurrence.id}`,
    )
    return
  }

  for (const member of members) {
    console.log(
      `Sending occurrence ${occurrence.id} in status ${occurrence.status} a notification to group ${targetGroup} member ${member.email}`,
    )
    sendEmailFn(
      member.email,
      occurrenceNotificationEmailSubject(member.lang),
      occurrenceNotificationEmailBodyHtml(member.lang, occurrence),
    )
  }
}

export const occurrenceNotificationEmailSubject = (lang: MIKLang): string =>
  lang == 'fi' ? 'Uusi poikkema ilmoitettu' : 'New occurrence reported'

export const occurrenceNotificationEmailBodyHtml = (lang: MIKLang, occurrence: Occurrence) =>
  markdownEmailTemplate(`occurrence-notification-${lang}.md`, {
    ...occurrence,
    new: occurrence.status === OccurrenceStatus.NEW,
    reportDate: formatDate(occurrence.reportDate),
    deadLine: occurrence.deadLine ? formatDate(occurrence.deadLine) : undefined,
    href: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/logs/occurrences/${occurrence.id}`,
  })

const formatDate = (date: string) => toLocal(date).format('DD.MM.YYYY HH:mm')
