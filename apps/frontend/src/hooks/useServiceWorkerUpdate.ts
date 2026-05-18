import { useState, useEffect } from 'react'

interface UseServiceWorkerUpdateReturn {
  isUpdateAvailable: boolean
  dismissUpdate: () => void
  refreshApp: () => void
}

export function useServiceWorkerUpdate(): UseServiceWorkerUpdateReturn {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Service worker has been updated and is now in control
        // Show a toast to notify user of the update
        setIsUpdateAvailable(true)
      })
    }
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
