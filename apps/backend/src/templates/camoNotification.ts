import { type Occurrence } from '../routes/occurrences/models.ts'
import { getMembers } from '../db/member-queries.ts'
import type { sendEmail } from '../lib/sendGmail.ts'
import { occurrenceEmailVars } from './occurrenceEmailHelpers.ts'
import { renderEmail } from './renderEmail.ts'

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
    const { subject, html } = renderEmail(
      'occurrence-camo-notification',
      member.lang,
      occurrenceEmailVars(occurrence),
    )
    await sendEmailFn(member.email, subject, html)
  }
}
