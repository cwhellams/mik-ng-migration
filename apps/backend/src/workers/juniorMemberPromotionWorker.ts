import 'dotenv/config'

import cron from 'node-cron'
import { getJuniorMembersTurning18Today, promoteMemberToFlying } from '../db/member-queries.ts'
import { sendEmail } from '../lib/sendGmail.ts'
import logger from '../lib/logger.ts'
import {
  juniorPromotionEmailSubject,
  juniorPromotionEmailBodyHtml,
} from '../templates/juniorPromotionEmailTemplate.ts'

let scheduledTask: cron.ScheduledTask | null = null

export interface JuniorMemberPromotionWorkerDeps {
  sendEmailFn?: typeof sendEmail
  cronSchedule?: typeof cron.schedule
}

/**
 * Start the junior member promotion worker.
 * Runs daily at 7am to promote JUNIOR members who turn 18 today to FLYING member type.
 */
export function startJuniorMemberPromotionWorker(deps: JuniorMemberPromotionWorkerDeps = {}) {
  const { sendEmailFn = sendEmail, cronSchedule = cron.schedule } = deps
  const shouldRun = process.env.JUNIOR_PROMOTION_WORKER_ENABLED === 'true'

  if (!shouldRun) {
    logger.warn('Junior Member Promotion Worker is disabled')
    return {
      stop: () => {
        logger.info('Junior Member Promotion Worker is not running')
      },
    }
  }

  logger.info('Starting Junior Member Promotion Worker - scheduled for 7am daily')

  // Schedule task to run daily at 7:00 AM
  // Cron format: minute hour day month weekday
  // '0 7 * * *' = At 7:00 AM every day
  scheduledTask = cronSchedule('0 7 * * *', async () => {
    logger.info('Junior Member Promotion Worker: Starting scheduled run')
    await processJuniorPromotions(sendEmailFn)
  })

  // Run immediately on startup if configured
  if (process.env.JUNIOR_PROMOTION_WORKER_RUN_ON_STARTUP === 'true') {
    logger.info('Running junior member promotion check immediately on startup')
    processJuniorPromotions(sendEmailFn).catch((error) => {
      logger.error('Error during startup junior member promotion check:', error)
    })
  }

  return {
    stop: () => {
      logger.info('Stopping Junior Member Promotion Worker')
      if (scheduledTask) {
        scheduledTask.stop()
        scheduledTask = null
      }
    },
  }
}

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

        await sendEmailFn(
          member.email,
          juniorPromotionEmailSubject(member.lang),
          juniorPromotionEmailBodyHtml(member.lang, { firstName: member.first_name }),
        )

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
