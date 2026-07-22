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
import useApi, { api } from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'

interface CostCentre {
  code: string
  description: string
}

const EMPTY_FORM = {
  code: '',
  description: '',
}

export function CostCentresPage() {
  const { t } = useTranslation()
  const { data, isLoading, error, mutate } = useApi<CostCentre[]>({ url: 'v1/cost-centres' })

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingCode, setEditingCode] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveSuccess, setSaveSuccess] = useState<string>()

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingCode(undefined)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(undefined)
    setSaveSuccess(undefined)

    try {
      const payload = {
        code: form.code.trim(),
        description: form.description.trim(),
      }

      if (editingCode) {
        await api.put(`v1/cost-centres/${encodeURIComponent(editingCode)}`, {
          description: payload.description,
        })
      } else {
        await api.post('v1/cost-centres', payload)
      }

      setSaveSuccess(t('costCentres.saveSuccess'))
      resetForm()
      await mutate()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err?.response?.data?.detail ?? t('general.savingError'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (row: CostCentre) => {
    setEditingCode(row.code)
    setForm({ code: row.code, description: row.description })
    setSaveError(undefined)
    setSaveSuccess(undefined)
  }

  const handleDelete = async (code: string) => {
    if (!window.confirm(t('costCentres.deleteConfirm', { code }))) {
      return
    }

    setSaving(true)
    setSaveError(undefined)
    setSaveSuccess(undefined)

    try {
      await api.delete(`v1/cost-centres/${encodeURIComponent(code)}`)
      setSaveSuccess(t('common.deleted'))
      if (editingCode === code) {
        resetForm()
      }
      await mutate()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err?.response?.data?.detail ?? t('general.savingError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Title label={t('costCentres.title')} />
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant='h6' sx={{ mb: 2 }}>
          {t('costCentres.formTitle')}
        </Typography>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            alignItems: 'flex-start',
          }}
        >
          <TextField
            label={t('costCentres.code')}
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            disabled={Boolean(editingCode)}
            size='small'
            sx={{ width: 200 }}
          />
          <TextField
            label={t('costCentres.description')}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            size='small'
            sx={{ minWidth: 320, flex: 1 }}
          />
          <Button
            variant='contained'
            disabled={saving || !form.code.trim() || !form.description.trim()}
            onClick={() => void handleSave()}
            sx={{ mt: { xs: 0, sm: 0.5 } }}
          >
            {t('general.save')}
          </Button>
          {editingCode && (
            <Button
              variant='text'
              disabled={saving}
              onClick={resetForm}
              sx={{ mt: { xs: 0, sm: 0.5 } }}
            >
              {t('general.cancel')}
            </Button>
          )}
        </Stack>

        {saveError && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {saveError}
          </Alert>
        )}
        {saveSuccess && (
          <Alert severity='success' sx={{ mt: 2 }}>
            {saveSuccess}
          </Alert>
        )}
      </Paper>
      <Paper>
        <Typography variant='h6' sx={{ px: 3, pt: 3 }}>
          {t('costCentres.history')}
        </Typography>
        <RemoteContent isLoading={isLoading} error={error}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('costCentres.code')}</TableCell>
                <TableCell>{t('costCentres.description')}</TableCell>
                <TableCell>{t('general.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data ?? []).map((row) => (
                <TableRow key={row.code}>
                  <TableCell>
                    <strong>{row.code}</strong>
                  </TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>
                    <Stack direction='row' spacing={1}>
                      <Button size='small' onClick={() => startEdit(row)}>
                        {t('general.edit')}
                      </Button>
                      <Button
                        size='small'
                        color='error'
                        disabled={saving}
                        onClick={() => void handleDelete(row.code)}
                      >
                        {t('general.delete')}
                      </Button>
                    </Stack>
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
