import useApi from './useApi'
import type { AppConfig } from '@backend/routes/config/models'

export function useAppConfig(): {
  config: AppConfig | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useApi<AppConfig>(
    { url: 'v1/config' },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  )

  return {
    config: data,
    isLoading,
  }
}
