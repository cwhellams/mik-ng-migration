import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField } from '@mui/material'
import { Icon } from '@iconify/react'

import { MIK_SUPPORTED_CURRENCIES } from '@mik/contracts/expenses'
import type { AirfieldListResponse } from '@mik/contracts/flight-log'
import {
  isHomeBase,
  LiquidType,
  requiresTotalCost,
  selectableProviders,
  type FuelProvider,
  type LiquidRecordWithLock,
  type UpdateLiquidRecordRequest,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { absolute, endpoints } from '../../api/endpoints'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { SaveButton } from '@mik/ui/components/SaveButton'
import { Title } from '@mik/ui/components/Title'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { lockReasonKey } from './liquidHelpers'

/**
 * Correcting a record inside the week it stays editable.
 *
 * Deliberately narrower than the reporting form: this changes figures on an
 * existing record rather than deciding what kind of record it is, so the liquid
 * type, the aircraft and the oil source are fixed. Anything wider would let a
 * member turn a fuel record into an oil one, which the server refuses anyway.
 *
 * The PATCH sends **only the fields that changed**. That is not an optimisation:
 * `UpdateLiquidRecordSchema` applies no defaults precisely so an absent key
 * leaves its column alone, and sending the whole form back would resubmit values
 * the member never looked at.
 */
export default function EditLiquidRecord() {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()
  const navigate = useNavigate()
  const { recordId } = useParams<{ recordId: string }>()

  const { data, error, isLoading, mutation } = useApi<LiquidRecordWithLock>({
    url: recordId ? endpoints.liquid.recordById(recordId) : endpoints.liquid.records,
    skipFetch: !recordId,
  })

  const airfieldsApi = useApi<AirfieldListResponse>(
    { url: 'v1/flight-logs/airfields', skipFetch: data?.liquidType !== LiquidType.FUEL },
    { revalidateIfStale: false },
  )
  const providersApi = useApi<FuelProvider[]>(
    { url: endpoints.liquid.providers, skipFetch: data?.liquidType !== LiquidType.FUEL },
    { revalidateIfStale: false },
  )

  const [quantityLitres, setQuantityLitres] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [ccy, setCcy] = useState('EUR')
  const [fxRate, setFxRate] = useState('')
  const [airport, setAirport] = useState('')
  const [providerId, setProviderId] = useState('')
  const [remainingLitres, setRemainingLitres] = useState('')
  const [saveError, setSaveError] = useState<string>()

  useEffect(() => {
    if (!data) return
    setQuantityLitres(String(data.quantityLitres))
    setTotalCost(data.totalCost == null ? '' : String(data.totalCost))
    setCcy(data.ccy)
    setFxRate(data.fxRate == null ? '' : String(data.fxRate))
    setAirport(data.airport ?? '')
    setProviderId(data.providerId == null ? '' : String(data.providerId))
    setRemainingLitres(data.remainingLitres == null ? '' : String(data.remainingLitres))
  }, [data])

  const isFuel = data?.liquidType === LiquidType.FUEL
  const costRequired = data ? requiresTotalCost(data.liquidType, airport) : false
  const atHomeBase = isHomeBase(airport)
  const providerOptions = selectableProviders(providersApi.data ?? [], airport, data?.fuelType)

  /**
   * Fails closed. The server attaches a lock to every record, so this default is
   * for the case where the response is not the record it claimed to be — and
   * "assume not editable" is the only safe reading of "I don't know".
   */
  const lock = data?.lock ?? { canEdit: false, canDelete: false }

  const handleSave = async () => {
    if (!data || !recordId) return
    setSaveError(undefined)

    const patch: UpdateLiquidRecordRequest = {}
    const changed = <T,>(next: T, current: T) => next !== current

    if (changed(Number(quantityLitres), data.quantityLitres)) {
      patch.quantityLitres = Number(quantityLitres)
    }
    if (isFuel) {
      if (changed(airport, data.airport ?? '')) patch.airport = airport
      const nextCost = totalCost === '' ? null : Number(totalCost)
      if (changed(nextCost, data.totalCost)) patch.totalCost = nextCost
      if (changed(ccy, data.ccy)) patch.ccy = ccy as UpdateLiquidRecordRequest['ccy']
      const nextRate = fxRate === '' ? null : Number(fxRate)
      if (changed(nextRate, data.fxRate)) patch.fxRate = nextRate
      // Away from home the provider is a real choice and has to travel with an
      // airport change, or the server re-resolves an unset providerId against
      // the new airport and 400s ("A fuel provider is required away from the
      // home base."). At home it is derived from the fuel type either way.
      if (!atHomeBase) {
        const nextProviderId = providerId === '' ? undefined : Number(providerId)
        if (changed(nextProviderId, data.providerId ?? undefined)) {
          patch.providerId = nextProviderId ?? null
        }
      }
    } else {
      const nextRemaining = remainingLitres === '' ? null : Number(remainingLitres)
      if (changed(nextRemaining, data.remainingLitres)) patch.remainingLitres = nextRemaining
    }

    if (Object.keys(patch).length === 0) {
      void navigate('/liquid')
      return
    }

    const result = await mutation.trigger(
      'PATCH',
      patch,
      absolute(endpoints.liquid.recordById(recordId)),
    )
    if (result.error) {
      setSaveError(result.error.detail ?? t('general.savingError'))
      return
    }
    void navigate('/liquid')
  }

  return (
    <Box>
      <Title label={t('liquid.edit.title')} />
      <RemoteContent isLoading={isLoading} error={error}>
        {data?.recordId && (
          <Stack spacing={2}>
            {/* The server's verdict, not the browser's — so a record that locked
                while this page was open says why rather than failing on save. */}
            {!lock.canEdit && lock.reason && (
              <Alert severity='warning' icon={<Icon icon='mdi:lock-outline' />}>
                {t(lockReasonKey(lock.reason))}
              </Alert>
            )}
            {saveError && <Alert severity='error'>{saveError}</Alert>}

            <Paper sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Alert severity='info' icon={<Icon icon='mdi:information-outline' />}>
                  {t('liquid.edit.context', {
                    aircraft: data.aircraftRegistration,
                    type: t(`liquid.type.${String(data.liquidType).toLowerCase()}`),
                    recorded: formatDateTime(data.recordedAt),
                  })}
                </Alert>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                    gap: 2,
                  }}
                >
                  <TextField
                    type='number'
                    label={t('liquid.form.quantityLitres')}
                    value={quantityLitres}
                    disabled={!lock.canEdit}
                    onChange={(e) => setQuantityLitres(e.target.value)}
                    slotProps={{ htmlInput: { step: isFuel ? '0.1' : '0.01', min: '0' } }}
                  />

                  {isFuel && (
                    <TextField
                      select
                      label={t('liquid.form.airport')}
                      value={airport}
                      disabled={!lock.canEdit}
                      onChange={(e) => {
                        setAirport(e.target.value)
                        // A provider tied to the old airport may not sell at the
                        // new one; re-picking from scratch avoids resubmitting a
                        // choice the server would reject.
                        setProviderId('')
                      }}
                    >
                      {(airfieldsApi.data?.airfields ?? []).map((a) => (
                        <MenuItem key={a.ident} value={a.ident}>
                          {`${a.ident}: ${a.name}`}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}

                  {isFuel && !atHomeBase && (
                    <TextField
                      select
                      required
                      label={t('liquid.form.provider')}
                      value={providerId}
                      disabled={!lock.canEdit}
                      onChange={(e) => setProviderId(e.target.value)}
                      helperText={t('liquid.form.providerHint')}
                    >
                      {providerOptions.map((provider) => (
                        <MenuItem key={provider.providerId} value={String(provider.providerId)}>
                          {provider.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}

                  {isFuel && (
                    <TextField
                      type='number'
                      label={t('liquid.form.totalCost')}
                      value={totalCost}
                      disabled={!lock.canEdit}
                      onChange={(e) => setTotalCost(e.target.value)}
                      required={costRequired}
                      helperText={
                        costRequired
                          ? t('liquid.form.totalCostRequired')
                          : t('liquid.form.totalCostOptional')
                      }
                      slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
                    />
                  )}

                  {isFuel && (
                    <TextField
                      select
                      label={t('liquid.form.currency')}
                      value={ccy}
                      disabled={!lock.canEdit}
                      onChange={(e) => setCcy(e.target.value)}
                    >
                      {MIK_SUPPORTED_CURRENCIES.map((code) => (
                        <MenuItem key={code} value={code}>
                          {code}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}

                  {isFuel && ccy !== 'EUR' && (
                    <TextField
                      type='number'
                      label={t('liquid.form.fxRate')}
                      value={fxRate}
                      disabled={!lock.canEdit}
                      onChange={(e) => setFxRate(e.target.value)}
                      slotProps={{ htmlInput: { step: '0.000001', min: '0' } }}
                    />
                  )}

                  {!isFuel && (
                    <TextField
                      type='number'
                      label={t('liquid.oil.remainingLitres')}
                      value={remainingLitres}
                      disabled={!lock.canEdit}
                      onChange={(e) => setRemainingLitres(e.target.value)}
                      helperText={t('liquid.oil.remainingLitresHint')}
                      slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
                    />
                  )}
                </Box>

                <Stack direction='row' spacing={1}>
                  <SaveButton
                    disabled={
                      !lock.canEdit ||
                      mutation.isMutating ||
                      (isFuel && costRequired && totalCost === '') ||
                      (isFuel && !atHomeBase && providerId === '')
                    }
                    onClick={() => void handleSave()}
                  />
                  <Button onClick={() => void navigate('/liquid')}>{t('general.cancel')}</Button>
                </Stack>
              </Stack>
            </Paper>
          </Stack>
        )}
      </RemoteContent>
    </Box>
  )
}
