import { useState, useEffect } from 'react'

interface UseServiceWorkerUpdateReturn {
  isUpdateAvailable: boolean
  dismissUpdate: () => void
  refreshApp: () => void
}

export function useServiceWorkerUpdate(): UseServiceWorkerUpdateReturn {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Held rather than re-read on cleanup, so the listener is always removed
    // from the container it was added to.
    const container = navigator.serviceWorker

    // Service worker has been updated and is now in control
    // Show a toast to notify user of the update
    const onControllerChange = () => setIsUpdateAvailable(true)

    container.addEventListener('controllerchange', onControllerChange)
    return () => container.removeEventListener('controllerchange', onControllerChange)
  }, [])

  const dismissUpdate = () => {
    setIsUpdateAvailable(false)
  }

  const refreshApp = () => {
    // Reload to get fresh assets from updated service worker
    window.location.reload()
  }

  return {
    isUpdateAvailable,
    dismissUpdate,
    refreshApp,
  }
}
