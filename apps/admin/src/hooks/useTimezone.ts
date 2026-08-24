import { useThemeMode } from '../theme/ThemeContext'
import { timezoneFormatters } from '@mik/ui/utils/timezoneFormatters'

/**
 * Date/time formatters bound to the admin's UTC-or-local preference.
 *
 * The formatting itself is shared with the member app (`@mik/ui`); only where
 * the preference is stored differs, which is why this hook is app-local.
 */
export function useTimezone() {
  const { timezone, setTimezone } = useThemeMode()
  return { ...timezoneFormatters(timezone), setTimezone }
}
