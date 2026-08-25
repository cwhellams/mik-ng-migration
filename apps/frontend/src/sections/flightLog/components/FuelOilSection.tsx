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
  Divider,
  FormControlLabel,
  FormHelperText,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { Control, useController } from 'react-hook-form'

import { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import {
  LiquidType,
  type LinkableRecordsResponse,
  type LiquidRecordListResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
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
  /** See FuelOilSection's own `variant` doc. */
  variant: 'card' | 'plain'
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
  variant,
}: RowProps) {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()
  const isSubmitted = useIsFormSubmitted(control)
  const [dialog, setDialog] = useState<'create' | 'link'>()
  const { mutation } = useApi<LiquidRecordWithLock>({
    url: endpoints.liquid.records,
    skipFetch: true,
  })

  const isLive = flightId != null
  const isPlain = variant === 'plain'
  const fieldName = liquidType === LiquidType.FUEL ? upliftField.fuel : upliftField.oil
  const legacyLabelKey =
    liquidType === LiquidType.FUEL ? 'flightLog.fuelUpliftLitres' : 'flightLog.oilUpliftLitres'
  const rowLabelKey =
    liquidType === LiquidType.FUEL ? 'flightLog.liquid.fuelLabel' : 'flightLog.liquid.oilLabel'
  const noneAddedKey =
    liquidType === LiquidType.FUEL ? 'flightLog.noFuelAdded' : 'flightLog.noOilAdded'
  const addedQuestionKey =
    liquidType === LiquidType.FUEL
      ? 'flightLog.wizard.question.fuelAdded'
      : 'flightLog.wizard.question.oilAdded'

  const {
    field,
    fieldState: { error, isDirty },
  } = useController({ name: fieldName, control })

  const isNoneAdded = field.value === 0
  const isResolvedFromHistory =
    field.value != null && field.value !== 0 && linkedRecords.length === 0
  const showError = shouldShowFieldError(error, isDirty, isSubmitted)
  const hasAnyLinked = isLive && linkedRecords.length > 0

  // Once one record is already linked, Add/Link is for bundling a second,
  // separate fuelling/oil-add onto the same flight (intentionally allowed —
  // see the file doc comment) rather than resolving the row for the first
  // time, so the buttons say so instead of repeating "Add fuel"/"Add oil".
  const addKey = hasAnyLinked
    ? liquidType === LiquidType.FUEL
      ? 'flightLog.liquid.addAnotherFuel'
      : 'flightLog.liquid.addAnotherOil'
    : liquidType === LiquidType.FUEL
      ? 'flightLog.liquid.addFuel'
      : 'flightLog.liquid.addOil'
  const linkExistingKey = hasAnyLinked
    ? 'flightLog.liquid.linkAdditional'
    : 'flightLog.liquid.linkExisting'

  // The wizard's toggle-button "did you add fuel/oil?" question needs its own
  // yes/no/unanswered state distinct from the field value: "yes, but nothing
  // picked yet" and "unanswered" are both `field.value === null`, and only
  // this local state tells them apart so the buttons stay hidden until the
  // member actually says yes. Seeded once from whatever's already resolved
  // (a restored draft, or an existing flight being edited), same idea as
  // NightIfrStep's `nightOrIfr`.
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(() =>
    isNoneAdded ? 'no' : pendingRecord ? 'yes' : null,
  )

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
    // The "link additional" suggestions list is cached per aircraft+liquidType
    // (revalidateIfStale: false, so it survives the dialog closing) — without
    // this it would keep offering a record just linked, since nothing else
    // re-fetches it once it's no longer eligible.
    void suggestions.mutate()
  }

  const unlinkLive = async (record: LiquidRecordWithLock) => {
    await mutation.trigger('POST', {}, absolute(endpoints.liquid.unlinkRecord(record.recordId)))
    onRecordsChanged()
    // Symmetric with linkLive: an unlinked record becomes eligible again.
    void suggestions.mutate()
  }

  const setNoneAdded = (none: boolean) => {
    field.onChange(none ? 0 : null)
    if (none) onPendingRecordChange(undefined)
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

  const showPicker = hasAnyLinked || (isPlain ? answer === 'yes' : !isNoneAdded)

  return (
    <Box>
      <Typography
        variant='subtitle2'
        color={disabled ? 'text.disabled' : 'text.primary'}
        sx={{ fontWeight: 700, mb: isPlain ? 1.5 : 0.5 }}
      >
        {t(rowLabelKey)}
        {!isPlain && (
          <Box component='span' sx={{ color: 'error.main' }}>
            {' *'}
          </Box>
        )}
      </Typography>

      {!hasAnyLinked &&
        (isPlain ? (
          <Stack spacing={2} sx={{ alignItems: 'center' }}>
            <Typography variant='body2' sx={{ color: 'text.secondary', textAlign: 'center' }}>
              {t(addedQuestionKey)}
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={answer}
              disabled={disabled}
              onChange={(_, value: 'yes' | 'no' | null) => {
                if (value === null) return
                setAnswer(value)
                setNoneAdded(value === 'no')
              }}
              size='large'
            >
              <ToggleButton value='yes' sx={{ minWidth: 120, minHeight: 56 }}>
                {t('common.yes')}
              </ToggleButton>
              <ToggleButton value='no' sx={{ minWidth: 120, minHeight: 56 }}>
                {t('common.no')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        ) : (
          <FormControlLabel
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
        ))}

      {hasAnyLinked && (
        <Stack spacing={1} sx={{ mb: 1 }}>
          {linkedRecords.map((record) => (
            <Stack
              key={record.recordId}
              direction='row'
              spacing={1}
              sx={{
                alignItems: 'center',
                bgcolor: 'action.hover',
                borderRadius: 1,
                px: 1.5,
                py: 1,
              }}
            >
              <Icon icon={liquidType === LiquidType.FUEL ? 'mdi:fuel' : 'mdi:oil'} color='green' />
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant='body2'>{describeRecord(record, t)}</Typography>
                <Typography variant='caption' color='text.secondary'>
                  {formatDateTime(record.recordedAt)}
                </Typography>
              </Box>
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

      {showPicker && (
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
                {t(linkExistingKey)}
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

      <Dialog open={dialog === 'link'} onClose={() => setDialog(undefined)} fullWidth maxWidth='sm'>
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
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant='body2'>{describeRecord(record, t)}</Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {formatDateTime(record.recordedAt)}
                    </Typography>
                  </Box>
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
  /**
   * 'card' (default) draws its own outlined card with a heading, for the
   * classic form's long page of otherwise-unframed sections. The wizard's
   * WizardShell already frames every step (its own title bar, its own page
   * padding), so a second nested card there just doubled the padding and
   * repeated the title — 'plain' drops both and matches the bare, gap-only
   * layout every other wizard step uses.
   */
  variant?: 'card' | 'plain'
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
  variant = 'card',
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

  const rows = (
    <>
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
        variant={variant}
      />
      <Divider />
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
        variant={variant}
      />
    </>
  )

  if (variant === 'plain') {
    return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{rows}</Box>
  }

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1 }}>
        {t('flightLog.fuelInfo')}
      </Typography>
      <Stack spacing={2}>{rows}</Stack>
    </Paper>
  )
}
