import type { Finding } from '@mik/contracts/findings'

/**
 * Where a finding sits in the paper logbook, for the "OH-STL · book 3" line
 * beside each description. A remark on a flight whose logbook page is unknown
 * shows the registration alone rather than a dangling separator.
 *
 * Its own module rather than a fourth export of `findingKinds.tsx`: mixing a
 * plain function in with components there breaks Fast Refresh, which the lint
 * config warns about.
 */
export const findingLocation = (finding: Finding, bookLabel: string): string =>
  finding.ajlbSeqNo == null
    ? finding.aircraftRegistration
    : `${finding.aircraftRegistration} · ${bookLabel}`
