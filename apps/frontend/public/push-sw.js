// Handles Web Push events for booking reminder notifications.
// Bundled into the generated workbox service worker via
// `workbox.importScripts` in vite.config.ts.

self.addEventListener('push', (event) => {
  let data = { title: 'MIK NG', body: '' }
  try {
    if (event.data) data = event.data.json()
  } catch {
    // ignore malformed payloads
  }

  const { title, body, url } = data

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
