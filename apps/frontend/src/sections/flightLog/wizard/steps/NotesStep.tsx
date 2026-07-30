import { Box } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { FlightType } from '@backend/routes/flight-log/models'
import { TxtField } from '../../components/TxtField'
import type { WizardFormProps } from '../types'

export const NotesStep = ({ control, watch, setError, clearErrors, errors }: WizardFormProps) => {
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
