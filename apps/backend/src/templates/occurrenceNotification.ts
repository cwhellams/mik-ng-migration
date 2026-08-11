import { type Occurrence } from '../routes/occurrences/models.ts'
import { getMembers } from '../db/member-queries.ts'
import type { sendEmail } from '../lib/sendGmail.ts'
import { occurrenceEmailVars } from './occurrenceEmailHelpers.ts'
import { renderEmail } from './renderEmail.ts'

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
    const { subject, html } = renderEmail(
      'occurrence-notification',
      member.lang,
      occurrenceEmailVars(occurrence),
    )
    sendEmailFn(member.email, subject, html)
  }
}
