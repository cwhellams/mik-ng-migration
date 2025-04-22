import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Stack,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import useApi, { APIMutation } from '../../../hooks/useApi'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { AircraftDocument } from '@backend/routes/aircrafts/models'
import { AuditFormField } from '../../../components/AuditFormField'
import { FormTitle } from '../../../components/FormTitle'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'
import { Upsert } from '@backend/types/schema'

interface EditDocumentModalProps {
  onClose: () => void
  registration?: string
  document?: Upsert<AircraftDocument>
}

export const EditDocumentModal = ({
  onClose,
  registration,
  document,
}: EditDocumentModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const isNewDocument = !document?.documentId

  const { create, update } = useApi<AircraftDocument>({
    url: `v1/aircrafts/${registration}/documents/${isNewDocument ? '' : `/${document?.documentId}`}`,
    skipFetch: true,
  })

  // Define form states based on the mode
  const [formData, setFormData] = useState<Partial<AircraftDocument>>({})

  const [errorMsg, setErrorMsg] = useState('')

  // Initialize form data when modal opens
  useEffect(() => {
    setErrorMsg('')
    if (document) {
      setFormData(document)
    }
  }, [document])

  const trigger = async (api: APIMutation<AircraftDocument>) => {
    setErrorMsg('')

    try {
      await api.trigger(formData)

      // clear the cache for aircrafts
      mutate((key) => Array.isArray(key) && key[0] == 'v1/aircrafts')

      onClose()
    } catch {
      setErrorMsg(api.error?.message ?? 'Error')
      console.error('Error modifying aircraft:', api.error)
    }
  }

  // const handleRemove = async () => trigger(remove)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    await trigger(isNewDocument ? create : update)
  }

  const handleChange = (
    field: keyof AircraftDocument,
    value: string | number | null
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const renderDocumentsForm = () => (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid size={{ xs: 12, sm: 3 }}>
        <FormControl fullWidth sx={{ minWidth: 100 }}>
          <InputLabel id='type-label'>
            {t('aircraft.document.edit.documentId')}
          </InputLabel>

          <Select
            labelId='type-label'
            id='role'
            value={formData.documentId ?? ''}
            label={t('aircraft.document.edit.documentId')}
            onChange={({ target }) => handleChange('documentId', target.value)}
          >
            <MenuItem value='arc'>{t('aircraft.document.arc')}</MenuItem>
            <MenuItem value='insurance'>
              {t('aircraft.document.insurance')}
            </MenuItem>
            <MenuItem value='finavia'>
              {t('aircraft.document.finavia')}
            </MenuItem>
            <MenuItem value='radio'>{t('aircraft.document.radio')}</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid container size={{ xs: 12, sm: 3 }} spacing={2}>
        <DatePicker
          label={t('aircraft.document.edit.startDate')}
          defaultValue={dayjs()}
          value={dayjs(formData.startDate)}
          onChange={(value) =>
            handleChange('startDate', value?.format('YYYY-MM-DD') ?? '')
          }
        />
        <DatePicker
          label={t('aircraft.document.edit.endDate')}
          defaultValue={dayjs()}
          value={dayjs(formData.endDate)}
          onChange={(value) =>
            handleChange('endDate', value?.format('YYYY-MM-DD') ?? '')
          }
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextField
          type='number'
          required
          label={t('aircraft.document.edit.alertDaysBefore')}
          value={formData.alertDaysBefore || ''}
          onChange={({ target }) =>
            handleChange(
              'alertDaysBefore',
              target.value.length > 0 ? Number(target.value) : null
            )
          }
        />
      </Grid>
      <Grid container size={{ xs: 12, sm: 3 }}>
        <TextField
          type='number'
          label={t('aircraft.document.edit.softLimit')}
          value={formData.softLimit ?? ''}
          onChange={({ target }) =>
            handleChange(
              'softLimit',
              target.value.length > 0 ? Number(target.value) : null
            )
          }
        />
        <TextField
          type='number'
          label={t('aircraft.document.edit.hardLimit')}
          value={formData.hardLimit ?? ''}
          onChange={({ target }) =>
            handleChange(
              'hardLimit',
              target.value.length > 0 ? Number(target.value) : null
            )
          }
        />
      </Grid>
    </Grid>
  )

  const auditCard = () =>
    document && (
      <Card>
        <CardContent>
          <FormTitle title={t('aircraft.edit.audit')} icon='mdi:information' />

          <Stack spacing={1.5}>
            <AuditFormField
              label={t('aircraft.edit.created')}
              by={document.createdBy}
              at={document.createdAt}
            />

            <AuditFormField
              label={t('aircraft.edit.updated')}
              by={document.updatedBy}
              at={document.updatedAt}
            />
          </Stack>
        </CardContent>
      </Card>
    )

  return (
    <Dialog
      open={registration !== undefined && document !== undefined}
      onClose={onClose}
      maxWidth='md'
      fullWidth
      fullScreen={isXs}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: handleSubmit,
        },
      }}
    >
      <EditDialogTitle
        title={
          isNewDocument
            ? 'aircraft.document.edit.new'
            : 'aircraft.document.edit.details'
        }
        onClose={onClose}
      />
      <DialogContent dividers>
        {renderDocumentsForm()}
        {!isNewDocument && auditCard()}
        {errorMsg.length > 0 && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {errorMsg}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color='inherit'>
          {t('general.cancel', 'Cancel')}
        </Button>
        <Button
          type='submit'
          color='primary'
          variant='contained'
          disabled={create.isMutating || update.isMutating}
          startIcon={
            create.isMutating || update.isMutating ? (
              <CircularProgress size={20} />
            ) : null
          }
        >
          {t('general.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
