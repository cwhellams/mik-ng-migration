import 'dotenv/config'
import { toLocal } from '../util/date.ts'
import { OccurrenceStatus, type Occurrence } from '../routes/occurrences/models.ts'
import type { EmailTemplateVars } from './registry.ts'

// Shared by every occurrence email (the safety-team notification and the CAMO
// notification), which render the same report from the same link and date
// format — see ./bookingEmailHelpers.ts for the equivalent booking table.

/** Flatten an occurrence into the values the `occurrence-*.md` templates render. */
export const occurrenceEmailVars = (
  occurrence: Occurrence,
): EmailTemplateVars['occurrence-notification'] => ({
  ...occurrence,
  new: occurrence.status === OccurrenceStatus.NEW,
  anonymized: occurrence.status === OccurrenceStatus.ANONYMIZED,
  reportDate: formatDate(occurrence.reportDate),
  deadLine: occurrence.deadLine ? formatDate(occurrence.deadLine) : undefined,
  href: `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/logs/occurrences/${occurrence.id}`,
  hasAttachments: occurrence.attachments.length > 0,
  attachmentCount: occurrence.attachments.length,
})

const formatDate = (date: string) => toLocal(date).format('DD.MM.YYYY HH:mm')
