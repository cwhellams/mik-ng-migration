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
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Icon } from '@iconify/react'
import useApi from '../../hooks/useApi'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'
import {
  MaintenanceNoteFormSchema,
  type MaintenanceNoteFormValues,
} from './maintenanceNoteFormSchema'
import { useRoles } from '../../hooks/useRoles'
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
    resolver: zodResolver(MaintenanceNoteFormSchema),
    values: {
      description: note.description,
      performedBy: note.performedBy,
      flightHours: Math.floor(note.flightMins / 60),
      flightMinutes: note.flightMins % 60,
      blankRowsAfter: note.blankRowsAfter,
    },
  })

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
      blankRowsAfter: values.blankRowsAfter,
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
          {note.hilId && (
            <Chip
              size='small'
              label='HIL'
              color='warning'
              sx={{ ml: 'auto' }}
            />
          )}
        </DialogTitle>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <SnackAlert problem={problem} />

            {isEditing ? (
              <Box
                sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}
              >
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
                    color='text.secondary'
                    gutterBottom
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
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position='end'>h</InputAdornment>
                            ),
                          }}
                          inputProps={{ min: 0 }}
                          sx={{ flex: 1 }}
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
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position='end'>
                                min
                              </InputAdornment>
                            ),
                          }}
                          inputProps={{ min: 0, max: 59 }}
                          sx={{ flex: 1 }}
                        />
                      )}
                    />
                  </Box>
                </Box>

                <Controller
                  name='blankRowsAfter'
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={t('flightLog.maintenanceNotes.blankRowsAfter')}
                      type='number'
                      error={!!errors.blankRowsAfter}
                      helperText={
                        errors.blankRowsAfter?.message ??
                        t('flightLog.maintenanceNotes.blankRowsAfterHelp')
                      }
                      fullWidth
                      inputProps={{ min: 0 }}
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
                  <Typography variant='caption' color='text.secondary'>
                    {t('flightLog.maintenanceNotes.description')}
                  </Typography>
                  <Typography>{note.description}</Typography>
                </Box>

                <Box>
                  <Typography variant='caption' color='text.secondary'>
                    {t('flightLog.maintenanceNotes.performedBy')}
                  </Typography>
                  <Typography>{note.performedBy}</Typography>
                </Box>

                <Box>
                  <Typography variant='caption' color='text.secondary'>
                    {t('flightLog.maintenanceNotes.flightTime')}
                  </Typography>
                  <Typography>{flightTimeLabel}</Typography>
                </Box>

                {note.blankRowsAfter > 0 && (
                  <Box>
                    <Typography variant='caption' color='text.secondary'>
                      {t('flightLog.maintenanceNotes.blankRowsAfter')}
                    </Typography>
                    <Typography>{note.blankRowsAfter}</Typography>
                  </Box>
                )}

                {note.hilId && (
                  <Box>
                    <Typography variant='caption' color='text.secondary'>
                      {t('flightLog.maintenanceNotes.hilId')}
                    </Typography>
                    <Typography
                      variant='body2'
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {note.hilId}
                    </Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant='caption' color='text.secondary'>
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

            <Button
              onClick={isEditing ? handleEditToggle : onClose}
              variant='outlined'
            >
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
