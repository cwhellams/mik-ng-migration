import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'

import type { AircraftListResponse } from '@mik/contracts/aircrafts'
import type { CreateOilCanisterRequest, OilCanister } from '@mik/contracts/liquid'
import useApi, { api } from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { absolute } from '../../api/endpoints'

/**
 * The liquid admin's oil-canister console.
 *
 * Two things about this screen are load-bearing rather than cosmetic:
 *
 *   - **The aircraft is set once.** After creation the field is gone, because an
 *     oil record already filed against the canister names the aircraft the oil
 *     went into; moving it would rewrite history. A database trigger refuses it
 *     as well.
 *   - **Remaining volume is informational.** It is editable here because the
 *     admin may have weighed the tin, but nothing derives it from reported usage
 *     and nothing validates usage against it.
 */

interface FormState {
  clubCanisterRef: string
  batchNumber: string
  manufacturingDate: string
  make: string
  modelViscosity: string
  aircraftRegistration: string
  initialLitres: string
}

const emptyForm: FormState = {
  clubCanisterRef: '',
  batchNumber: '',
  manufacturingDate: '',
  make: '',
  modelViscosity: '',
  aircraftRegistration: '',
  initialLitres: '1',
}

export default function OilInventoryAdmin() {
  const { t } = useTranslation()
  const [showEmpty, setShowEmpty] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saveError, setSaveError] = useState<string>()

  const { data, error, isLoading, mutate, mutation } = useApi<OilCanister[]>({
    url: 'v1/liquid/oil-canisters',
    params: { includeEmpty: String(showEmpty) },
    alwaysSudo: true,
  })
  const aircraftApi = useApi<AircraftListResponse>({ url: 'v1/aircrafts' })

  const canisters = data ?? []
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /**
   * Pre-fills the club's `MIK <initials> <YY>/<seq>` label once a make is known.
   *
   * Asked of the server rather than computed here, because the sequence is "how
   * many of this make already exist" — a fact only the database has. Still only a
   * suggestion: the admin has the tin in hand and the club's own label wins.
   */
  const suggestRef = async (make: string) => {
    if (!make.trim()) return
    try {
      const { data: suggestion } = await api.get<{ clubCanisterRef: string }>(
        'v1/liquid/oil-canisters/suggest-ref',
        { params: { make }, headers: { 'x-sudo': 'true' } },
      )
      // Never overwrite something the admin has already typed.
      setForm((f) =>
        f.clubCanisterRef ? f : { ...f, clubCanisterRef: suggestion.clubCanisterRef },
      )
    } catch {
      // A failed suggestion is not worth an error banner — the field is free text.
    }
  }

  const handleCreate = async () => {
    setSaveError(undefined)
    const payload: CreateOilCanisterRequest = {
      clubCanisterRef: form.clubCanisterRef,
      batchNumber: form.batchNumber,
      manufacturingDate: form.manufacturingDate || undefined,
      make: form.make,
      modelViscosity: form.modelViscosity,
      aircraftRegistration: form.aircraftRegistration,
      initialLitres: form.initialLitres ? Number(form.initialLitres) : undefined,
    }
    const { error: err } = await mutation.trigger('POST', payload)
    if (err) {
      setSaveError(err.detail ?? t('general.savingError'))
      return
    }
    setForm(emptyForm)
    await mutate()
  }

  const patchCanister = async (canister: OilCanister, patch: Record<string, unknown>) => {
    setSaveError(undefined)
    const { error: err } = await mutation.trigger(
      'PATCH',
      patch,
      absolute(`v1/liquid/oil-canisters/${canister.canisterId}`),
    )
    if (err) setSaveError(err.detail ?? t('general.savingError'))
    await mutate()
  }

  const handleDelete = async (canister: OilCanister) => {
    if (!globalThis.confirm(t('liquid.admin.oil.deleteMessage'))) return
    setSaveError(undefined)
    const { error: err } = await mutation.trigger(
      'DELETE',
      undefined,
      absolute(`v1/liquid/oil-canisters/${canister.canisterId}`),
    )
    // The usual failure is "oil has been reported against this one" — a 409 with
    // a message telling the admin to mark it empty instead.
    if (err) setSaveError(err.detail ?? t('general.savingError'))
    await mutate()
  }

  const incomplete =
    !form.clubCanisterRef ||
    !form.batchNumber ||
    !form.make ||
    !form.modelViscosity ||
    !form.aircraftRegistration

  return (
    <Box>
      <Title label={t('liquid.admin.oil.title')} />

      <Stack spacing={3}>
        {saveError && <Alert severity='error'>{saveError}</Alert>}

        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' sx={{ mb: 2 }}>
            {t('liquid.admin.oil.addTitle')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            <TextField
              label={t('liquid.oil.make')}
              value={form.make}
              onChange={(e) => set('make', e.target.value)}
              onBlur={() => void suggestRef(form.make)}
              required
            />
            <TextField
              label={t('liquid.oil.modelViscosity')}
              value={form.modelViscosity}
              onChange={(e) => set('modelViscosity', e.target.value)}
              required
            />
            <TextField
              label={t('liquid.admin.oil.canisterRef')}
              value={form.clubCanisterRef}
              onChange={(e) => set('clubCanisterRef', e.target.value)}
              helperText={t('liquid.admin.oil.canisterRefHint')}
              required
            />
            <TextField
              label={t('liquid.oil.batchNumber')}
              value={form.batchNumber}
              onChange={(e) => set('batchNumber', e.target.value)}
              required
            />
            <TextField
              type='date'
              label={t('liquid.admin.oil.manufacturingDate')}
              value={form.manufacturingDate}
              onChange={(e) => set('manufacturingDate', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label={t('liquid.admin.oil.aircraft')}
              value={form.aircraftRegistration}
              onChange={(e) => set('aircraftRegistration', e.target.value)}
              helperText={t('liquid.admin.oil.aircraftPermanent')}
              required
            >
              {(aircraftApi.data?.aircrafts ?? []).map((a) => (
                <MenuItem key={a.registration} value={a.registration}>
                  {a.registration}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type='number'
              label={t('liquid.admin.oil.initialLitres')}
              value={form.initialLitres}
              onChange={(e) => set('initialLitres', e.target.value)}
              slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
            />
          </Box>
          <Button
            variant='contained'
            sx={{ mt: 2 }}
            disabled={incomplete || mutation.isMutating}
            startIcon={<Icon icon='mdi:plus' />}
            onClick={() => void handleCreate()}
          >
            {t('liquid.admin.oil.add')}
          </Button>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack
            direction='row'
            sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
          >
            <Typography variant='h6'>{t('liquid.admin.oil.inventoryTitle')}</Typography>
            <FormControlLabel
              control={
                <Switch checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
              }
              label={t('liquid.admin.oil.showEmpty')}
            />
          </Stack>

          <RemoteContent isLoading={isLoading} error={error}>
            {canisters.length === 0 ? (
              <Alert severity='info'>{t('liquid.admin.oil.empty')}</Alert>
            ) : (
              <TableContainer>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('liquid.admin.oil.canisterRef')}</TableCell>
                      <TableCell>{t('liquid.oil.make')}</TableCell>
                      <TableCell>{t('liquid.oil.batchNumber')}</TableCell>
                      <TableCell>{t('liquid.admin.oil.aircraft')}</TableCell>
                      <TableCell>{t('liquid.oil.remainingLitres')}</TableCell>
                      <TableCell>{t('liquid.admin.oil.state')}</TableCell>
                      <TableCell>{t('liquid.admin.qr.code')}</TableCell>
                      <TableCell align='right' />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {canisters.map((canister) => (
                      <TableRow key={canister.canisterId}>
                        <TableCell>{canister.clubCanisterRef}</TableCell>
                        <TableCell>{`${canister.make} ${canister.modelViscosity}`}</TableCell>
                        <TableCell>{canister.batchNumber}</TableCell>
                        <TableCell>{canister.aircraftRegistration}</TableCell>
                        <TableCell>
                          <RemainingLitresCell
                            canister={canister}
                            onSave={(value) =>
                              void patchCanister(canister, { remainingLitres: value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction='row' spacing={0.5}>
                            {canister.isEmpty ? (
                              <Chip size='small' color='default' label={t('liquid.oil.isEmpty')} />
                            ) : canister.isOpened ? (
                              <Chip size='small' color='warning' label={t('liquid.oil.opened')} />
                            ) : (
                              <Chip size='small' color='success' label={t('liquid.oil.sealed')} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {canister.qrCode ? (
                            <Chip size='small' variant='outlined' label={canister.qrCode} />
                          ) : (
                            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                              {t('liquid.admin.oil.noQr')}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align='right'>
                          <Stack direction='row' spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                            {!canister.isEmpty && (
                              <Tooltip title={t('liquid.admin.oil.markEmptyTooltip')}>
                                <IconButton
                                  size='small'
                                  onClick={() => void patchCanister(canister, { isEmpty: true })}
                                  aria-label={t('liquid.oil.markEmpty')}
                                >
                                  <Icon icon='mdi:package-variant-closed-remove' />
                                </IconButton>
                              </Tooltip>
                            )}
                            <IconButton
                              size='small'
                              color='error'
                              onClick={() => void handleDelete(canister)}
                              aria-label={t('general.delete')}
                            >
                              <Icon icon='mdi:delete-outline' />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </RemoteContent>
        </Paper>
      </Stack>
    </Box>
  )
}

/** An inline number field that only saves when the value actually changed. */
function RemainingLitresCell({
  canister,
  onSave,
}: {
  canister: OilCanister
  onSave: (value: number | null) => void
}) {
  const [value, setValue] = useState(
    canister.remainingLitres == null ? '' : String(canister.remainingLitres),
  )
  const current = canister.remainingLitres == null ? '' : String(canister.remainingLitres)

  return (
    <TextField
      size='small'
      type='number'
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value === current) return
        onSave(value === '' ? null : Number(value))
      }}
      slotProps={{ htmlInput: { step: '0.01', min: '0', 'aria-label': canister.clubCanisterRef } }}
      sx={{ width: 100 }}
    />
  )
}
