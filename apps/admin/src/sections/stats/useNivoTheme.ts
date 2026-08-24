import { useMemo } from 'react'
import { nivoTheme } from '@mik/ui/utils/nivoTheme'

import { useThemeMode } from '../../theme/ThemeContext'

/**
 * The shared nivo chart theme (`@mik/ui`), bound to this app's colour mode.
 *
 * Only the binding is app-local — see the note on `nivoTheme` for why the mode
 * cannot simply be read off MUI's palette in both apps.
 */
export const useNivoTheme = () => {
  const { mode } = useThemeMode()

  return useMemo(() => nivoTheme(mode), [mode])
}
