import type { FlightLogUpsertRequest } from '@mik/contracts/flight-log'

/**
 * The flight data carried from a just-saved flight log entry into a pre-filled
 * occurrence report (#1225). Handed over in the router's `location.state` under
 * `occurrencePrefill`, never persisted server-side: nothing is written until the
 * pilot reviews the pre-filled form and submits it through the normal
 * `POST /v1/occurrences` flow.
 */
export interface OccurrencePrefill {
  /**
   * The flight this prefill was built from. Identity, not payload: the occurrence
   * form's own autosaved draft records it so a *later* handoff (a different flight)
   * is recognised as such and replaces the draft, rather than being overwritten by
   * the stale one — see OccurrenceEntry.
   */
  sourceFlightId: string
  occurrenceDate: string
  aircraftRegistration: string
  departureAirport: string | null
  arrivalAirport: string | null
  description: string
}

/** What the router carries in `location.state` when arriving from a flight log entry. */
export interface OccurrencePrefillState {
  occurrencePrefill: OccurrencePrefill
}

export const readOccurrencePrefill = (state: unknown): OccurrencePrefill | undefined => {
  if (typeof state !== 'object' || state === null) return undefined
  const prefill = (state as Partial<OccurrencePrefillState>).occurrencePrefill
  return prefill && typeof prefill === 'object' ? prefill : undefined
}

const nonBlank = (values: string[]) => values.map((v) => v.trim()).filter((v) => v.length > 0)

export interface SafetyContent {
  /**
   * The general-purpose remark field, shared with admins — explicitly *not*
   * `personalRemarks`, which belongs to the member being billed (#1225).
   */
  incidentOrObservations?: string | null
  /**
   * What `incidentOrObservations` held before this save. Only meaningful when
   * editing: a pilot who reopens an entry to fix its fuel figures must not be asked
   * again about a remark they wrote (and were already asked about) days ago.
   */
  previousIncidentOrObservations?: string | null
  /** Defects reported alongside this submission. Always new — existing ones live elsewhere. */
  reportedDefects?: string[]
  /** Remarks reported alongside this submission (#1226). Always new, same as defects. */
  reportedRemarks?: string[]
}

/**
 * Whether this submission introduced something a safety report might need to cover:
 * a newly written incident/observation remark, or any defect or remark reported with
 * it. Answering the issue's own scoping — any one of the three is enough, and
 * `personalRemarks` is never one of them.
 */
export const hasNewSafetyContent = ({
  incidentOrObservations,
  previousIncidentOrObservations,
  reportedDefects = [],
  reportedRemarks = [],
}: SafetyContent): boolean => {
  if (nonBlank(reportedDefects).length > 0 || nonBlank(reportedRemarks).length > 0) return true
  const current = incidentOrObservations?.trim() ?? ''
  if (current.length === 0) return false
  return current !== (previousIncidentOrObservations?.trim() ?? '')
}

export interface SafetyDescriptionLabels {
  defect: string
  remark: string
}

/**
 * Seeds the occurrence report's description with everything the pilot already wrote
 * on the flight log, so the same account isn't typed twice. Labelled per source,
 * since a defect and a free-text observation read very differently to the safety team.
 */
export const buildSafetyDescription = (
  { incidentOrObservations, reportedDefects = [], reportedRemarks = [] }: SafetyContent,
  labels: SafetyDescriptionLabels,
): string =>
  [
    incidentOrObservations?.trim() ?? '',
    ...nonBlank(reportedDefects).map((d) => `${labels.defect}: ${d}`),
    ...nonBlank(reportedRemarks).map((r) => `${labels.remark}: ${r}`),
  ]
    .filter((line) => line.length > 0)
    .join('\n\n')

export const buildOccurrencePrefill = (
  sourceFlightId: string,
  flight: Pick<
    FlightLogUpsertRequest,
    'aircraftRegistration' | 'departureAirport' | 'arrivalAirport' | 'offBlockTimeEpoch'
  >,
  content: SafetyContent,
  labels: SafetyDescriptionLabels,
): OccurrencePrefill => ({
  sourceFlightId,
  // The occurrence form wants an ISO datetime; the flight log stores epoch seconds
  // as a string (BigintAsString). Off-block is the earliest of the flight's four
  // timestamps, so the pilot only ever has to move it forward.
  occurrenceDate: new Date(Number(flight.offBlockTimeEpoch) * 1000).toISOString(),
  aircraftRegistration: flight.aircraftRegistration,
  departureAirport: flight.departureAirport || null,
  arrivalAirport: flight.arrivalAirport || null,
  description: buildSafetyDescription(content, labels),
})
