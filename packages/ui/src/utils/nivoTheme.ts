export type ColourMode = 'light' | 'dark'

/**
 * The nivo chart theme both apps' statistics charts render with (see #894).
 *
 * A pure function of the colour mode rather than a hook, because the two apps
 * disagree about where that mode lives: `apps/frontend` swaps whole MUI themes
 * so `palette.mode` tracks its toggle, while `apps/admin` builds one static
 * theme and keeps the mode only in its own context. Reading MUI's palette here
 * would therefore work in one app and silently pin the other to light.
 *
 * Each app keeps a three-line `useNivoTheme` that memoises this against
 * whatever it calls its mode.
 */
export const nivoTheme = (mode: ColourMode) => ({
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
})
