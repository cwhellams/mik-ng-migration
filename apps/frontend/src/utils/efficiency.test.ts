import { describe, expect, it } from 'vitest'

import { efficiencyColor, formatEfficiency } from './efficiency'

describe('formatEfficiency', () => {
  it('should show one decimal place', () => {
    expect(formatEfficiency(83.333)).toBe('83.3%')
    expect(formatEfficiency(0)).toBe('0.0%')
  })

  it('should show a dash when there is nothing to report', () => {
    expect(formatEfficiency(null)).toBe('—')
    expect(formatEfficiency(undefined)).toBe('—')
  })
})

describe('efficiencyColor', () => {
  it.each([
    [100, 'success'],
    [75, 'success'],
    [74.9, 'warning'],
    [50, 'warning'],
    [49.9, 'error'],
    [0, 'error'],
  ])('should colour %s%% as %s', (pct, expected) => {
    expect(efficiencyColor(pct)).toBe(expected)
  })

  it('should stay neutral when there is no figure', () => {
    expect(efficiencyColor(null)).toBe('default')
  })
})
