import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Chip,
  InputAdornment,
  Link,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Icon } from '@iconify/react'
import useApi from '../../hooks/useApi'
import { useDefects } from '../../hooks/useDefects'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'
import {
  MaintenanceNoteFormSchema,
  type MaintenanceNoteFormValues,
} from './maintenanceNoteFormSchema'
import { useRoles } from '../../hooks/useRoles'
import { useAircraftHil } from '../aircrafts/components/hil/useAircraftHil'
import { useOpenDefectLink } from '../aircrafts/components/hil/useOpenDefectLink'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SaveButton } from '../../components/SaveButton'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'

interface MaintenanceNoteDialogProps {
  note: MaintenanceNote
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export const MaintenanceNoteDialog: React.FC<MaintenanceNoteDialogProps> = ({
  note,
  open,
  onClose,
  onChanged,
}) => {
  const { t } = useTranslation()
  const { me, isFlightLogAdmin } = useRoles()
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [problem, setProblem] = useState<Problem | undefined>()

  const canModify = isFlightLogAdmin || note.createdBy === me?.memberId

  const { hil } = useAircraftHil(note.aircraftRegistration, true)
  const closedHil = hil.filter((entry) => entry.resolvedNoteId === note.noteId)

  // Covers both defects closed directly and those cascaded via a hold item —
  // resolveDefectsByHil stamps resolved_note_id on those too.
  const { data: aircraftDefects } = useDefects(note.aircraftRegistration)
  const closedDefects = aircraftDefects?.filter((d) => d.resolvedNoteId === note.noteId) ?? []
  const handleOpenDefect = useOpenDefectLink(note.aircraftRegistration)

  const { mutation: updateMutation } = useApi<MaintenanceNote>({
    url: `v1/maintenance-notes/${note.noteId}`,
    skipFetch: true,
  })

  const { mutation: deleteMutation } = useApi<void>({
    url: `v1/maintenance-notes/${note.noteId}`,
    skipFetch: true,
  })

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaintenanceNoteFormValues>({
    resolver: zodResolver(MaintenanceNoteFormSchema as any),
    values: {
      description: note.description,
      performedBy: note.performedBy,
      flightHours: Math.floor(note.flightMins / 60),
      flightMinutes: note.flightMins % 60,
      rows: note.rows,
      blankRowsAfter: note.blankRowsAfter,
    },
  })

  const rows = useWatch({ control, name: 'rows' })

  const handleEditToggle = () => {
    if (isEditing) {
      reset()
    }
    setProblem(undefined)
    setIsEditing(!isEditing)
  }

  const onSubmit = async (values: MaintenanceNoteFormValues) => {
    const { error } = await updateMutation.trigger('PATCH', {
      description: values.description,
      performedBy: values.performedBy,
      flightMins: values.flightHours * 60 + values.flightMinutes,
      rows: values.rows,
      blankRowsAfter: values.rows > 0 ? values.blankRowsAfter : 0,
    })

    if (error) {
      setProblem(error)
      return
    }

    setIsEditing(false)
    onChanged()
  }

  const handleDelete = async () => {
    const { error } = await deleteMutation.trigger('DELETE', undefined)
    if (error) {
      setProblem(error)
      return
    }
    onChanged()
  }

  const flightTimeLabel = `${Math.floor(note.flightMins / 60)}:${String(note.flightMins % 60).padStart(2, '0')}`

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Icon icon='mdi:wrench' width={20} />
          {t('flightLog.maintenanceNotes.viewTitle')}
          {closedHil.length > 0 && (
            <Chip size='small' label='HIL' color='warning' sx={{ ml: 'auto' }} />
          )}
        </DialogTitle>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <SnackAlert problem={problem} />

            {isEditing ? (
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
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  mt: 1,
                }}
              >
                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.maintenanceNotes.description')}
                  </Typography>
                  <Typography>{note.description}</Typography>
                </Box>

                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.maintenanceNotes.performedBy')}
                  </Typography>
                  <Typography>{note.performedBy}</Typography>
                </Box>

                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.maintenanceNotes.flightTime')}
                  </Typography>
                  <Typography>{flightTimeLabel}</Typography>
                </Box>

                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.maintenanceNotes.rows')}
                  </Typography>
                  <Typography>{note.rows}</Typography>
                </Box>

                {note.blankRowsAfter > 0 && (
                  <Box>
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {t('flightLog.maintenanceNotes.blankRowsAfter')}
                    </Typography>
                    <Typography>{note.blankRowsAfter}</Typography>
                  </Box>
                )}

                {closedHil.length > 0 && (
                  <Box>
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {t('flightLog.maintenanceNotes.closedHil')}
                    </Typography>
                    {closedHil.map((entry) => (
                      <Link
                        key={entry.hilId}
                        component={RouterLink}
                        to={`/fly?registration=${encodeURIComponent(note.aircraftRegistration)}&hil=${entry.hilId}`}
                        variant='body2'
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <Icon icon='mdi:clipboard-list' width={16} />
                        {`HIL #${entry.hilNumber} — ${entry.description}`}
                      </Link>
                    ))}
                  </Box>
                )}

                {closedDefects.length > 0 && (
                  <Box>
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {t('flightLog.maintenanceNotes.closedDefects')}
                    </Typography>
                    {closedDefects.map((defect) => (
                      <Link
                        key={defect.defectId}
                        component='button'
                        type='button'
                        onClick={() => handleOpenDefect(defect)}
                        variant='body2'
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, textAlign: 'left' }}
                      >
                        <Icon icon='mdi:alert-circle-check-outline' width={16} />
                        {defect.description}
                      </Link>
                    ))}
                  </Box>
                )}

                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.maintenanceNotes.recordedBy')}
                  </Typography>
                  <Typography variant='body2'>{note.createdBy}</Typography>
                </Box>
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ p: 2, gap: 1 }}>
            {canModify && !isEditing && (
              <Button
                color='error'
                variant='outlined'
                onClick={() => setConfirmDeleteOpen(true)}
                startIcon={<Icon icon='mdi:delete' />}
              >
                {t('general.delete')}
              </Button>
            )}

            <Button onClick={isEditing ? handleEditToggle : onClose} variant='outlined'>
              {isEditing ? t('general.cancel') : t('general.close')}
            </Button>

            {canModify && !isEditing && (
              <Button
                variant='contained'
                onClick={handleEditToggle}
                startIcon={<Icon icon='mdi:pencil' />}
              >
                {t('general.edit')}
              </Button>
            )}

            {isEditing && <SaveButton loading={updateMutation.isMutating} />}
          </DialogActions>
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('flightLog.maintenanceNotes.deleteTitle')}
        message={t('flightLog.maintenanceNotes.deleteMessage')}
        confirmText={t('general.delete')}
        cancelText={t('general.cancel')}
        severity='error'
      />
    </>
  )
}
