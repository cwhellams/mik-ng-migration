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
import useApi, { api } from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import type { UsefulPhoneNumber } from '@mik/contracts/useful-phone-numbers'

const EMPTY_FORM = {
  label: '',
  phoneNumber: '',
  sortOrder: 0,
}

export default function UsefulPhoneNumbersAdminPage() {
  const { t } = useTranslation()
  const { data, isLoading, error, mutate } = useApi<UsefulPhoneNumber[]>({
    url: 'v1/useful-phone-numbers',
  })

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingLabel, setEditingLabel] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveSuccess, setSaveSuccess] = useState<string>()

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingLabel(undefined)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(undefined)
    setSaveSuccess(undefined)

    try {
      if (editingLabel != null) {
        await api.put(`v1/useful-phone-numbers/${encodeURIComponent(editingLabel)}`, {
          phoneNumber: form.phoneNumber.trim(),
          sortOrder: form.sortOrder,
        })
      } else {
        await api.post('v1/useful-phone-numbers', {
          label: form.label.trim(),
          phoneNumber: form.phoneNumber.trim(),
          sortOrder: form.sortOrder,
        })
      }

      setSaveSuccess(t('usefulPhoneNumbers.saveSuccess'))
      resetForm()
      await mutate()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err?.response?.data?.detail ?? t('general.savingError'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (row: UsefulPhoneNumber) => {
    setEditingLabel(row.label)
    setForm({
      label: row.label,
      phoneNumber: row.phoneNumber,
      sortOrder: row.sortOrder,
    })
    setSaveError(undefined)
    setSaveSuccess(undefined)
  }

  const handleDelete = async (row: UsefulPhoneNumber) => {
    if (!window.confirm(t('usefulPhoneNumbers.deleteConfirm', { label: row.label }))) {
      return
    }

    setSaving(true)
    setSaveError(undefined)
    setSaveSuccess(undefined)

    try {
      await api.delete(`v1/useful-phone-numbers/${encodeURIComponent(row.label)}`)
      setSaveSuccess(t('common.deleted'))
      if (editingLabel === row.label) {
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
      <Title label={t('usefulPhoneNumbers.title')} />
      <Typography variant='body2' sx={{ color: 'text.secondary', mb: 3 }}>
        {t('usefulPhoneNumbers.description')}
      </Typography>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant='h6' sx={{ mb: 2 }}>
          {t('usefulPhoneNumbers.formTitle')}
        </Typography>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap' }}
        >
          <TextField
            label={t('usefulPhoneNumbers.label')}
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            disabled={editingLabel != null}
            helperText={editingLabel == null ? t('usefulPhoneNumbers.labelHint') : undefined}
            size='small'
            sx={{ minWidth: 240 }}
          />
          <TextField
            label={t('usefulPhoneNumbers.phoneNumber')}
            value={form.phoneNumber}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
            size='small'
            sx={{ minWidth: 200 }}
          />
          <TextField
            label={t('usefulPhoneNumbers.sortOrder')}
            type='number'
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
            size='small'
            sx={{ width: 120 }}
          />
          <Button
            variant='contained'
            disabled={saving || !form.label.trim() || !form.phoneNumber.trim()}
            onClick={() => void handleSave()}
          >
            {t('general.save')}
          </Button>
          {editingLabel != null && (
            <Button variant='text' disabled={saving} onClick={resetForm}>
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
          {t('usefulPhoneNumbers.list')}
        </Typography>
        <RemoteContent isLoading={isLoading} error={error}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('usefulPhoneNumbers.label')}</TableCell>
                <TableCell>{t('usefulPhoneNumbers.phoneNumber')}</TableCell>
                <TableCell>{t('general.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data ?? []).map((row) => (
                <TableRow key={row.label}>
                  <TableCell>
                    <strong>{row.label}</strong>
                  </TableCell>
                  <TableCell>{row.phoneNumber}</TableCell>
                  <TableCell>
                    <Stack direction='row' spacing={1}>
                      <Button size='small' onClick={() => startEdit(row)}>
                        {t('general.edit')}
                      </Button>
                      <Button
                        size='small'
                        color='error'
                        disabled={saving}
                        onClick={() => void handleDelete(row)}
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
