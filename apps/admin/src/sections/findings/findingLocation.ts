import type { Finding } from '@mik/contracts/findings'

/**
 * Where a finding sits in the paper logbook, for the "OH-STL · book 3" line
 * beside each description. A remark on a flight whose logbook page is unknown
 * shows the registration alone rather than a dangling separator.
 *
 * A plain function in its own module rather than an export beside a component:
 * mixing the two in one file breaks Fast Refresh, which the lint config warns
 * about. The chips it used to sit next to now live in
 * `@mik/ui/components/FindingChips`, since both apps render them.
 */
export const findingLocation = (finding: Finding, bookLabel: string): string =>
  finding.ajlbSeqNo == null
    ? finding.aircraftRegistration
    : `${finding.aircraftRegistration} · ${bookLabel}`
