import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Stack,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { Control, Controller } from 'react-hook-form'

import { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import {
  LiquidType,
  type LinkableRecordsResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { endpoints } from '../../../api/endpoints'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { shouldShowFieldError } from '../../../utils/formErrors'
import { LiquidReportForm } from '../../liquid/LiquidReportForm'
import { describeRecord } from '../../liquid/liquidHelpers'

/**
 * Replaces the old bare-number `FuelUplift`/`OilUplift` fields (#1119
 * follow-up): a new flight log can no longer report fuel/oil as a typed-in
 * litre count. It must either link an already-reported record, create one on
 * the spot, or say explicitly that none was added.
 *
 * A flight already carrying a legacy litres figure (from before this change)
 * keeps showing it, read-only — that number is history, not something this
 * form writes any more.
 *
 * Linking here doesn't call the API immediately: a brand new flight has no
 * `flightLogId` yet, so the record is only *picked* (or freshly created,
 * unlinked) here, and the caller links it to the real flight id once the
 * flight log itself has been saved.
 */

const upliftField = { fuel: 'fuelUpliftLitres', oil: 'oilUpliftLitres' } as const

interface Props {
  liquidType: LiquidType
  control: Control<FlightLogUpsertRequest>
  disabled?: boolean
  aircraftRegistration?: string
  pendingRecord?: LiquidRecordWithLock
  onPendingRecordChange: (record: LiquidRecordWithLock | undefined) => void
  // The mobile wizard already has this field's step title on screen (via
  // WizardShell), so repeating "Fuel Uplift (litres) *" here would be redundant.
  hideLabel?: boolean
}

export function LiquidUpliftField({
  liquidType,
  control,
  disabled,
  aircraftRegistration,
  pendingRecord,
  onPendingRecordChange,
  hideLabel,
}: Props) {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)
  const [dialog, setDialog] = useState<'create' | 'link'>()

  const fieldName = liquidType === LiquidType.FUEL ? upliftField.fuel : upliftField.oil
  const labelKey =
    liquidType === LiquidType.FUEL ? 'flightLog.fuelUpliftLitres' : 'flightLog.oilUpliftLitres'
  const noneAddedKey =
    liquidType === LiquidType.FUEL ? 'flightLog.noFuelAdded' : 'flightLog.noOilAdded'
  const addKey =
    liquidType === LiquidType.FUEL ? 'flightLog.liquid.addFuel' : 'flightLog.liquid.addOil'

  const suggestions = useApi<LinkableRecordsResponse>(
    {
      url: endpoints.liquid.linkableRecords,
      params: { aircraftRegistration, liquidType },
      skipFetch: dialog !== 'link' || !aircraftRegistration,
    },
    { revalidateIfStale: false },
  )

  return (
    <Controller
      name={fieldName}
      control={control}
      render={({ field, fieldState: { error, isDirty } }) => {
        const isNoneAdded = field.value === 0
        const isResolvedFromHistory = field.value != null && field.value !== 0 && !pendingRecord
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)

        if (isResolvedFromHistory) {
          return (
            <Box>
              <Typography variant='body2' color='text.secondary'>
                {t(labelKey)}: {field.value} l
              </Typography>
              <Typography variant='caption' color='text.disabled'>
                {t('flightLog.liquid.legacyRecord')}
              </Typography>
            </Box>
          )
        }

        const setNoneAdded = (checked: boolean) => {
          field.onChange(checked ? 0 : null)
          if (checked) onPendingRecordChange(undefined)
        }

        const choose = (record: LiquidRecordWithLock) => {
          onPendingRecordChange(record)
          field.onChange(null)
          setDialog(undefined)
        }

        return (
          <Box>
            <Stack
              direction='row'
              sx={{
                alignItems: 'center',
                justifyContent: hideLabel ? 'center' : 'space-between',
                flexWrap: 'wrap',
              }}
            >
              {!hideLabel && (
                <Typography
                  variant='body2'
                  color={disabled ? 'text.disabled' : 'text.primary'}
                  gutterBottom
                >
                  {t(labelKey)}
                  <Box component='span' sx={{ color: 'error.main' }}>
                    {' *'}
                  </Box>
                </Typography>
              )}
              <FormControlLabel
                sx={{ mr: 0 }}
                control={
                  <Checkbox
                    size='small'
                    checked={isNoneAdded}
                    disabled={disabled}
                    onChange={(e) => setNoneAdded(e.target.checked)}
                  />
                }
                label={t(noneAddedKey)}
              />
            </Stack>

            {!isNoneAdded && (
              <>
                {pendingRecord ? (
                  <Chip
                    icon={<Icon icon={liquidType === LiquidType.FUEL ? 'mdi:fuel' : 'mdi:oil'} />}
                    label={describeRecord(pendingRecord, t)}
                    onDelete={disabled ? undefined : () => onPendingRecordChange(undefined)}
                  />
                ) : (
                  <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Button
                      size='small'
                      variant='outlined'
                      disabled={disabled}
                      startIcon={<Icon icon='mdi:plus' />}
                      onClick={() => setDialog('create')}
                    >
                      {t(addKey)}
                    </Button>
                    <Button
                      size='small'
                      disabled={disabled || !aircraftRegistration}
                      startIcon={<Icon icon='mdi:link-variant' />}
                      onClick={() => setDialog('link')}
                    >
                      {t('flightLog.liquid.linkExisting')}
                    </Button>
                  </Stack>
                )}
              </>
            )}
            {showError && <FormHelperText error>{error?.message}</FormHelperText>}

            <Dialog
              open={dialog === 'create'}
              onClose={() => setDialog(undefined)}
              fullWidth
              maxWidth='md'
            >
              <DialogContent>
                <LiquidReportForm
                  // No banner text: unlike a QR scan or the flight-log-linked
                  // create dialog (which names the flight), this happens
                  // before the flight itself is saved, so there is nothing to
                  // name yet beyond the aircraft already prefilled below.
                  prefill={{ liquidType, aircraftRegistration, label: '' }}
                  onSaved={(record) => choose(record)}
                />
              </DialogContent>
            </Dialog>

            <Dialog
              open={dialog === 'link'}
              onClose={() => setDialog(undefined)}
              fullWidth
              maxWidth='sm'
            >
              <DialogTitle>{t('flightLog.liquid.linkTitle')}</DialogTitle>
              <DialogContent>
                {(suggestions.data?.records ?? []).length === 0 ? (
                  <Alert severity='info'>
                    {t('flightLog.liquid.noSuggestions', { aircraft: aircraftRegistration })}
                  </Alert>
                ) : (
                  <Stack spacing={1} sx={{ pt: 1 }}>
                    {(suggestions.data?.records ?? []).map((record) => (
                      <Stack
                        key={record.recordId}
                        direction='row'
                        spacing={1}
                        sx={{ alignItems: 'center' }}
                      >
                        <Typography variant='body2' sx={{ flexGrow: 1 }}>
                          {describeRecord(record, t)}
                        </Typography>
                        <Button size='small' onClick={() => choose(record)}>
                          {t('flightLog.liquid.link')}
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </DialogContent>
            </Dialog>
          </Box>
        )
      }}
    />
  )
}
