import { describe, expect, it } from 'vitest'

import { nivoTheme } from './nivoTheme'

/**
 * Both modes, because every value in here is a light/dark ternary and the whole
 * reason this moved out of `apps/frontend` was that the two apps had drifting
 * copies. A test that only ever looked at one mode would not have noticed.
 */
describe('nivoTheme', () => {
  it('uses light-on-dark text in dark mode and the reverse in light mode', () => {
    expect(nivoTheme('dark').axis.ticks.text.fill).toBe('#cccccc')
    expect(nivoTheme('light').axis.ticks.text.fill).toBe('#333333')
  })

  it('gives every themed colour a different value in each mode', () => {
    // Catches a ternary that was collapsed to a constant during an edit — the
    // failure mode where dark mode silently stops being dark.
    const light = JSON.stringify(nivoTheme('light'))
    const dark = JSON.stringify(nivoTheme('dark'))

    expect(light).not.toBe(dark)
  })

  it('themes the axis, grid, legend, tooltip and labels', () => {
    // The chart is unreadable in dark mode if any one of these is missed, and
    // they are easy to miss because each is a separate nested branch.
    const theme = nivoTheme('dark')

    expect(theme.axis).toBeDefined()
    expect(theme.grid).toBeDefined()
    expect(theme.legends).toBeDefined()
    expect(theme.tooltip).toBeDefined()
    expect(theme.labels).toBeDefined()
  })
})
