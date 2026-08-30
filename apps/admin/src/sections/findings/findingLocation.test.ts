import { describe, expect, it } from 'vitest'

import { aFinding } from './findingFixtures'
import { findingLocation } from './findingLocation'

/**
 * The kind and status chips this file used to cover moved to
 * `@mik/ui/components/FindingChips` -- both apps render them unchanged, and
 * their tests moved with them.
 */
describe('findingLocation', () => {
  it('names the aircraft and its logbook', () => {
    expect(findingLocation(aFinding(), 'book 3')).toBe('OH-STL \u00b7 book 3')
  })

  it('names the aircraft alone when the logbook page is unknown', () => {
    // Otherwise the row ends in a dangling separator.
    expect(findingLocation(aFinding({ ajlbSeqNo: null }), 'book ')).toBe('OH-STL')
  })
})
