import { Alert } from '@mui/material'
import useApi from '@mik/ui/hooks/useApi'
import type { NotificationBanner as NotificationBannerType } from '@mik/contracts/notification-banner'

export function NotificationBanner() {
  const { data } = useApi<NotificationBannerType>({
    url: 'v1/notification-banner',
    allowUnauthenticated: true,
  })

  if (!data?.enabled || !data?.message) {
    return null
  }

  return (
    <Alert severity={data.severity} square sx={{ borderRadius: 0 }}>
      {data.message}
    </Alert>
  )
}
