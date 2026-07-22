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
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'

interface MileageAllowance {
  id: number
  taxYear: number
  ratePerKm: number
  discountPct: number
  effectiveRatePerKm: number
  updatedAt: string
  updatedBy: string
}

const EMPTY_FORM = { taxYear: new Date().getFullYear(), ratePerKm: '', discountPct: '50' }

export function MileageAllowancesPage() {
  const { t } = useTranslation()
  const { data, isLoading, error, mutate } = useApi<MileageAllowance[]>({
    url: 'v1/mileage-allowances',
  })
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveSuccess, setSaveSuccess] = useState(false)

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
      setForm(EMPTY_FORM)
      await mutate()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err?.response?.data?.detail ?? t('general.savingError'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (row: MileageAllowance) => {
    setForm({
      taxYear: row.taxYear,
      ratePerKm: String(row.ratePerKm),
      discountPct: String(row.discountPct),
    })
    setSaveSuccess(false)
    setSaveError(undefined)
  }

  return (
    <Box>
      <Title label={t('mileageAllowances.title')} />
      {/* ── Edit / add form ── */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant='h6' sx={{ mb: 2 }}>
          {t('mileageAllowances.formTitle')}
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            alignItems: 'flex-start',
          }}
        >
          <TextField
            label={t('mileageAllowances.taxYear')}
            type='number'
            value={form.taxYear}
            onChange={(e) => setForm((f) => ({ ...f, taxYear: Number(e.target.value) }))}
            slotProps={{ htmlInput: { min: 2020, max: 2100, step: 1 } }}
            sx={{ width: 120 }}
            size='small'
          />
          <TextField
            label={t('mileageAllowances.ratePerKm')}
            type='number'
            value={form.ratePerKm}
            onChange={(e) => setForm((f) => ({ ...f, ratePerKm: e.target.value }))}
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            sx={{ width: 160 }}
            size='small'
            helperText={t('mileageAllowances.ratePerKmHint')}
          />
          <TextField
            label={t('mileageAllowances.discountPct')}
            type='number'
            value={form.discountPct}
            onChange={(e) => setForm((f) => ({ ...f, discountPct: e.target.value }))}
            slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
            sx={{ width: 140 }}
            size='small'
            helperText={t('mileageAllowances.discountPctHint')}
          />
          {form.ratePerKm && form.discountPct && (
            <Box sx={{ pt: 0.5 }}>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('mileageAllowances.effectiveRate')}:
              </Typography>
              <Typography
                variant='body1'
                sx={{
                  fontWeight: 'bold',
                }}
              >
                €{(Number(form.ratePerKm) * (1 - Number(form.discountPct) / 100)).toFixed(4)}/km
              </Typography>
            </Box>
          )}
          <Button
            variant='contained'
            disabled={saving || !form.ratePerKm || !form.taxYear}
            startIcon={<Icon icon='mdi:content-save-outline' />}
            onClick={() => void handleSave()}
            sx={{ mt: { xs: 0, sm: 0.5 } }}
          >
            {t('general.save')}
          </Button>
        </Stack>
        {saveError && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {saveError}
          </Alert>
        )}
        {saveSuccess && (
          <Alert severity='success' sx={{ mt: 2 }}>
            {t('mileageAllowances.saveSuccess')}
          </Alert>
        )}
      </Paper>
      {/* ── List ── */}
      <Paper>
        <RemoteContent isLoading={isLoading} error={error}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('mileageAllowances.taxYear')}</TableCell>
                <TableCell>{t('mileageAllowances.ratePerKm')}</TableCell>
                <TableCell>{t('mileageAllowances.discountPct')}</TableCell>
                <TableCell>{t('mileageAllowances.effectiveRate')}</TableCell>
                <TableCell>{t('mileageAllowances.updatedAt')}</TableCell>
                <TableCell>{t('mileageAllowances.updatedBy')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <strong>{row.taxYear}</strong>
                  </TableCell>
                  <TableCell>€{row.ratePerKm.toFixed(4)}</TableCell>
                  <TableCell>{row.discountPct}%</TableCell>
                  <TableCell>€{row.effectiveRatePerKm.toFixed(4)}</TableCell>
                  <TableCell>{new Date(row.updatedAt).toLocaleString()}</TableCell>
                  <TableCell>{row.updatedBy}</TableCell>
                  <TableCell>
                    <Button
                      size='small'
                      startIcon={<Icon icon='mdi:pencil-outline' />}
                      onClick={() => startEdit(row)}
                    >
                      {t('general.edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </RemoteContent>
      </Paper>
    </Box>
  )
}
