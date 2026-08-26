import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'

import type { FuelTypesListResponse } from '@mik/contracts/aircrafts'
import type { FuelTax, UpsertFuelTaxRequest } from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { absolute } from '../../api/endpoints'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { useTimezone } from '@mik/ui/hooks/useTimezone'

/**
 * Finnish fuel tax by calendar year and fuel type — the treasurer's screen.
 *
 * Two things this page has to be clear about, because getting either wrong moves
 * real money:
 *
 *   - **An empty table means no adjustment.** The migration seeds nothing on
 *     purpose: inventing a rate would silently change what members are
 *     reimbursed. The banner below says so rather than leaving an empty table to
 *     be read as "configured to zero".
 *   - **Editing a rate never moves a settled claim.** The rate is copied onto
 *     each fuel record when it joins a claim, so a correction here only affects
 *     claims made from now on. That is the whole reason the record carries
 *     `fuel_tax_rate_applied`.
 */

interface FormState {
  taxYear: string
  fuelType: string
  rateEurPerLitre: string
}

const emptyForm = (): FormState => ({
  taxYear: String(new Date().getFullYear()),
  fuelType: '',
  rateEurPerLitre: '',
})

export function FuelTaxAdmin() {
  const { t } = useTranslation()
  const { formatDate } = useTimezone()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saveError, setSaveError] = useState<string>()
  const [saved, setSaved] = useState(false)

  const { data, error, isLoading, mutate, mutation } = useApi<FuelTax[]>({
    url: 'v1/liquid/fuel-tax',
    alwaysSudo: true,
  })
  const fuelTypesApi = useApi<FuelTypesListResponse>({ url: 'v1/aircrafts/fuel-types' })

  const rates = data ?? []
  const fuelTypes = fuelTypesApi.data?.fuelTypes ?? []

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    setSaveError(undefined)
    setSaved(false)
    const payload: UpsertFuelTaxRequest = {
      taxYear: Number(form.taxYear),
      fuelType: form.fuelType,
      rateEurPerLitre: Number(form.rateEurPerLitre),
    }
    const { error: err } = await mutation.trigger('PUT', payload)
    if (err) {
      setSaveError(err.detail ?? t('general.savingError'))
      return
    }
    setSaved(true)
    setForm(emptyForm())
    await mutate()
  }

  const handleDelete = async (rate: FuelTax) => {
    setSaveError(undefined)
    const { error: err } = await mutation.trigger(
      'DELETE',
      undefined,
      absolute(`v1/liquid/fuel-tax/${rate.taxYear}/${encodeURIComponent(rate.fuelType)}`),
    )
    if (err) setSaveError(err.detail ?? t('general.savingError'))
    await mutate()
  }

  return (
    <Box>
      <Title label={t('fuelTax.title')} />

      <Stack spacing={3}>
        <Alert severity='info' icon={<Icon icon='mdi:information-outline' />}>
          {t('fuelTax.explanation')}
        </Alert>

        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' sx={{ mb: 2 }}>
            {t('fuelTax.formTitle')}
          </Typography>
          {saveError && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {saveError}
            </Alert>
          )}
          {saved && (
            <Alert severity='success' sx={{ mb: 2 }}>
              {t('fuelTax.saved')}
            </Alert>
          )}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: 'flex-start' }}
          >
            <TextField
              type='number'
              label={t('fuelTax.taxYear')}
              value={form.taxYear}
              onChange={(e) => set('taxYear', e.target.value)}
              slotProps={{ htmlInput: { min: 2000, max: 2200 } }}
              sx={{ width: 130 }}
            />
            <TextField
              select
              label={t('fuelTax.fuelType')}
              value={form.fuelType}
              onChange={(e) => set('fuelType', e.target.value)}
              sx={{ minWidth: 200 }}
              helperText={t('fuelTax.fuelTypeHint')}
            >
              {fuelTypes.map((fuelType) => (
                <MenuItem key={fuelType.name} value={fuelType.name}>
                  {fuelType.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type='number'
              label={t('fuelTax.rate')}
              value={form.rateEurPerLitre}
              onChange={(e) => set('rateEurPerLitre', e.target.value)}
              slotProps={{ htmlInput: { step: '0.0001', min: '0' } }}
              helperText={t('fuelTax.rateHint')}
              sx={{ width: 180 }}
            />
            <Button
              variant='contained'
              disabled={
                !form.taxYear || !form.fuelType || !form.rateEurPerLitre || mutation.isMutating
              }
              startIcon={<Icon icon='mdi:content-save-outline' />}
              onClick={() => void handleSave()}
              sx={{ mt: { xs: 0, sm: '8px' } }}
            >
              {t('general.save')}
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' sx={{ mb: 2 }}>
            {t('fuelTax.configuredTitle')}
          </Typography>
          <RemoteContent isLoading={isLoading} error={error}>
            {rates.length === 0 ? (
              // Not "zero" — nothing configured, so nothing is added to any price.
              <Alert severity='warning'>{t('fuelTax.none')}</Alert>
            ) : (
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('fuelTax.taxYear')}</TableCell>
                    <TableCell>{t('fuelTax.fuelType')}</TableCell>
                    <TableCell>{t('fuelTax.rate')}</TableCell>
                    <TableCell>{t('fuelTax.updatedAt')}</TableCell>
                    <TableCell>{t('fuelTax.updatedBy')}</TableCell>
                    <TableCell align='right' />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rates.map((rate) => (
                    <TableRow key={`${rate.taxYear}-${rate.fuelType}`}>
                      <TableCell>{rate.taxYear}</TableCell>
                      <TableCell>{rate.fuelType}</TableCell>
                      <TableCell>{`€${rate.rateEurPerLitre.toFixed(4)}/l`}</TableCell>
                      <TableCell>{formatDate(rate.updatedAt)}</TableCell>
                      <TableCell>{rate.updatedBy}</TableCell>
                      <TableCell align='right'>
                        <Stack direction='row' spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          <Button
                            size='small'
                            onClick={() =>
                              setForm({
                                taxYear: String(rate.taxYear),
                                fuelType: rate.fuelType,
                                rateEurPerLitre: String(rate.rateEurPerLitre),
                              })
                            }
                          >
                            {t('general.edit')}
                          </Button>
                          <IconButton
                            size='small'
                            color='error'
                            onClick={() => void handleDelete(rate)}
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
            )}
          </RemoteContent>
        </Paper>
      </Stack>
    </Box>
  )
}
