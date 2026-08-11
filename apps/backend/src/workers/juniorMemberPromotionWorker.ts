import 'dotenv/config'

import { getJuniorMembersTurning18Today, promoteMemberToFlying } from '../db/member-queries.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import logger from '../lib/logger.ts'
import { renderEmail } from '../templates/renderEmail.ts'
import { defineWorker, type CronWorkerDeps } from './defineWorker.ts'

export interface JuniorMemberPromotionWorkerDeps extends CronWorkerDeps {
  sendEmailFn?: typeof sendEmail
}

/**
 * Start the junior member promotion worker.
 * Runs daily at 7am to promote JUNIOR members who turn 18 today to FLYING member type.
 */
export const startJuniorMemberPromotionWorker = defineWorker<JuniorMemberPromotionWorkerDeps>({
  name: 'Junior Member Promotion Worker',
  envPrefix: 'JUNIOR_PROMOTION_WORKER',
  // '0 7 * * *' = At 7:00 AM every day
  schedule: '0 7 * * *',
  scheduleDescription: 'daily at 07:00',
  runOnStartup: true,
  run: ({ sendEmailFn = sendEmail }) => processJuniorPromotions(sendEmailFn),
})

/**
 * Process all JUNIOR members turning 18 today and promote them to FLYING.
 */
export async function processJuniorPromotions(sendEmailFn: typeof sendEmail): Promise<void> {
  try {
    logger.info('Fetching JUNIOR members turning 18 today')
    const members = await getJuniorMembersTurning18Today()

    if (members.length === 0) {
      logger.info('No JUNIOR members turning 18 today')
      return
    }

    logger.info(`Found ${members.length} JUNIOR member(s) turning 18 today`)

    let promotedCount = 0
    let errorCount = 0

    for (const member of members) {
      try {
        await promoteMemberToFlying(member.member_id)
        logger.info(`Promoted member ${member.member_id} from JUNIOR to FLYING (turned 18 today)`)

        const { subject, html } = renderEmail('junior-promotion', member.lang, {
          firstName: member.first_name,
        })
        await sendEmailFn(member.email, subject, html)

        promotedCount++
      } catch (error) {
        errorCount++
        logger.error(`Error promoting junior member ${member.member_id}:`, error)
      }
    }

    logger.info(
      `Junior member promotion completed: ${promotedCount} promoted, ${errorCount} errors`,
    )
  } catch (error) {
    logger.error('Error during junior member promotion processing:', error)
  }
}
