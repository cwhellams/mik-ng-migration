import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { FlightLogUpsertRequest } from '@mik/contracts/flight-log'

import {
  buildOccurrencePrefill,
  hasNewSafetyContent,
  type OccurrencePrefill,
  type OccurrencePrefillState,
  type SafetyContent,
} from './safetyOccurrence'

interface SafetyPromptArgs {
  /** The flight as just saved — a brand new entry only has an id at this point. */
  sourceFlightId: string
  flight: Pick<
    FlightLogUpsertRequest,
    'aircraftRegistration' | 'departureAirport' | 'arrivalAirport' | 'offBlockTimeEpoch'
  >
  content: SafetyContent
}

/**
 * Asks "was safety affected?" once a flight log entry carrying a remark, defect or
 * observation has been saved (#1225), and — on yes — hands that flight's own data to
 * a pre-filled occurrence report so the pilot doesn't retype it.
 *
 * Deliberately *not* built on usePendingConfirm like useDefectGroundingConfirm and
 * useOverlapCheck are: those gate a save that hasn't happened yet, and run the same
 * pending action on confirm. Here the save has already succeeded, and the two answers
 * lead to different places — no goes where the save was always going, yes diverts to
 * the occurrence form instead.
 */
export function useSafetyReportPrompt() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [prefill, setPrefill] = useState<OccurrencePrefill | undefined>(undefined)
  // Where the save was headed had there been nothing to ask about — navigating back to
  // the logbook, or closing the wizard. Runs on "no", and on a plain dismissal.
  const proceedRef = useRef<(() => void) | null>(null)

  const withSafetyPrompt = (
    { sourceFlightId, flight, content }: SafetyPromptArgs,
    proceed: () => void,
  ) => {
    if (!hasNewSafetyContent(content)) {
      proceed()
      return
    }
    proceedRef.current = proceed
    setPrefill(
      buildOccurrencePrefill(sourceFlightId, flight, content, {
        defect: t('flightLog.safetyPrompt.defectLabel'),
        remark: t('flightLog.safetyPrompt.remarkLabel'),
      }),
    )
  }

  const decline = () => {
    setPrefill(undefined)
    proceedRef.current?.()
    proceedRef.current = null
  }

  const accept = () => {
    const accepted = prefill
    setPrefill(undefined)
    // The pilot is going to the occurrence form instead of wherever the save was
    // headed, so the pending action is dropped rather than run.
    proceedRef.current = null
    if (accepted) {
      navigate('/logs/occurrences/new', {
        state: { occurrencePrefill: accepted } satisfies OccurrencePrefillState,
      })
    }
  }

  return {
    withSafetyPrompt,
    safetyPromptProps: { open: !!prefill, prefill, onClose: decline, onConfirm: accept },
  }
}
