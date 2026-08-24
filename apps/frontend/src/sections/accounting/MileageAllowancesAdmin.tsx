import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
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
import useApi, { api } from '../../hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'

interface MileageAllowance {
  id: number
  taxYear: number
  ratePerKm: number
  discountPct: number
  effectiveRatePerKm: number
  updatedAt: string
  updatedBy: string
}

interface FormState {
  taxYear: string
  ratePerKm: string
  discountPct: string
}

const emptyForm: FormState = {
  taxYear: String(new Date().getFullYear()),
  ratePerKm: '',
  discountPct: '50',
}

export function MileageAllowancesAdmin() {
  const { t } = useTranslation()
  const { data, isLoading, error, mutate } = useApi<MileageAllowance[]>({
    url: 'v1/mileage-allowances',
  })

  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveSuccess, setSaveSuccess] = useState(false)

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    setSaveError(undefined)
    setSaveSuccess(false)
    try {
      await api.put('v1/mileage-allowances', {
        taxYear: Number(form.taxYear),
        ratePerKm: Number(form.ratePerKm),
        discountPct: Number(form.discountPct),
      })
      setSaveSuccess(true)
      setForm(emptyForm)
      await mutate()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(detail ?? t('general.savingError'))
    } finally {
      setSaving(false)
    }
  }

  const handleEditRow = (row: MileageAllowance) =>
    setForm({
      taxYear: String(row.taxYear),
      ratePerKm: String(row.ratePerKm),
      discountPct: String(row.discountPct),
    })

  return (
    <Box>
      <Title label={t('accounting.mileageAllowances.title')} />
      <Stack spacing={3}>
        {/* ── Edit / Add form ── */}
        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' sx={{ mb: 2 }}>
            {t('accounting.mileageAllowances.formTitle')}
          </Typography>
          {saveError && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {saveError}
            </Alert>
          )}
          {saveSuccess && (
            <Alert severity='success' sx={{ mb: 2 }}>
              {t('accounting.mileageAllowances.saved')}
            </Alert>
          )}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              alignItems: 'flex-start',
            }}
          >
            <TextField
              label={t('accounting.mileageAllowances.taxYear')}
              type='number'
              value={form.taxYear}
              onChange={set('taxYear')}
              sx={{ width: 120 }}
              slotProps={{ htmlInput: { min: 2020, max: 2100 } }}
            />
            <TextField
              label={t('accounting.mileageAllowances.ratePerKm')}
              type='number'
              value={form.ratePerKm}
              onChange={set('ratePerKm')}
              sx={{ width: 160 }}
              slotProps={{ htmlInput: { step: '0.0001', min: '0' } }}
              helperText={t('accounting.mileageAllowances.ratePerKmHint')}
            />
            <TextField
              label={t('accounting.mileageAllowances.discountPct')}
              type='number'
              value={form.discountPct}
              onChange={set('discountPct')}
              sx={{ width: 140 }}
              slotProps={{ htmlInput: { step: '1', min: '0', max: '100' } }}
              helperText={t('accounting.mileageAllowances.discountPctHint')}
            />
            {form.ratePerKm && form.discountPct && (
              <Box sx={{ pt: 1 }}>
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('accounting.mileageAllowances.effectiveRate')}
                </Typography>
                <Typography
                  variant='body1'
                  sx={{
                    fontWeight: 600,
                  }}
                >
                  €{(Number(form.ratePerKm) * (1 - Number(form.discountPct) / 100)).toFixed(4)}/km
                </Typography>
              </Box>
            )}
            <Button
              variant='contained'
              disabled={saving || !form.taxYear || !form.ratePerKm || !form.discountPct}
              startIcon={<Icon icon='mdi:content-save-outline' />}
              onClick={() => void handleSave()}
              sx={{ mt: { xs: 0, sm: '24px !important' } }}
            >
              {t('general.save')}
            </Button>
          </Stack>
        </Paper>

        {/* ── Table ── */}
        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' sx={{ mb: 2 }}>
            {t('accounting.mileageAllowances.history')}
          </Typography>
          <RemoteContent isLoading={isLoading} error={error}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('accounting.mileageAllowances.taxYear')}</TableCell>
                  <TableCell>{t('accounting.mileageAllowances.ratePerKm')}</TableCell>
                  <TableCell>{t('accounting.mileageAllowances.discountPct')}</TableCell>
                  <TableCell>{t('accounting.mileageAllowances.effectiveRate')}</TableCell>
                  <TableCell>{t('accounting.mileageAllowances.updatedAt')}</TableCell>
                  <TableCell>{t('accounting.mileageAllowances.updatedBy')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.taxYear}</TableCell>
                    <TableCell>€{row.ratePerKm.toFixed(4)}</TableCell>
                    <TableCell>{row.discountPct}%</TableCell>
                    <TableCell>€{row.effectiveRatePerKm.toFixed(4)}</TableCell>
                    <TableCell>{new Date(row.updatedAt).toLocaleString()}</TableCell>
                    <TableCell>{row.updatedBy}</TableCell>
                    <TableCell>
                      <Button size='small' onClick={() => handleEditRow(row)}>
                        {t('general.edit')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </RemoteContent>
        </Paper>
      </Stack>
    </Box>
  )
}
