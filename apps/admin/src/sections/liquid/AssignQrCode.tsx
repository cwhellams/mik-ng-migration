import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { Icon } from '@iconify/react'

import { QrTargetType, type AssignQrCodeRequest, type QrCode } from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { absolute } from '../../api/endpoints'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'

interface QrTargetsResponse {
  oilCanisters: { targetId: string; label: string }[]
  fuelStations: { targetId: string; label: string }[]
}

/**
 * Pointing a freshly printed QR code at something, for good.
 *
 * Reached two ways — from this admin console's code list, and by a liquid
 * admin scanning an unassigned sticker with their phone, which lands on the
 * member app's own `/liquid/scan/:code` with nothing else on screen. That
 * second path is why `apps/frontend/src/sections/liquid/AssignQrCode.tsx` is
 * a duplicate of this file rather than a shared import: the two apps are
 * independent bundles, and this component is small enough that keeping two
 * copies in step is cheaper than routing the scan flow through this app.
 *
 * The warning is not decoration. The sticker is physically on the object, so a
 * reassignment would send every future scan to the wrong canister — refused by
 * the API and again by a database trigger, with no way to undo a mistake but to
 * print a new code.
 */
export function AssignQrCode({ qr, onAssigned }: { qr: QrCode; onAssigned?: () => void }) {
  const { t } = useTranslation()
  const [targetType, setTargetType] = useState<QrTargetType>(QrTargetType.OIL_CANISTER)
  const [targetId, setTargetId] = useState('')
  const [assignError, setAssignError] = useState<string>()
  const [assigned, setAssigned] = useState<QrCode>()

  const targetsApi = useApi<QrTargetsResponse>({
    url: 'v1/liquid/qr/targets',
    alwaysSudo: true,
  })
  const { mutation } = useApi<QrCode>({ url: 'v1/liquid/qr', skipFetch: true })

  const options =
    targetType === QrTargetType.OIL_CANISTER
      ? (targetsApi.data?.oilCanisters ?? [])
      : (targetsApi.data?.fuelStations ?? [])

  const handleAssign = async () => {
    setAssignError(undefined)
    const payload: AssignQrCodeRequest = { targetType, targetId }
    const { data, error } = await mutation.trigger(
      'POST',
      payload,
      absolute(`v1/liquid/qr/${encodeURIComponent(qr.code)}/assign`),
    )
    if (error || !data) {
      setAssignError(error?.detail ?? t('general.savingError'))
      return
    }
    setAssigned(data)
    onAssigned?.()
  }

  if (assigned) {
    return (
      <Stack spacing={2}>
        <Title label={t('liquid.admin.qr.assignedTitle')} />
        <Alert severity='success' icon={<Icon icon='mdi:check-circle-outline' />}>
          {t('liquid.admin.qr.assignedTo', {
            code: assigned.code,
            target: assigned.targetLabel ?? assigned.targetId,
          })}
        </Alert>
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Title label={t('liquid.admin.qr.assignTitle')} />
      <Paper sx={{ p: 3 }}>
        <RemoteContent isLoading={targetsApi.isLoading} error={targetsApi.error}>
          <Stack spacing={2}>
            <Typography variant='h6'>{qr.code}</Typography>

            <Alert severity='warning' icon={<Icon icon='mdi:alert-outline' />}>
              {t('liquid.admin.qr.permanentWarning')}
            </Alert>

            {assignError && <Alert severity='error'>{assignError}</Alert>}

            <TextField
              select
              label={t('liquid.admin.qr.targetType')}
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as QrTargetType)
                // The previous selection belongs to the other list.
                setTargetId('')
              }}
            >
              <MenuItem value={QrTargetType.OIL_CANISTER}>
                {t('liquid.admin.qr.targetOilCanister')}
              </MenuItem>
              <MenuItem value={QrTargetType.FUEL_STATION}>
                {t('liquid.admin.qr.targetFuelStation')}
              </MenuItem>
            </TextField>

            {options.length === 0 ? (
              <Alert severity='info'>
                {targetType === QrTargetType.OIL_CANISTER
                  ? t('liquid.admin.qr.noCanistersToAssign')
                  : t('liquid.admin.qr.noStationsToAssign')}
              </Alert>
            ) : (
              <TextField
                select
                label={t('liquid.admin.qr.target')}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {options.map((option) => (
                  <MenuItem key={option.targetId} value={option.targetId}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Button
              variant='contained'
              color='warning'
              disabled={!targetId || mutation.isMutating}
              startIcon={<Icon icon='mdi:link-variant' />}
              onClick={() => void handleAssign()}
              sx={{ alignSelf: 'flex-start' }}
            >
              {t('liquid.admin.qr.assignPermanently')}
            </Button>
          </Stack>
        </RemoteContent>
      </Paper>
    </Stack>
  )
}
