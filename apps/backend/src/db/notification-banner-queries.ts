import { auditUpdate } from './audit.ts'
import { db } from './connection.ts'
import type { NotificationBanner } from '@mik/contracts/notification-banner'
import type { JWTUser } from '../routes/auth/token.ts'

export const getNotificationBanner = async (): Promise<NotificationBanner> => {
  const result = await db
    .selectFrom('notificationBanner')
    .select(['enabled', 'message', 'severity'])
    .where('id', '=', 1)
    .executeTakeFirstOrThrow()

  return {
    enabled: result.enabled,
    message: result.message ?? null,
    severity: result.severity as NotificationBanner['severity'],
  }
}

export const setNotificationBanner = async (
  banner: NotificationBanner,
  user: JWTUser,
): Promise<void> => {
  await db
    .updateTable('notificationBanner')
    .set({
      enabled: banner.enabled,
      message: banner.message,
      severity: banner.severity,
      ...auditUpdate(user.memberId),
    })
    .where('id', '=', 1)
    .execute()
}
