import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  InputAdornment,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import useApi from '../../hooks/useApi'
import { useDefects } from '../../hooks/useDefects'
import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import type { AircraftHil } from '@mik/contracts/aircraft-hil'
import { SaveButton } from '../../components/SaveButton'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@mik/contracts/problem'
import {
  MaintenanceNoteFormSchema,
  type MaintenanceNoteFormValues,
} from './maintenanceNoteFormSchema'
import { refreshAircraftHil } from '../aircrafts/components/hil/useAircraftHil'

interface AddMaintenanceNoteDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  aircraftRegistration: string
  ajlbSeqNo: number
  defaultFlightMins?: number
  /** Hold items to pre-select for closing, e.g. when arriving from the HIL page */
  defaultHilIds?: string[]
}

export const AddMaintenanceNoteDialog: React.FC<AddMaintenanceNoteDialogProps> = ({
  open,
  onClose,
  onSuccess,
  aircraftRegistration,
  ajlbSeqNo,
  defaultFlightMins,
  defaultHilIds,
}) => {
  const { t } = useTranslation()
  const [problem, setProblem] = useState<Problem | undefined>()
  const [selectedHilIds, setSelectedHilIds] = useState<string[]>([])
  const [selectedDefectIds, setSelectedDefectIds] = useState<string[]>([])

  const { mutation } = useApi<MaintenanceNote>({
    url: 'v1/maintenance-notes',
    skipFetch: true,
  })

  // Every flight-log admin closing a hold item picks from the currently open
  // ones for this aircraft, regardless of which logbook page they came from.
  const { data: hilEntries } = useApi<AircraftHil[]>({
    url: 'v1/aircraft-hil',
    params: { aircraftRegistration },
    skipFetch: !open,
  })
  const openHilEntries = hilEntries?.filter((h) => !h.resolvedNoteId) ?? []

  // A maintenance note can also close a defect directly, without it ever
  // having been deferred to a hold item — so offer every open defect on the
  // aircraft, regardless of which logbook page it was recorded on.
  const { data: aircraftDefects } = useDefects(open ? aircraftRegistration : undefined)
  const activeDefects = aircraftDefects?.filter((d) => d.status === 'ACTIVE') ?? []

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaintenanceNoteFormValues>({
    resolver: zodResolver(MaintenanceNoteFormSchema as any),
    defaultValues: {
      description: '',
      performedBy: '',
      flightHours: defaultFlightMins !== undefined ? Math.floor(defaultFlightMins / 60) : 0,
      flightMinutes: defaultFlightMins !== undefined ? defaultFlightMins % 60 : 0,
      rows: 1,
      blankRowsAfter: 0,
    },
  })

  const rows = useWatch({ control, name: 'rows' })

  useEffect(() => {
    if (open) {
      setProblem(undefined)
      setSelectedHilIds(defaultHilIds ?? [])
      setSelectedDefectIds([])
      reset({
        description: '',
        performedBy: '',
        flightHours: defaultFlightMins !== undefined ? Math.floor(defaultFlightMins / 60) : 0,
        flightMinutes: defaultFlightMins !== undefined ? defaultFlightMins % 60 : 0,
        rows: 1,
        blankRowsAfter: 0,
      })
    }
  }, [open, defaultFlightMins, defaultHilIds, reset])

  const onSubmit = async (values: MaintenanceNoteFormValues) => {
    const { error } = await mutation.trigger('POST', {
      aircraftRegistration,
      ajlbSeqNo,
      description: values.description,
      performedBy: values.performedBy,
      flightMins: values.flightHours * 60 + values.flightMinutes,
      rows: values.rows,
      blankRowsAfter: values.rows > 0 ? values.blankRowsAfter : 0,
      ...(selectedHilIds.length ? { hilIds: selectedHilIds } : {}),
      ...(selectedDefectIds.length ? { defectIds: selectedDefectIds } : {}),
    })

    if (error) {
      setProblem(error)
      return
    }

    if (selectedHilIds.length) await refreshAircraftHil()

    onSuccess()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('flightLog.maintenanceNotes.addTitle')}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <SnackAlert problem={problem} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Controller
              name='description'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('flightLog.maintenanceNotes.description')}
                  error={!!errors.description}
                  helperText={errors.description?.message}
                  fullWidth
                  required
                  autoFocus
                />
              )}
            />

            <Controller
              name='performedBy'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('flightLog.maintenanceNotes.performedBy')}
                  error={!!errors.performedBy}
                  helperText={errors.performedBy?.message}
                  fullWidth
                  required
                />
              )}
            />

            <Box>
              <Typography
                variant='body2'
                gutterBottom
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('flightLog.maintenanceNotes.flightTime')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Controller
                  name='flightHours'
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={t('flightLog.maintenanceNotes.hours')}
                      type='number'
                      error={!!errors.flightHours}
                      helperText={errors.flightHours?.message}
                      sx={{ flex: 1 }}
                      slotProps={{
                        input: {
                          endAdornment: <InputAdornment position='end'>h</InputAdornment>,
                        },

                        htmlInput: { min: 0 },
                      }}
                    />
                  )}
                />
                <Controller
                  name='flightMinutes'
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={t('flightLog.maintenanceNotes.minutes')}
                      type='number'
                      error={!!errors.flightMinutes}
                      helperText={errors.flightMinutes?.message}
                      sx={{ flex: 1 }}
                      slotProps={{
                        input: {
                          endAdornment: <InputAdornment position='end'>min</InputAdornment>,
                        },

                        htmlInput: { min: 0, max: 59 },
                      }}
                    />
                  )}
                />
              </Box>
            </Box>

            <Controller
              name='rows'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('flightLog.maintenanceNotes.rows')}
                  type='number'
                  error={!!errors.rows}
                  helperText={errors.rows?.message ?? t('flightLog.maintenanceNotes.rowsHelp')}
                  fullWidth
                  slotProps={{
                    htmlInput: { min: 0 },
                  }}
                />
              )}
            />

            <Controller
              name='blankRowsAfter'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('flightLog.maintenanceNotes.blankRowsAfter')}
                  type='number'
                  disabled={rows === 0}
                  error={!!errors.blankRowsAfter}
                  helperText={
                    errors.blankRowsAfter?.message ??
                    t('flightLog.maintenanceNotes.blankRowsAfterHelp')
                  }
                  fullWidth
                  slotProps={{
                    htmlInput: { min: 0 },
                  }}
                />
              )}
            />

            {openHilEntries.length > 0 && (
              <FormControl fullWidth size='small'>
                <InputLabel>{t('flightLog.maintenanceNotes.closeHilItems')}</InputLabel>
                <Select<string[]>
                  multiple
                  value={selectedHilIds}
                  label={t('flightLog.maintenanceNotes.closeHilItems')}
                  onChange={(e: SelectChangeEvent<string[]>) =>
                    setSelectedHilIds(
                      typeof e.target.value === 'string'
                        ? e.target.value.split(',')
                        : e.target.value,
                    )
                  }
                  renderValue={(selected) =>
                    openHilEntries
                      .filter((h) => selected.includes(h.hilId))
                      .map((h) => `HIL #${h.hilNumber}`)
                      .join(', ')
                  }
                >
                  {openHilEntries.map((hil) => (
                    <MenuItem key={hil.hilId} value={hil.hilId}>
                      <Checkbox checked={selectedHilIds.includes(hil.hilId)} />
                      <ListItemText primary={`HIL #${hil.hilNumber} — ${hil.description}`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {activeDefects.length > 0 && (
              <FormControl fullWidth size='small'>
                <InputLabel>{t('flightLog.maintenanceNotes.closeDefects')}</InputLabel>
                <Select<string[]>
                  multiple
                  value={selectedDefectIds}
                  label={t('flightLog.maintenanceNotes.closeDefects')}
                  onChange={(e: SelectChangeEvent<string[]>) =>
                    setSelectedDefectIds(
                      typeof e.target.value === 'string'
                        ? e.target.value.split(',')
                        : e.target.value,
                    )
                  }
                  renderValue={(selected) =>
                    activeDefects
                      .filter((d) => selected.includes(d.defectId))
                      .map((d) => d.description)
                      .join(', ')
                  }
                >
                  {activeDefects.map((defect) => (
                    <MenuItem key={defect.defectId} value={defect.defectId}>
                      <Checkbox checked={selectedDefectIds.includes(defect.defectId)} />
                      <ListItemText primary={defect.description} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={onClose} variant='outlined'>
            {t('general.cancel')}
          </Button>
          <SaveButton loading={mutation.isMutating} />
        </DialogActions>
      </form>
    </Dialog>
  )
}
