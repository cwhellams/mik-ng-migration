import { useMemo } from 'react'
import { useThemeMode } from '../../theme/ThemeContext'

/**
 * Shared nivo chart theme for statistics views that use this hook, keeping
 * light/dark styling consistent across charts that adopt it (see #894).
 */
export const useNivoTheme = () => {
  const { mode } = useThemeMode()

  return useMemo(
    () => ({
      axis: {
        ticks: {
          text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
          line: { stroke: mode === 'dark' ? '#888888' : '#777777' },
        },
        legend: {
          text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
        },
        domain: {
          line: { stroke: mode === 'dark' ? '#555555' : '#777777' },
        },
      },
      legends: {
        text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
      },
      tooltip: {
        container: {
          background: mode === 'dark' ? '#2a2a2a' : '#ffffff',
          color: mode === 'dark' ? '#ffffff' : '#333333',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
        },
      },
      grid: {
        line: { stroke: mode === 'dark' ? '#444444' : '#dddddd' },
      },
      labels: {
        text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
      },
    }),
    [mode],
  )
}
