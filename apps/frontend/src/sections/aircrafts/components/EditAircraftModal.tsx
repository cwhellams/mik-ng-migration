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
  CardActions,
  Typography,
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Divider,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import useApi from '../../../hooks/useApi'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import {
  Aircraft,
  AircraftNote,
  Severity,
} from '@backend/routes/aircrafts/models'
import { AuditFormField } from '../../../components/AuditFormField'
import { FormTitle } from '../../../components/FormTitle'
import dayjs from 'dayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { EditButton } from '../../../components/EditButton'

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
        seats: aircraft?.seats ?? 1,
        usableFuelLitres: aircraft?.usableFuelLitres ?? 1,
        active: aircraft?.active ?? false,

        location: aircraft?.location,
        equipment: aircraft?.equipment,
        hourlyRateEur: aircraft?.hourlyRateEur,

        documents: [],
        notes: [],
        maintenance: !aircraft
          ? {
              maintenanceCycle: 50,

              lastMaintenanceDate: '2020-01-01',
              lastMaintenanceType: '0h',
              lastMaintenanceTach: 1,

              nextMaintenanceDate: null,
              nextMaintenanceType: '50h',
              nextMaintenanceTach: 50,

              totalPercentageHours: 5,
              usablePercentageHours: 3,
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

  const handleMaintenanceChange = (
    field: keyof Aircraft['maintenance'],
    value: string | number | null
  ) =>
    setFormData((prev) => ({
      ...prev,
      maintenance: {
        ...prev.maintenance!,
        [field]: value,
      },
    }))

  const handleNoteChange = (
    index: number,
    field: keyof AircraftNote,
    value: string | number | boolean | null
  ) =>
    setFormData((prev) => ({
      ...prev,
      notes: [
        ...prev.notes!.slice(0, index),
        { ...prev.notes![index], [field]: value },
        ...prev.notes!.slice(index + 1),
      ],
    }))

  const handleNoteCreate = () =>
    setFormData((prev) => ({
      ...prev,
      notes: [...prev.notes!, { text: '', severity: Severity.note }],
    }))

  const handleNoteDelete = (index: number) =>
    setFormData((prev) => ({
      ...prev,
      notes: [...prev.notes!.slice(0, index), ...prev.notes!.slice(index + 1)],
    }))

  const startNextCycle = () => {
    setFormData((prev) => {
      const m = prev.maintenance!
      return {
        ...prev,
        maintenance: {
          ...m,
          lastMaintenanceDate:
            m.nextMaintenanceDate ?? dayjs().format('YYYY-MM-DD'),
          lastMaintenanceType: m.nextMaintenanceType,
          lastMaintenanceTach: m.nextMaintenanceTach,
          nextMaintenanceDate: null,
          nextMaintenanceType: m.maintenanceCycle.toString(),
          nextMaintenanceTach: m.nextMaintenanceTach + m.maintenanceCycle,
        },
      }
    })
  }

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
          type='number'
          inputMode='numeric'
          label={t('aircraft.edit.yearOfManufacture')}
          value={formData.yearOfManufacture || ''}
          onChange={({ target }) =>
            handleChange('yearOfManufacture', Number(target.value))
          }
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 4 }}>
        <TextField
          fullWidth
          required
          type='number'
          inputMode='numeric'
          label={t('aircraft.edit.seats')}
          value={formData.seats || ''}
          onChange={({ target }) => handleChange('seats', Number(target.value))}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 4 }}>
        <TextField
          fullWidth
          required
          type='number'
          inputMode='numeric'
          label={t('aircraft.edit.usableFuelLitres')}
          value={formData.usableFuelLitres || ''}
          onChange={({ target }) =>
            handleChange('usableFuelLitres', Number(target.value))
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
          <Grid container spacing={2}>
            <Grid size={12} display='flex' alignItems='center'>
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ width: 150 }}
              >
                {t('aircraft.edit.active')}
              </Typography>
              <Checkbox
                checked={formData.active}
                onChange={({ target }) => {
                  setFormData({
                    ...formData,
                    active: target.checked,
                  })
                }}
              />
            </Grid>
          </Grid>

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
                handleChange('hourlyRateEur', Number(target.value))
              }
            />
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  )

  const renderMaintenanceForm = () => (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField
          fullWidth
          required
          type='number'
          inputMode='numeric'
          label={t('aircraft.maintenance.maintenanceCycle')}
          value={formData.maintenance?.maintenanceCycle || ''}
          onChange={({ target }) =>
            handleMaintenanceChange('maintenanceCycle', Number(target.value))
          }
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField
          fullWidth
          required
          type='number'
          inputMode='numeric'
          label={t('aircraft.maintenance.totalPercentageHours')}
          value={formData.maintenance?.totalPercentageHours || ''}
          onChange={({ target }) =>
            handleMaintenanceChange(
              'totalPercentageHours',
              Number(target.value)
            )
          }
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField
          fullWidth
          required
          type='number'
          inputMode='numeric'
          label={t('aircraft.maintenance.usablePercentageHours')}
          value={formData.maintenance?.usablePercentageHours || ''}
          onChange={({ target }) =>
            handleMaintenanceChange(
              'usablePercentageHours',
              Number(target.value)
            )
          }
        />
      </Grid>
    </Grid>
  )

  const maintenanceCard = (
    titleKey: string,
    icon: string,
    dateKey: keyof Aircraft['maintenance'],
    typeKey: keyof Aircraft['maintenance'],
    tachKey: keyof Aircraft['maintenance']
  ) => {
    const next = dateKey.includes('next')
    return (
      <Card>
        <CardContent>
          <FormTitle title={t(titleKey)} icon={icon} />

          <Stack spacing={1.5}>
            <DatePicker
              disableFuture={!next}
              label={t('aircraft.maintenance.date')}
              value={
                formData.maintenance?.[dateKey] !== null
                  ? dayjs(formData.maintenance?.[dateKey])
                  : null
              }
              onChange={(value) =>
                handleMaintenanceChange(
                  dateKey,
                  value?.format('YYYY-MM-DD') ?? null
                )
              }
              slotProps={{
                field: {
                  clearable: next,
                  onClear: () => handleMaintenanceChange(dateKey, ''),
                },
              }}
            />
            <TextField
              fullWidth
              required
              label={t('aircraft.maintenance.type')}
              value={formData.maintenance?.[typeKey] ?? ''}
              onChange={({ target }) =>
                handleMaintenanceChange(typeKey, target.value)
              }
            />
            <TextField
              fullWidth
              required
              type='number'
              inputMode='numeric'
              label={t('aircraft.maintenance.tach')}
              value={formData.maintenance?.[tachKey] ?? ''}
              onChange={({ target }) =>
                handleMaintenanceChange(tachKey, Number(target.value))
              }
            />
          </Stack>
        </CardContent>
        {next && (
          <CardActions>
            <Button
              onClick={startNextCycle}
              color='primary'
              variant='contained'
            >
              {t('aircraft.maintenance.nextCycle')}
            </Button>
          </CardActions>
        )}
      </Card>
    )
  }

  const notesCard = () => (
    <Stack spacing={3}>
      {(formData.notes ?? []).map((note, index) => (
        <Grid container key={index}>
          <Grid container size={'grow'} spacing={1.5} mr={2}>
            <Grid size={{ xs: 12, sm: 2 }} minWidth={150}>
              <FormControl fullWidth>
                <InputLabel id='severity-label'>
                  {t('aircraft.notes.severity')}
                </InputLabel>

                <Select
                  labelId='severity-label'
                  id='severity'
                  value={note.severity ?? ''}
                  label={t('aircraft.notes.severity')}
                  onChange={({ target }) =>
                    handleNoteChange(index, 'severity', target.value)
                  }
                >
                  <MenuItem value='off'>{t('aircraft.notes.off')}</MenuItem>
                  <MenuItem value='note'>{t('aircraft.notes.note')}</MenuItem>
                  <MenuItem value='caution'>
                    {t('aircraft.notes.caution')}
                  </MenuItem>
                  <MenuItem value='warning'>
                    {t('aircraft.notes.warning')}
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 'grow' }}>
              <TextField
                required
                fullWidth
                label={t('aircraft.notes.text')}
                value={note.text ?? ''}
                onChange={({ target }) =>
                  handleNoteChange(index, 'text', target.value)
                }
              />
            </Grid>
          </Grid>
          <Grid size={'auto'} display={'flex'}>
            <EditButton
              title={t('aircraft.notes.delete')}
              icon='mdi:delete'
              onClick={() => handleNoteDelete(index)}
              sx={{ float: 'right' }}
            />
          </Grid>

          <Grid size={12} mt={4} mb={4}>
            <Divider variant='middle' />
          </Grid>
        </Grid>
      ))}
      <Grid size={12} display='flex' justifyContent='center'>
        <EditButton
          title={t('aircraft.notes.new')}
          onClick={handleNoteCreate}
          icon='mdi:plus'
        />
      </Grid>
    </Stack>
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
          {mode == 'maintenance' ? (
            <>
              {renderMaintenanceForm()}
              {maintenanceCard(
                'aircraft.maintenance.lastMaintenance',
                'mdi:wrench-check',
                'lastMaintenanceDate',
                'lastMaintenanceType',
                'lastMaintenanceTach'
              )}
              {maintenanceCard(
                'aircraft.maintenance.nextMaintenance',
                'mdi:wrench-clock',
                'nextMaintenanceDate',
                'nextMaintenanceType',
                'nextMaintenanceTach'
              )}
            </>
          ) : mode == 'notes' ? (
            notesCard()
          ) : (
            <>
              {renderDetailsForm()}
              {operationsCard()}
              {auditCard()}
            </>
          )}
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
