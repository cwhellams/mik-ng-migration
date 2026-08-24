import useApi from '@mik/ui/hooks/useApi'
import type { AppConfig } from '@mik/contracts/config'

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
    },
  )

  return {
    config: data,
    isLoading,
  }
}
