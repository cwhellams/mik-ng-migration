import { createContext, useContext } from 'react'

import { timezoneFormatters, type TimezonePreference } from '../utils/timezoneFormatters'

/**
 * Whether timestamps render in UTC or the browser's local zone, and how to
 * change it.
 *
 * Same shape of arrangement as `apiConfig`: the formatting is identical in both
 * apps and lives here, while *where the preference is stored* belongs to the
 * app — `apps/frontend` keeps it in its `ThemeContext` alongside the sudo
 * toggle, `apps/admin` in its own. Passing it through a context rather than
 * importing an app hook is what lets `FlightListEntry` be shared at all.
 */
export interface TimezoneSetting {
  timezone: TimezonePreference
  setTimezone: (timezone: TimezonePreference) => void
}

const TimezoneContext = createContext<TimezoneSetting | undefined>(undefined)

export const TimezoneProvider = TimezoneContext.Provider

export function useTimezone() {
  const setting = useContext(TimezoneContext)
  if (!setting) {
    throw new Error(
      'No TimezoneProvider found. Wrap the app in <TimezoneProvider value={{ timezone, setTimezone }}> — see apps/frontend/src/App.tsx.',
    )
  }
  return { ...timezoneFormatters(setting.timezone), setTimezone: setting.setTimezone }
}
