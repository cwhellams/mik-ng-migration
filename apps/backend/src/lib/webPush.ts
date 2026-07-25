import 'dotenv/config'
import webpush from 'web-push'
import logger from './logger.ts'

let vapidConfigured = false

/** Configure the web-push library's VAPID details, once, from the environment. */
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    logger.warn(
      'Push notifications are not configured: VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT missing',
    )
    return false
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export interface PushSubscriptionKeys {
  endpoint: string
  keysAuth: string
  keysP256dh: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

/**
 * Result of sending a push notification. `gone` is true when the push
 * service reports the subscription is no longer valid (404/410), so the
 * caller can delete the stale subscription.
 */
export type SendPushResult = { ok: true } | { ok: false; gone: boolean; error: unknown }

export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
): Promise<SendPushResult> {
  if (!ensureVapidConfigured()) {
    return { ok: false, gone: false, error: new Error('VAPID not configured') }
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { auth: subscription.keysAuth, p256dh: subscription.keysP256dh },
      },
      JSON.stringify(payload),
    )
    return { ok: true }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    const gone = statusCode === 404 || statusCode === 410
    return { ok: false, gone, error }
  }
}
