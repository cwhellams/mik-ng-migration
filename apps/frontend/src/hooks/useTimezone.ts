import { useThemeMode } from '../theme/ThemeContext'
import { timezoneFormatters } from '@mik/ui/utils/timezoneFormatters'

export function useTimezone() {
  const { timezone, setTimezone } = useThemeMode()
  return { ...timezoneFormatters(timezone), setTimezone }
}
