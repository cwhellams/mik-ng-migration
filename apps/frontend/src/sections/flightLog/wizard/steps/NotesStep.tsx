import { Box } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { FlightType } from '@mik/contracts/flight-log'
import type { Defect } from '@mik/contracts/defects'
import type { Remark } from '@mik/contracts/remarks'
import { TxtField } from '../../components/TxtField'
import { DefectsAndRemarksSection } from '../../components/DefectsAndRemarksSection'
import type { WizardFormProps } from '../types'

interface Props extends WizardFormProps {
  reportedDefects: string[]
  onReportedDefectsChange: (descriptions: string[]) => void
  // The flight this defect would be tied to must still be unvalidated, mirroring the
  // backend's own rule (see apps/backend/src/routes/defects/api.ts) -- hidden rather
  // than shown-then-rejected once a flight has been validated.
  canReportDefects: boolean
  // Defects already tied to this flight (flightId) from a previous save --
  // shown so editing an existing entry doesn't hide what's already reported.
  existingDefects: Defect[]
  aircraftRegistration?: string
  onExistingDefectsChanged: () => void
  reportedRemarks: string[]
  onReportedRemarksChange: (descriptions: string[]) => void
  // Same editability rule as canReportDefects -- a remark can only be added while
  // the flight is still unvalidated.
  canReportRemarks: boolean
  // Remarks already tied to this flight from a previous save (#1226).
  existingRemarks: Remark[]
}

export const NotesStep = ({
  control,
  watch,
  setError,
  clearErrors,
  errors,
  reportedDefects,
  onReportedDefectsChange,
  canReportDefects,
  existingDefects,
  aircraftRegistration,
  onExistingDefectsChanged,
  reportedRemarks,
  onReportedRemarksChange,
  canReportRemarks,
  existingRemarks,
}: Props) => {
  const { t } = useTranslation()
  const flightType = watch('flightType')
  const billingRemarks = watch('billingRemarks')
  const hasMandatoryBillingRemarks =
    flightType === FlightType.TEST_FLIGHT || flightType === FlightType.FERRY

  // Mirrors the classic form's rule: billing remarks are required (not admin-only) for
  // test/ferry flights, since it's not enforced by the shared zod resolver.
  useEffect(() => {
    if (hasMandatoryBillingRemarks && !billingRemarks?.trim()) {
      setError('billingRemarks', {
        type: 'manual',
        message: t('flightLog.billingRemarksRequiredForTestOrFerry'),
      })
    } else if (errors.billingRemarks?.type === 'manual') {
      clearErrors('billingRemarks')
    }
  }, [hasMandatoryBillingRemarks, billingRemarks, setError, clearErrors, errors.billingRemarks, t])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <DefectsAndRemarksSection
        reportedDefects={reportedDefects}
        onReportedDefectsChange={onReportedDefectsChange}
        canReportDefects={canReportDefects}
        existingDefects={existingDefects}
        aircraftRegistration={aircraftRegistration}
        onExistingDefectsChanged={onExistingDefectsChanged}
        reportedRemarks={reportedRemarks}
        onReportedRemarksChange={onReportedRemarksChange}
        canReportRemarks={canReportRemarks}
        existingRemarks={existingRemarks}
      />
      <TxtField
        name='incidentOrObservations'
        control={control}
        props={{ multiline: true, rows: 3, fullWidth: true }}
      />
      <TxtField
        name='personalRemarks'
        control={control}
        props={{ multiline: true, rows: 3, fullWidth: true }}
      />
      {hasMandatoryBillingRemarks && (
        <TxtField
          name='billingRemarks'
          control={control}
          props={{
            multiline: true,
            rows: 3,
            fullWidth: true,
            required: true,
            helperText: t('flightLog.billingRemarksTestOrFerryInstruction'),
          }}
        />
      )}
    </Box>
  )
}
