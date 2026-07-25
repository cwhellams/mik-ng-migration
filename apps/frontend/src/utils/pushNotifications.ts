/**
 * Web push notification helper for the "booking in 1 hour" reminder feature.
 *
 * Per-device opt-in: each browser/device the member enables notifications on
 * registers its own PushSubscription with the backend (see
 * PushNotificationsCard.tsx), so a member can have push enabled on their
 * phone but not their desktop.
 */
import { sharedApi } from '../hooks/useApi'

export const pushNotificationsSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/**
 * iOS Safari only supports web push once the app has been added to the Home
 * Screen (installed as a PWA) — `navigator.standalone` is true in that mode.
 * Detecting "iOS but not installed" lets the UI show install instructions
 * instead of a non-functional enable button.
 */
export const isIosSafariNotInstalled = (): boolean => {
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)
  const isStandalone =
    'standalone' in navigator && (navigator as unknown as { standalone?: boolean }).standalone
  return isIos && !isStandalone
}

const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = globalThis.atob(base64)
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export type PushSubscribeResult =
  { ok: true } | { ok: false; reason: 'permission-denied' | 'failed' }

/** Register the browser's push subscription with the backend for this member. */
export async function enablePushNotifications(): Promise<PushSubscribeResult> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission-denied' }
  }

  try {
    const { data } = await sharedApi.get<{ publicKey: string }>('v1/push/vapid-public-key')

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    })

    const json = subscription.toJSON()
    await sharedApi.post('v1/push/subscribe', {
      endpoint: json.endpoint,
      keys: { auth: json.keys?.auth, p256dh: json.keys?.p256dh },
    })

    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Unsubscribe this device and remove the subscription from the backend. */
export async function disablePushNotifications(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return true

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await sharedApi.delete('v1/push/subscribe', { data: { endpoint } })
    return true
  } catch {
    return false
  }
}

/** Whether this device currently has an active push subscription. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!pushNotificationsSupported()) return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return subscription !== null
}
