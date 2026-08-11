import 'dotenv/config'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { getMembers } from '../db/member-queries.ts'
import type { sendEmail } from '../lib/sendGmail.ts'
import { type MIKLang } from '../routes/members/models.ts'

export type AmeNotificationKind = 'new' | 'edit' | 'removal'

export const sendAmeSecretaryNotification = async (
  sendEmailFn: typeof sendEmail,
  kind: AmeNotificationKind,
  ameName: string,
  submitterName: string,
  reason?: string,
) => {
  const members = await getMembers(true, ['SECRETARY'], {})
  if (members.length === 0) {
    console.warn(
      `No members found with role SECRETARY, skipping AME ${kind} notification for "${ameName}"`,
    )
    return
  }

  for (const member of members) {
    void sendEmailFn(
      member.email,
      ameNotificationSubject(member.lang, kind),
      ameNotificationBodyHtml(member.lang, kind, ameName, submitterName, reason),
    )
  }
}

const ameNotificationSubject = (lang: MIKLang, kind: AmeNotificationKind): string => {
  switch (lang) {
    case 'fi':
      return kind === 'new'
        ? 'Uusi AME-ehdotus odottaa hyväksyntää'
        : kind === 'edit'
          ? 'AME-muokkausehdotus odottaa hyväksyntää'
          : 'AME-poistopyyntö odottaa hyväksyntää'
    case 'sv':
      return kind === 'new'
        ? 'Nytt AME-förslag väntar på godkännande'
        : kind === 'edit'
          ? 'AME-ändringsförslag väntar på godkännande'
          : 'AME-borttagningsbegäran väntar på godkännande'
    default:
      return kind === 'new'
        ? 'New AME suggestion awaiting approval'
        : kind === 'edit'
          ? 'AME edit suggestion awaiting approval'
          : 'AME removal request awaiting approval'
  }
}

const ameNotificationBodyHtml = (
  lang: MIKLang,
  kind: AmeNotificationKind,
  ameName: string,
  submitterName: string,
  reason: string | undefined,
) =>
  markdownEmailTemplate(`ame-submission-${lang}.md`, {
    isNew: kind === 'new',
    isEdit: kind === 'edit',
    isRemoval: kind === 'removal',
    ameName,
    submitterName,
    reason,
    href: `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/admin/ame`,
  })
