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
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { Control, Controller } from 'react-hook-form'

import { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import {
  LiquidType,
  type LinkableRecordsResponse,
  type LiquidRecordListResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { absolute, endpoints } from '../../../api/endpoints'
import { useIsFormSubmitted } from '../../../hooks/useIsFormSubmitted'
import { shouldShowFieldError } from '../../../utils/formErrors'
import { LiquidReportForm } from '../../liquid/LiquidReportForm'
import { describeRecord } from '../../liquid/liquidHelpers'

/**
 * One card for both liquids on a flight log (#1119 follow-up, and the #1119
 * cleanup that unified this with the old LiquidRecordsSection). A flight can no
 * longer report fuel/oil as a typed-in litre count: each row must link an
 * already-reported record, create one on the spot, or say explicitly that none
 * was added.
 *
 * A brand new flight has no `flightId` yet, so a pick is only staged locally
 * here (`pendingFuelRecord`/`pendingOilRecord`) and the caller links it to the
 * real flight id once the flight itself has been saved (see doSave in
 * FlightLogEntry.tsx / FlightLogEntryWizard.tsx). Once `flightId` is supplied
 * (editing an existing flight), each row instead fetches and manages the real
 * linked record(s) directly — add/link/unlink all take effect immediately.
 *
 * A flight already carrying a legacy litres figure (from before this change)
 * keeps showing it, read-only — that number is history, not something this
 * form writes any more.
 */

const upliftField = { fuel: 'fuelUpliftLitres', oil: 'oilUpliftLitres' } as const

interface RowProps {
  liquidType: LiquidType
  control: Control<FlightLogUpsertRequest>
  disabled?: boolean
  aircraftRegistration?: string
  flightId?: string
  linkedRecords: LiquidRecordWithLock[]
  onRecordsChanged: () => void
  pendingRecord?: LiquidRecordWithLock
  onPendingRecordChange: (record: LiquidRecordWithLock | undefined) => void
}

function LiquidTypeRow({
  liquidType,
  control,
  disabled,
  aircraftRegistration,
  flightId,
  linkedRecords,
  onRecordsChanged,
  pendingRecord,
  onPendingRecordChange,
}: RowProps) {
  const { t } = useTranslation()
  const isSubmitted = useIsFormSubmitted(control)
  const [dialog, setDialog] = useState<'create' | 'link'>()
  const { mutation } = useApi<LiquidRecordWithLock>({
    url: endpoints.liquid.records,
    skipFetch: true,
  })

  const isLive = flightId != null
  const fieldName = liquidType === LiquidType.FUEL ? upliftField.fuel : upliftField.oil
  const legacyLabelKey =
    liquidType === LiquidType.FUEL ? 'flightLog.fuelUpliftLitres' : 'flightLog.oilUpliftLitres'
  const rowLabelKey =
    liquidType === LiquidType.FUEL ? 'flightLog.liquid.fuelLabel' : 'flightLog.liquid.oilLabel'
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

  const linkLive = async (record: LiquidRecordWithLock) => {
    await mutation.trigger(
      'POST',
      { flightLogId: flightId },
      absolute(endpoints.liquid.linkRecord(record.recordId)),
    )
    setDialog(undefined)
    onRecordsChanged()
  }

  const unlinkLive = async (record: LiquidRecordWithLock) => {
    await mutation.trigger('POST', {}, absolute(endpoints.liquid.unlinkRecord(record.recordId)))
    onRecordsChanged()
  }

  return (
    <Controller
      name={fieldName}
      control={control}
      render={({ field, fieldState: { error, isDirty } }) => {
        const isNoneAdded = field.value === 0
        const isResolvedFromHistory =
          field.value != null && field.value !== 0 && linkedRecords.length === 0
        const showError = shouldShowFieldError(error, isDirty, isSubmitted)
        const hasAnyLinked = isLive && linkedRecords.length > 0

        if (isResolvedFromHistory) {
          return (
            <Box>
              <Typography variant='body2' color='text.secondary'>
                {t(legacyLabelKey)}: {field.value} l
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
          if (isLive) {
            void linkLive(record)
            return
          }
          onPendingRecordChange(record)
          field.onChange(null)
          setDialog(undefined)
        }

        return (
          <Box>
            <Stack
              direction='row'
              sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
            >
              <Typography
                variant='body2'
                color={disabled ? 'text.disabled' : 'text.primary'}
                gutterBottom
              >
                {t(rowLabelKey)}
                <Box component='span' sx={{ color: 'error.main' }}>
                  {' *'}
                </Box>
              </Typography>
              {!hasAnyLinked && (
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
              )}
            </Stack>

            {hasAnyLinked && (
              <Stack spacing={0.5} sx={{ mb: 1 }}>
                {linkedRecords.map((record) => (
                  <Stack
                    key={record.recordId}
                    direction='row'
                    spacing={1}
                    sx={{ alignItems: 'center' }}
                  >
                    <Icon icon={liquidType === LiquidType.FUEL ? 'mdi:fuel' : 'mdi:oil'} />
                    <Typography variant='body2' sx={{ flexGrow: 1 }}>
                      {describeRecord(record, t)}
                    </Typography>
                    {record.expenseClaimId && (
                      <Chip size='small' color='primary' label={t('liquid.myRecords.claimed')} />
                    )}
                    {/* Detaching is only offered while the record is still the
                        member's to change — a claimed or validated one is locked. */}
                    {!disabled && record.lock.canEdit && (
                      <IconButton
                        size='small'
                        onClick={() => void unlinkLive(record)}
                        aria-label={t('flightLog.liquid.unlink')}
                      >
                        <Icon icon='mdi:link-variant-off' />
                      </IconButton>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}

            {!isNoneAdded && (
              <>
                {!isLive && pendingRecord ? (
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
                  // No banner text: unlike a QR scan (which names the flight), a
                  // pending pick happens before the flight itself is saved, so
                  // there is nothing to name yet beyond the aircraft prefilled
                  // below. A live pick does have a flightId and is created
                  // already linked, same as the old LiquidRecordsSection.
                  prefill={{ liquidType, aircraftRegistration, label: '' }}
                  flightLogId={flightId}
                  onSaved={(record) => {
                    if (isLive) {
                      setDialog(undefined)
                      onRecordsChanged()
                    } else {
                      choose(record)
                    }
                  }}
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

interface Props {
  control: Control<FlightLogUpsertRequest>
  disabled?: boolean
  aircraftRegistration?: string
  /** Present once the flight itself has been saved — enables live link/unlink. */
  flightId?: string
  pendingFuelRecord?: LiquidRecordWithLock
  pendingOilRecord?: LiquidRecordWithLock
  onPendingFuelRecordChange: (record: LiquidRecordWithLock | undefined) => void
  onPendingOilRecordChange: (record: LiquidRecordWithLock | undefined) => void
}

export function FuelOilSection({
  control,
  disabled,
  aircraftRegistration,
  flightId,
  pendingFuelRecord,
  pendingOilRecord,
  onPendingFuelRecordChange,
  onPendingOilRecordChange,
}: Props) {
  const { t } = useTranslation()

  const { data, mutate } = useApi<LiquidRecordListResponse>({
    url: endpoints.liquid.records,
    params: { flightLogId: flightId },
    skipFetch: !flightId,
  })
  const records = (data?.records ?? []).filter((r) => r.flightLogId === flightId)
  const fuelRecords = records.filter((r) => r.liquidType === LiquidType.FUEL)
  const oilRecords = records.filter((r) => r.liquidType === LiquidType.OIL)

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1 }}>
        {t('flightLog.fuelInfo')}
      </Typography>
      <Stack spacing={2}>
        <LiquidTypeRow
          liquidType={LiquidType.FUEL}
          control={control}
          disabled={disabled}
          aircraftRegistration={aircraftRegistration}
          flightId={flightId}
          linkedRecords={fuelRecords}
          onRecordsChanged={() => void mutate()}
          pendingRecord={pendingFuelRecord}
          onPendingRecordChange={onPendingFuelRecordChange}
        />
        <LiquidTypeRow
          liquidType={LiquidType.OIL}
          control={control}
          disabled={disabled}
          aircraftRegistration={aircraftRegistration}
          flightId={flightId}
          linkedRecords={oilRecords}
          onRecordsChanged={() => void mutate()}
          pendingRecord={pendingOilRecord}
          onPendingRecordChange={onPendingOilRecordChange}
        />
      </Stack>
    </Paper>
  )
}
