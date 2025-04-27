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
  InputAdornment,
  Card,
  CardContent,
  Stack,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import useApi from '../../../hooks/useApi'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { Aircraft } from '@backend/routes/aircrafts/models'
import { AuditFormField } from '../../../components/AuditFormField'
import { FormTitle } from '../../../components/FormTitle'

export type AircraftEditMode = 'new' | 'details' | 'maintenance' | 'notes'

interface EditAircraftModalProps {
  onClose: () => void
  mode: AircraftEditMode | undefined
  aircraft?: Aircraft
}

export const EditAircraftModal = ({
  onClose,
  mode,
  aircraft,
}: EditAircraftModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const isNewAircraft = !aircraft?.registration

  const { mutation } = useApi<Aircraft>({
    url: `v1/aircrafts${isNewAircraft ? '' : `/${aircraft?.registration}`}`,
    skipFetch: true,
  })

  // Define form states based on the mode
  const [formData, setFormData] = useState<Partial<Aircraft>>({})

  const [errorMsg, setErrorMsg] = useState('')

  // Initialize form data when modal opens
  useEffect(() => {
    setErrorMsg('')

    if (!aircraft || mode === 'details') {
      setFormData({
        registration: aircraft?.registration ?? '',
        displayName: aircraft?.displayName ?? '',
        model: aircraft?.model ?? '',
        manufacturer: aircraft?.manufacturer ?? '',
        yearOfManufacture: aircraft?.yearOfManufacture ?? 2020,

        location: aircraft?.location,
        equipment: aircraft?.equipment,
        hourlyRateEur: aircraft?.hourlyRateEur,

        documents: [],
        notes: [],
        maintenance: !aircraft
          ? {
              maintenanceCycle: 0,

              lastMaintenanceDate: '2020-01-01',
              lastMaintenanceType: '0',
              lastMaintenanceTach: 1,

              nextMaintenanceDate: '2030-01-01',
              nextMaintenanceType: '0',
              nextMaintenanceTach: 1,

              totalPercentageHours: 0,
              usablePercentageHours: 0,
            }
          : undefined,
      })
    } else if (mode === 'maintenance') {
      setFormData({
        maintenance: aircraft.maintenance,
      })
    } else if (mode === 'notes') {
      setFormData({
        notes: aircraft.notes,
      })
    }
  }, [mode, aircraft])

  const handleChange = (field: keyof Aircraft, value: string | number | null) =>
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))

  const trigger = async (method: 'POST' | 'PATCH') => {
    setErrorMsg('')

    const { error } = await mutation.trigger(method, formData)
    if (error) {
      console.error('Error modifying aircraft:', error)
      return setErrorMsg(error?.detail ?? error?.title ?? 'Error')
    }

    // clear the cache for aircrafts
    mutate((key) => Array.isArray(key) && key[0] == 'v1/aircrafts')

    onClose()
  }

  // const handleRemove = async () => trigger(remove)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    await trigger(isNewAircraft ? 'POST' : 'PATCH')
  }

  const renderDetailsForm = () => (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          required
          label={t('aircraft.edit.registration')}
          value={formData.registration || ''}
          onChange={({ target }) => handleChange('registration', target.value)}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          required
          label={t('aircraft.edit.displayName')}
          value={formData.displayName || ''}
          onChange={({ target }) => handleChange('displayName', target.value)}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField
          fullWidth
          required
          label={t('aircraft.edit.manufacturer')}
          value={formData.manufacturer || ''}
          onChange={({ target }) => handleChange('manufacturer', target.value)}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 4 }}>
        <TextField
          fullWidth
          required
          label={t('aircraft.edit.model')}
          value={formData.model || ''}
          onChange={({ target }) => handleChange('model', target.value)}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 4 }}>
        <TextField
          fullWidth
          required
          inputMode='numeric'
          label={t('aircraft.edit.yearOfManufacture')}
          value={formData.yearOfManufacture || ''}
          onChange={({ target }) =>
            handleChange('yearOfManufacture', Number(target.value))
          }
        />
      </Grid>
    </Grid>
  )

  const operationsCard = () => (
    <Card>
      <CardContent>
        <FormTitle
          title={t('aircraft.edit.operations')}
          icon='mdi:airplane-takeoff'
        />

        <Stack spacing={1.5}>
          <Grid size={12}>
            <TextField
              fullWidth
              required
              label={t('aircraft.edit.location')}
              value={formData.location || ''}
              onChange={({ target }) => handleChange('location', target.value)}
            />
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              required
              label={t('aircraft.edit.equipment')}
              value={formData.equipment || ''}
              onChange={({ target }) => handleChange('equipment', target.value)}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              required
              inputMode='decimal'
              slotProps={{
                input: {
                  inputMode: 'decimal',
                  endAdornment: (
                    <InputAdornment position='start'>€</InputAdornment>
                  ),
                },
              }}
              label={t('aircraft.edit.hourlyRateEur')}
              value={formData.hourlyRateEur || ''}
              onChange={({ target }) =>
                handleChange('hourlyRateEur', target.value)
              }
            />
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  )

  const auditCard = () =>
    aircraft && (
      <Card>
        <CardContent>
          <FormTitle title={t('aircraft.edit.audit')} icon='mdi:information' />

          <Stack spacing={1.5}>
            <AuditFormField
              label={t('aircraft.edit.created')}
              by={aircraft.createdBy}
              at={aircraft.createdAt}
            />

            <AuditFormField
              label={t('aircraft.edit.updated')}
              by={aircraft.updatedBy}
              at={aircraft.updatedAt}
            />
          </Stack>
        </CardContent>
      </Card>
    )

  return (
    <Dialog
      open={mode !== undefined}
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
        title={mode && `aircraft.edit.${mode}`}
        onClose={onClose}
      />
      <DialogContent dividers>
        <Stack spacing={3}>
          {renderDetailsForm()}
          {operationsCard()}
          {auditCard()}
        </Stack>
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
          disabled={mutation.isMutating}
          startIcon={
            mutation.isMutating ? <CircularProgress size={20} /> : null
          }
        >
          {t('general.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
