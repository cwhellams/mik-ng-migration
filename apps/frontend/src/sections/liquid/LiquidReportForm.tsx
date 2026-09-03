import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import dayjs from 'dayjs'

import type { AircraftListResponse } from '@mik/contracts/aircrafts'
import { MIK_SUPPORTED_CURRENCIES } from '@mik/contracts/expenses'
import {
  deriveTaxIncludedAbroad,
  HOME_BASE_ICAO,
  isHomeBase,
  LiquidRecordSource,
  LiquidType,
  OilSource,
  requiresTotalCost,
  resolveHomeBaseProvider,
  selectableProviders,
  type CreateLiquidRecordRequest,
  type FuelProvider,
  type LiquidPrefill,
  type LiquidRecordWithLock,
  type OilCanister,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { endpoints } from '../../api/endpoints'
import { AirfieldAutocomplete } from '../../components/AirfieldAutocomplete'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { prefillFromSearchParams } from './liquidHelpers'
import { ReceiptCaptureField } from './ReceiptCaptureField'

/**
 * The member-facing reporting form, for both liquids.
 *
 * One form rather than two pages because the entry points don't know which liquid
 * they are: a scanned QR code resolves to either, and the flight log offers both.
 * The two halves share aircraft, time and quantity, and diverge after that.
 *
 * Everything the server will check is checked here first — from the same
 * functions, imported from `@mik/contracts/liquid` — so a control is disabled
 * rather than a submission rejected. The server still checks; this is about not
 * making the member find out the hard way.
 */

interface Props {
  /** From a scanned QR code, or the `?ac=&apt=&fuel=` deep link. */
  prefill?: LiquidPrefill
  /** The code that was scanned, recorded on the record for provenance. */
  qrCode?: string
  /** Set when reporting from inside a flight log. */
  flightLogId?: string
  /** Where to go after a successful save; defaults to the member's own list. */
  onSaved?: (record: LiquidRecordWithLock) => void
}

interface FormState {
  liquidType: LiquidType
  aircraftRegistration: string
  recordedAt: string
  airport: string
  fuelType: string
  providerId: string
  quantityLitres: string
  totalCost: string
  ccy: string
  fxRate: string
  taxIncludedAbroad: boolean
  oilSource: OilSource
  oilCanisterId: string
  oilMake: string
  oilModelViscosity: string
  oilBatchNumber: string
  remainingLitres: string
  markCanisterEmpty: boolean
}

const initialState = (prefill?: LiquidPrefill, now = new Date()): FormState => ({
  liquidType: prefill?.liquidType ?? LiquidType.FUEL,
  aircraftRegistration: prefill?.aircraftRegistration ?? '',
  // "Default the record date/time to scan/submission time; members may edit it."
  // Stored as a real ISO timestamp (unlike a bare datetime-local string, which
  // carries no zone at all) so it can be shown in whichever of UTC/local the
  // member has chosen -- see the recordedAt field below.
  recordedAt: now.toISOString(),
  airport: prefill?.airport ?? '',
  fuelType: prefill?.fuelType ?? '',
  providerId: prefill?.providerId ? String(prefill.providerId) : '',
  quantityLitres: '',
  totalCost: '',
  ccy: 'EUR',
  fxRate: '',
  taxIncludedAbroad: deriveTaxIncludedAbroad(prefill?.airport, prefill?.fuelType),
  oilSource: prefill?.oilSource ?? OilSource.CANISTER,
  oilCanisterId: prefill?.oilCanisterId ?? '',
  oilMake: '',
  oilModelViscosity: '',
  oilBatchNumber: '',
  remainingLitres: '',
  markCanisterEmpty: false,
})

export function LiquidReportForm({ prefill, qrCode, flightLogId, onSaved }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { timezoneName, timezoneOffset } = useTimezone()

  // A deep link is the same thing as a scan, as far as the form is concerned.
  const effectivePrefill = useMemo(
    () => prefill ?? prefillFromSearchParams(searchParams),
    [prefill, searchParams],
  )

  const [form, setForm] = useState<FormState>(() => initialState(effectivePrefill))
  const [saveError, setSaveError] = useState<string>()
  // Staged locally: the record doesn't exist server-side yet, so these are
  // uploaded only after handleSubmit's own POST succeeds.
  const [receiptFiles, setReceiptFiles] = useState<File[]>([])
  const [receiptUploadError, setReceiptUploadError] = useState<string>()
  // Set only if the record saved but its receipt upload then failed — the
  // record itself is real at that point, so "try again" retries just the
  // upload rather than resubmitting (and duplicating) the whole record.
  const [savedRecordPendingReceipt, setSavedRecordPendingReceipt] = useState<LiquidRecordWithLock>()

  // A scan resolves after the first render, so the form has to catch up once.
  useEffect(() => {
    if (effectivePrefill) setForm(initialState(effectivePrefill))
  }, [effectivePrefill])

  const isFuel = form.liquidType === LiquidType.FUEL

  const aircraftApi = useApi<AircraftListResponse>({ url: endpoints.aircrafts.root })
  const providersApi = useApi<FuelProvider[]>({ url: endpoints.liquid.providers })
  const canistersApi = useApi<OilCanister[]>(
    {
      url: endpoints.liquid.oilCanisters,
      params: form.aircraftRegistration
        ? { aircraftRegistration: form.aircraftRegistration }
        : undefined,
      skipFetch: isFuel,
    },
    { revalidateIfStale: false },
  )
  const { mutation } = useApi<LiquidRecordWithLock>({
    url: endpoints.liquid.records,
    skipFetch: true,
  })

  const aircraft = aircraftApi.data?.aircrafts ?? []
  const providers = providersApi.data ?? []
  const canisters = canistersApi.data ?? []

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // "Fuel type is constrained by aircraft" — from the fleet's own data, so this
  // narrows to Jet A-1 for OH-STL and the MOGAS/100LL set for OH-IHQ without
  // either being written down here.
  const selectedAircraft = aircraft.find((a) => a.registration === form.aircraftRegistration)
  const allowedFuelTypes = selectedAircraft?.fuelTypes ?? []

  const atHomeBase = isHomeBase(form.airport)
  const costRequired = requiresTotalCost(form.liquidType, form.airport)

  // The cost/currency/fx-rate fields are hidden at home base -- clear anything
  // typed into them before switching away, so a value the member can no longer
  // see doesn't silently ride along into the submission.
  useEffect(() => {
    if (atHomeBase && (form.totalCost || form.ccy !== 'EUR' || form.fxRate)) {
      setForm((f) => ({ ...f, totalCost: '', ccy: 'EUR', fxRate: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atHomeBase])

  // "Remaining in canister" and "canister is now empty" only apply to the club's
  // own canister, and remaining-litres is hidden once the canister is marked
  // empty -- clear both behind the member's back the moment they stop being
  // shown, so a value typed earlier can't silently ride along in the submission.
  useEffect(() => {
    if (
      form.oilSource === OilSource.OTHER &&
      (form.remainingLitres || form.markCanisterEmpty || form.oilCanisterId)
    ) {
      setForm((f) => ({ ...f, remainingLitres: '', markCanisterEmpty: false, oilCanisterId: '' }))
    } else if (form.markCanisterEmpty && form.remainingLitres) {
      setForm((f) => ({ ...f, remainingLitres: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.oilSource, form.markCanisterEmpty])

  /**
   * The fuel type actually in effect — *derived*, not stored, so it can never lag
   * the aircraft by a render.
   *
   * Three rules, the first two the issue's: an aircraft that takes exactly one
   * fuel type isn't offering a choice, and a selection the new aircraft cannot
   * take has to go rather than sit there waiting to be rejected by the server.
   * The third is what makes a scanned pump prefill visibly: a shared pump's QR
   * code knows the grade before it knows the aircraft, and showing the field as
   * blank/disabled until the member also picks a plane hid a value the member
   * had already told, once, by scanning.
   */
  const fuelType = ((): string => {
    if (!isFuel) return ''
    if (allowedFuelTypes.length === 1) return allowedFuelTypes[0]!
    if (form.fuelType && allowedFuelTypes.includes(form.fuelType)) return form.fuelType
    // Fall back to the aircraft's preference, but only if it is actually allowed.
    const preferred = selectedAircraft?.preferredFuelType
    if (preferred && allowedFuelTypes.includes(preferred)) return preferred
    // No aircraft chosen yet, so there is nothing to constrain against — show
    // exactly what the QR/deep link prefilled instead of looking unset.
    if (!selectedAircraft && form.fuelType) return form.fuelType
    return ''
  })()

  /**
   * "Tax included abroad" follows the airport and fuel type — EF* is Finland,
   * anything else abroad — with no manual override. A member can't see the
   * club's tax treatment of a given seller, so leaving it as a checkbox just
   * invited it to disagree with the ICAO code for no reason.
   */
  const taxIncludedAbroad = deriveTaxIncludedAbroad(form.airport, fuelType)

  /**
   * At EFNU the provider follows from the fuel type and the member never sees a
   * dropdown; away from home they pick one. Resolved here so the summary can name
   * the seller either way.
   */
  const homeProvider = atHomeBase ? resolveHomeBaseProvider(providers, fuelType) : undefined
  const providerOptions = selectableProviders(providers, form.airport, fuelType)
  const selectedProvider = providerOptions.find((p) => String(p.providerId) === form.providerId)

  const selectedCanister = canisters.find((c) => c.canisterId === form.oilCanisterId)

  // The receipt field only shows for a provider that's the member's own money
  // (requiresClaim) -- staged files no longer visible when that stops being
  // true (switching away from fuel, back to home base, or to a club-card
  // provider) are cleared rather than left to silently ride along.
  useEffect(() => {
    if (!isFuel || atHomeBase || !selectedProvider?.requiresClaim) {
      if (receiptFiles.length) setReceiptFiles([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFuel, atHomeBase, selectedProvider?.requiresClaim])

  /** Everything the server would reject, as a reason or nothing. */
  const blockingReason = ((): string | undefined => {
    if (!form.aircraftRegistration) return t('liquid.form.selectAircraft')
    if (!form.quantityLitres || Number(form.quantityLitres) <= 0) {
      return t('liquid.form.enterQuantity')
    }
    if (isFuel) {
      if (!form.airport) return t('liquid.form.selectAirport')
      if (!fuelType) return t('liquid.form.selectFuelType')
      if (!atHomeBase && !form.providerId) return t('liquid.form.selectProvider')
      if (costRequired && !form.totalCost) return t('liquid.form.enterTotalCost')
      if (form.ccy !== 'EUR' && !form.fxRate) return t('liquid.form.enterFxRate')
      return undefined
    }
    if (form.oilSource === OilSource.CANISTER && !form.oilCanisterId) {
      return t('liquid.form.selectCanister')
    }
    if (form.oilSource === OilSource.OTHER) {
      if (!form.oilMake || !form.oilModelViscosity || !form.oilBatchNumber) {
        return t('liquid.form.enterOilDetails')
      }
    }
    return undefined
  })()

  const finish = (record: LiquidRecordWithLock) => {
    if (onSaved) onSaved(record)
    else void navigate('/liquid')
  }

  /** Uploads whatever is staged in `receiptFiles` onto an already-saved record. */
  const uploadStagedReceipts = async (record: LiquidRecordWithLock): Promise<boolean> => {
    if (!receiptFiles.length) return true
    const fd = new FormData()
    receiptFiles.forEach((file) => fd.append('files', file))
    const { error } = await mutation.trigger('POST', fd, `${record.recordId}/attachments`)
    if (error) {
      setReceiptUploadError(error.detail)
      setSavedRecordPendingReceipt(record)
      return false
    }
    return true
  }

  /** The record already saved (from a failed receipt upload) — retry just the upload. */
  const retryReceiptUpload = async () => {
    if (!savedRecordPendingReceipt) return
    setReceiptUploadError(undefined)
    if (await uploadStagedReceipts(savedRecordPendingReceipt)) finish(savedRecordPendingReceipt)
  }

  const handleSubmit = async () => {
    setSaveError(undefined)
    setReceiptUploadError(undefined)

    const payload: CreateLiquidRecordRequest = {
      liquidType: form.liquidType,
      aircraftRegistration: form.aircraftRegistration,
      recordedAt: form.recordedAt,
      quantityLitres: Number(form.quantityLitres),
      markCanisterEmpty: form.markCanisterEmpty,
      source: qrCode
        ? LiquidRecordSource.QR
        : flightLogId
          ? LiquidRecordSource.FLIGHT_LOG
          : LiquidRecordSource.MANUAL,
      qrCode,
      flightLogId,
      ...(isFuel
        ? {
            airport: form.airport,
            fuelType,
            // Omitted at EFNU: the server derives it, and sending one would be
            // rejected as an attempt to name a different seller.
            providerId: atHomeBase ? undefined : Number(form.providerId),
            totalCost: form.totalCost ? Number(form.totalCost) : undefined,
            ccy: form.ccy as CreateLiquidRecordRequest['ccy'],
            fxRate: form.fxRate ? Number(form.fxRate) : undefined,
            taxIncludedAbroad,
          }
        : {
            oilSource: form.oilSource,
            oilCanisterId: form.oilCanisterId || undefined,
            oilMake: form.oilMake || undefined,
            oilModelViscosity: form.oilModelViscosity || undefined,
            oilBatchNumber: form.oilBatchNumber || undefined,
            remainingLitres: form.remainingLitres ? Number(form.remainingLitres) : undefined,
          }),
    }

    const { data, error } = await mutation.trigger('POST', payload)
    if (error || !data) {
      setSaveError(error?.detail ?? t('general.savingError'))
      return
    }

    // The record is real from this point on: a receipt upload failure must not
    // resubmit (and duplicate) it, so retrying only ever retries the upload.
    if (await uploadStagedReceipts(data)) finish(data)
  }

  return (
    // A single-purpose report form, not a dashboard — letting it stretch to a
    // wide desktop viewport's full width just spaces the fields out with
    // nothing to fill the gap. Capped like the app's other one-off forms
    // (AmeSubmitForm, NotificationBannerAdmin) rather than left unconstrained.
    <Box sx={{ maxWidth: 640 }}>
      <Title label={t('liquid.form.title')} />

      <RemoteContent isLoading={aircraftApi.isLoading} error={aircraftApi.error}>
        <Stack spacing={3}>
          {effectivePrefill?.label && (
            <Alert severity='info' icon={<Icon icon='mdi:qrcode-scan' />}>
              {t('liquid.form.prefilled', { context: effectivePrefill.label })}
            </Alert>
          )}
          {saveError && <Alert severity='error'>{saveError}</Alert>}

          <Paper sx={{ p: 3 }}>
            <Stack spacing={3}>
              <ToggleButtonGroup
                exclusive
                value={form.liquidType}
                onChange={(_e, value: LiquidType | null) => value && set('liquidType', value)}
                aria-label={t('liquid.form.liquidType')}
              >
                <ToggleButton value={LiquidType.FUEL}>
                  <Icon icon='mdi:fuel' style={{ marginRight: 8 }} />
                  {t('liquid.type.fuel')}
                </ToggleButton>
                <ToggleButton value={LiquidType.OIL}>
                  <Icon icon='mdi:oil' style={{ marginRight: 8 }} />
                  {t('liquid.type.oil')}
                </ToggleButton>
              </ToggleButtonGroup>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                  gap: 2,
                }}
              >
                <TextField
                  select
                  required
                  label={t('liquid.form.aircraft')}
                  value={form.aircraftRegistration}
                  onChange={(e) => set('aircraftRegistration', e.target.value)}
                >
                  {aircraft.map((a) => (
                    <MenuItem key={a.registration} value={a.registration}>
                      {a.registration}
                    </MenuItem>
                  ))}
                </TextField>

                <DateTimePicker
                  label={t('liquid.form.recordedAtTz', { tz: timezoneOffset(form.recordedAt) })}
                  value={form.recordedAt ? dayjs(form.recordedAt) : null}
                  disableFuture
                  format='DD.MM.YYYY HH:mm'
                  timezone={timezoneName}
                  onChange={(date) => set('recordedAt', date?.isValid() ? date.toISOString() : '')}
                  slotProps={{
                    textField: { helperText: t('liquid.form.recordedAtHint') },
                  }}
                />
              </Box>

              {isFuel ? (
                <FuelFields
                  form={form}
                  set={set}
                  fuelType={fuelType}
                  allowedFuelTypes={allowedFuelTypes}
                  providerOptions={providerOptions}
                  homeProvider={homeProvider}
                  atHomeBase={atHomeBase}
                  costRequired={costRequired}
                  selectedProvider={selectedProvider}
                  receiptFiles={receiptFiles}
                  onReceiptFilesChange={setReceiptFiles}
                />
              ) : (
                <OilFields
                  form={form}
                  set={set}
                  canisters={canisters}
                  selectedCanister={selectedCanister}
                />
              )}

              <TextField
                required
                type='number'
                label={t('liquid.form.quantityLitres')}
                value={form.quantityLitres}
                onChange={(e) => set('quantityLitres', e.target.value)}
                slotProps={{ htmlInput: { step: isFuel ? '0.1' : '0.01', min: '0' } }}
                sx={{ maxWidth: { sm: 240 } }}
                // The reason the Save button is disabled is shown here, right
                // under the last field in the form, rather than pinned to the
                // button itself — a disabled control with no explanation is the
                // most common complaint about forms like this, and the reason is
                // about a field the member needs to look at, not about the button.
                helperText={blockingReason}
              />

              {savedRecordPendingReceipt ? (
                // The record itself already saved -- only the receipt upload is
                // retried from here, never the record (that would duplicate it).
                <Stack spacing={1}>
                  <Alert severity='warning'>
                    {receiptUploadError ?? t('liquid.form.receiptUploadFailed')}
                  </Alert>
                  <Stack direction='row' spacing={2}>
                    <Button variant='contained' onClick={() => void retryReceiptUpload()}>
                      {t('liquid.form.retryReceiptUpload')}
                    </Button>
                    <Button variant='text' onClick={() => finish(savedRecordPendingReceipt)}>
                      {t('liquid.form.continueWithoutReceipt')}
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Box>
                  <Button
                    variant='contained'
                    disabled={!!blockingReason || mutation.isMutating}
                    startIcon={<Icon icon='mdi:content-save-outline' />}
                    onClick={() => void handleSubmit()}
                  >
                    {t('general.save')}
                  </Button>
                </Box>
              )}
            </Stack>
          </Paper>
        </Stack>
      </RemoteContent>
    </Box>
  )
}

// ─── Fuel half ────────────────────────────────────────────────────────────────

interface FuelFieldsProps {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  /** The fuel type in effect, which the aircraft may have decided rather than the member. */
  fuelType: string
  allowedFuelTypes: string[]
  providerOptions: FuelProvider[]
  homeProvider?: FuelProvider
  atHomeBase: boolean
  costRequired: boolean
  /** The provider `form.providerId` resolves to, if any — decides whether a receipt is offered. */
  selectedProvider?: FuelProvider
  receiptFiles: File[]
  onReceiptFilesChange: (files: File[]) => void
}

function FuelFields({
  form,
  set,
  fuelType,
  allowedFuelTypes,
  providerOptions,
  homeProvider,
  atHomeBase,
  costRequired,
  selectedProvider,
  receiptFiles,
  onReceiptFilesChange,
}: FuelFieldsProps) {
  const { t } = useTranslation()

  // Before an aircraft is chosen there is nothing to constrain the dropdown
  // against, but a scanned pump may already have told us the grade — offer
  // that one option rather than showing an empty, disabled field.
  const fuelTypeOptions =
    allowedFuelTypes.length > 0 ? allowedFuelTypes : form.fuelType ? [form.fuelType] : []

  return (
    <Stack spacing={2}>
      {/* The home-base flow: the member sees EFNU and a fuel type, nothing else.
          "Total cost is not required at EFNU" because the club is invoiced. */}
      <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          size='small'
          variant={atHomeBase ? 'contained' : 'outlined'}
          onClick={() => set('airport', HOME_BASE_ICAO)}
        >
          {t('liquid.form.atHomeBase', { icao: HOME_BASE_ICAO })}
        </Button>
        <Button
          size='small'
          variant={!atHomeBase && form.airport ? 'contained' : 'outlined'}
          onClick={() => set('airport', '')}
        >
          {t('liquid.form.awayFromHomeBase')}
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2,
        }}
      >
        {atHomeBase ? (
          <TextField
            label={t('liquid.form.airport')}
            value={HOME_BASE_ICAO}
            disabled
            slotProps={{ inputLabel: { shrink: true } }}
          />
        ) : (
          <AirfieldAutocomplete
            value={form.airport}
            onChange={(ident) => set('airport', ident)}
            required
            label={t('liquid.form.airport')}
            margin='none'
          />
        )}

        <TextField
          select
          required
          label={t('liquid.form.fuelType')}
          value={fuelType}
          onChange={(e) => set('fuelType', e.target.value)}
          disabled={fuelTypeOptions.length === 0}
          helperText={
            allowedFuelTypes.length > 0
              ? undefined
              : form.fuelType
                ? t('liquid.form.selectAircraftToConfirmFuelType')
                : t('liquid.form.selectAircraftFirst')
          }
        >
          {fuelTypeOptions.map((fuelType) => (
            <MenuItem key={fuelType} value={fuelType}>
              {fuelType}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {atHomeBase ? (
        // Stored for reporting, shown so the member can see it is recorded, but
        // never a choice: the fuel type determines the seller at EFNU.
        homeProvider && (
          <Chip
            icon={<Icon icon='mdi:store-outline' />}
            label={t('liquid.form.suppliedBy', { provider: homeProvider.name })}
            variant='outlined'
            sx={{ alignSelf: 'flex-start' }}
          />
        )
      ) : (
        <TextField
          select
          required
          label={t('liquid.form.provider')}
          value={form.providerId}
          onChange={(e) => set('providerId', e.target.value)}
          sx={{ maxWidth: { sm: 320 } }}
          helperText={t('liquid.form.providerHint')}
        >
          {providerOptions.map((provider) => (
            <MenuItem key={provider.providerId} value={String(provider.providerId)}>
              {provider.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      {!atHomeBase && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          <TextField
            type='number'
            required={costRequired}
            label={t('liquid.form.totalCost')}
            value={form.totalCost}
            onChange={(e) => set('totalCost', e.target.value)}
            slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
            helperText={
              costRequired ? t('liquid.form.totalCostRequired') : t('liquid.form.totalCostOptional')
            }
          />
          <TextField
            select
            label={t('liquid.form.currency')}
            value={form.ccy}
            onChange={(e) => set('ccy', e.target.value)}
          >
            {MIK_SUPPORTED_CURRENCIES.map((ccy) => (
              <MenuItem key={ccy} value={ccy}>
                {ccy}
              </MenuItem>
            ))}
          </TextField>
          {form.ccy !== 'EUR' && (
            <TextField
              type='number'
              required
              label={t('liquid.form.fxRate')}
              value={form.fxRate}
              onChange={(e) => set('fxRate', e.target.value)}
              slotProps={{ htmlInput: { step: '0.000001', min: '0' } }}
              helperText={t('liquid.form.fxRateHint', { ccy: form.ccy })}
            />
          )}
        </Box>
      )}

      {/* Only for a provider that's the member's own money -- a club fuel card
          purchase (AirBP/Kanair) has nothing to claim, so nothing to photograph. */}
      {!atHomeBase && selectedProvider?.requiresClaim && (
        <ReceiptCaptureField files={receiptFiles} onChange={onReceiptFilesChange} />
      )}
    </Stack>
  )
}

// ─── Oil half ─────────────────────────────────────────────────────────────────

interface OilFieldsProps {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  canisters: OilCanister[]
  selectedCanister?: OilCanister
}

function OilFields({ form, set, canisters, selectedCanister }: OilFieldsProps) {
  const { t } = useTranslation()

  return (
    <Stack spacing={2}>
      <ToggleButtonGroup
        exclusive
        size='small'
        value={form.oilSource}
        onChange={(_e, value: OilSource | null) => value && set('oilSource', value)}
        aria-label={t('liquid.oil.source')}
      >
        <ToggleButton value={OilSource.CANISTER}>{t('liquid.oil.clubCanister')}</ToggleButton>
        <ToggleButton value={OilSource.OTHER}>{t('liquid.oil.otherSource')}</ToggleButton>
      </ToggleButtonGroup>

      {form.oilSource === OilSource.CANISTER ? (
        <>
          {!form.aircraftRegistration ? (
            <Alert severity='info'>{t('liquid.form.selectAircraftFirst')}</Alert>
          ) : canisters.length === 0 ? (
            // Every canister for this aircraft is empty or none was ever added.
            <Alert severity='warning'>{t('liquid.oil.noCanisters')}</Alert>
          ) : (
            <TextField
              select
              required
              label={t('liquid.oil.canister')}
              value={form.oilCanisterId}
              onChange={(e) => set('oilCanisterId', e.target.value)}
            >
              {canisters.map((canister) => (
                <MenuItem key={canister.canisterId} value={canister.canisterId}>
                  {`${canister.clubCanisterRef} · ${canister.make} ${canister.modelViscosity}`}
                  {canister.isOpened ? ` · ${t('liquid.oil.opened')}` : ''}
                </MenuItem>
              ))}
            </TextField>
          )}

          {selectedCanister && (
            <Alert severity='info' icon={<Icon icon='mdi:information-outline' />}>
              {t('liquid.oil.canisterDetails', {
                batch: selectedCanister.batchNumber,
                aircraft: selectedCanister.aircraftRegistration,
              })}
            </Alert>
          )}
        </>
      ) : (
        // Oil from anywhere else. The club still needs to know what went into the
        // engine, so these three are required rather than nice to have.
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          <TextField
            required
            label={t('liquid.oil.make')}
            value={form.oilMake}
            onChange={(e) => set('oilMake', e.target.value)}
          />
          <TextField
            required
            label={t('liquid.oil.modelViscosity')}
            value={form.oilModelViscosity}
            onChange={(e) => set('oilModelViscosity', e.target.value)}
          />
          <TextField
            required
            label={t('liquid.oil.batchNumber')}
            value={form.oilBatchNumber}
            onChange={(e) => set('oilBatchNumber', e.target.value)}
          />
        </Box>
      )}

      {/* "Remaining in canister" only means anything for the club's own canister —
          "other source" has no canister to report a level for. And once the
          member says the canister is now empty, the field is hidden rather than
          just left sitting there: shown alongside the checkbox it invites the
          member to type how much they *used* into a field asking what's left. */}
      {form.oilSource === OilSource.CANISTER && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {!form.markCanisterEmpty && (
            <TextField
              type='number'
              label={t('liquid.oil.remainingLitres')}
              value={form.remainingLitres}
              onChange={(e) => set('remainingLitres', e.target.value)}
              slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
              // Recorded as information, never checked against what was used — the
              // helper text says so, because a field that looks validated and isn't
              // invites the member to guess.
              helperText={t('liquid.oil.remainingLitresHint')}
            />
          )}
          {form.oilCanisterId && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.markCanisterEmpty}
                  onChange={(e) => set('markCanisterEmpty', e.target.checked)}
                />
              }
              label={t('liquid.oil.markEmpty')}
            />
          )}
        </Box>
      )}
    </Stack>
  )
}

/** The route wrapper — the form is also mounted inside the flight log. */
export default function LiquidReportPage() {
  return <LiquidReportForm />
}
