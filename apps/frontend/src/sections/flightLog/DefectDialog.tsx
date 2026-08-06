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
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  Link,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm, Controller, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Icon } from '@iconify/react'
import useApi from '../../hooks/useApi'
import { useMaintenanceNotes } from '../../hooks/useMaintenanceNotes'
import type { Defect } from '@backend/routes/defects/models'
import type { AircraftHil } from '@backend/routes/aircraft-hil/models'
import { useRoles } from '../../hooks/useRoles'
import { SaveButton } from '../../components/SaveButton'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { EditHilModal, type HilEditMode } from '../aircrafts/components/hil/EditHilModal'
import { useOpenNoteLink } from './useOpenNoteLink'

const EditDefectFormSchema = z
  .object({
    description: z.string().min(1),
    rows: z.coerce.number().int().min(0).optional(),
    blankRowsAfter: z.coerce.number().int().min(0).optional(),
  })
  .refine((data) => (data.rows ?? 1) > 0 || (data.blankRowsAfter ?? 0) === 0, {
    message: 'blankRowsAfter must be 0 when rows is 0',
    path: ['blankRowsAfter'],
  })

type EditDefectFormValues = z.infer<typeof EditDefectFormSchema>

interface DefectDialogProps {
  defect: Defect
  aircraftRegistration: string
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export const DefectDialog: React.FC<DefectDialogProps> = ({
  defect,
  aircraftRegistration,
  open,
  onClose,
  onChanged,
}) => {
  const { t } = useTranslation()
  const { me, isFlightLogAdmin } = useRoles()
  const [isEditing, setIsEditing] = useState(false)
  const [problem, setProblem] = useState<Problem | undefined>()
  const [selectedHilId, setSelectedHilId] = useState<string>(defect.hilId ?? '')
  const [isLinkingHil, setIsLinkingHil] = useState(false)
  const [resolvedNoteId, setResolvedNoteId] = useState('')
  const [isResolvingOpen, setIsResolvingOpen] = useState(false)
  const [hilEditMode, setHilEditMode] = useState<HilEditMode | undefined>()

  const canModify = isFlightLogAdmin || defect.createdBy === me?.memberId

  useEffect(() => {
    if (open) {
      setSelectedHilId(defect.hilId ?? '')
      setResolvedNoteId('')
      setIsLinkingHil(false)
      setIsResolvingOpen(false)
      setProblem(undefined)
      setIsEditing(false)
    }
  }, [open, defect.hilId])

  const { mutation: updateMutation } = useApi<Defect>({
    url: `v1/defects/${defect.defectId}`,
    skipFetch: true,
  })

  // Every flight-log user may read the hold item list, so the linked entry can
  // be named (and linked to) for pilots as well, not just plane captains.
  const { data: hilEntries } = useApi<AircraftHil[]>({
    url: 'v1/aircraft-hil',
    params: { aircraftRegistration },
    skipFetch: !open,
  })

  // Needed both to populate the "close with note" picker (MOVED_TO_HIL) and to
  // resolve the note this defect was already resolved by, for the link below.
  const { data: maintenanceNotes } = useMaintenanceNotes(
    open && (defect.status === 'MOVED_TO_HIL' || defect.resolvedNoteId)
      ? aircraftRegistration
      : undefined,
  )

  const handleOpenNote = useOpenNoteLink(aircraftRegistration)

  // In-flight defects (flightId set) are always inline chips anchored to that flight --
  // rows/blankRowsAfter can only be corrected on a pre-flight (standalone) defect.
  const isPreFlight = defect.flightId == null

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditDefectFormValues>({
    resolver: zodResolver(EditDefectFormSchema) as Resolver<EditDefectFormValues>,
    values: {
      description: defect.description,
      rows: defect.rows,
      blankRowsAfter: defect.blankRowsAfter,
    },
  })

  const rows = useWatch({ control, name: 'rows' })

  const handleEditToggle = () => {
    if (isEditing) reset()
    setProblem(undefined)
    setIsEditing(!isEditing)
  }

  const onSubmit = async (values: EditDefectFormValues) => {
    const { error } = await updateMutation.trigger('PATCH', {
      description: values.description,
      ...(isPreFlight && {
        rows: values.rows,
        blankRowsAfter: values.rows === 0 ? 0 : values.blankRowsAfter,
      }),
    })
    if (error) {
      setProblem(error)
      return
    }
    setIsEditing(false)
    onChanged()
  }

  const handleLinkHil = async () => {
    const { error } = await updateMutation.trigger('PATCH', {
      hilId: selectedHilId || null,
    })
    if (error) {
      setProblem(error)
      return
    }
    setIsLinkingHil(false)
    onChanged()
  }

  const handleResolve = async () => {
    if (!resolvedNoteId.trim()) return
    const { error } = await updateMutation.trigger('PATCH', {
      resolvedNoteId: resolvedNoteId.trim(),
    })
    if (error) {
      setProblem(error)
      return
    }
    setIsResolvingOpen(false)
    onChanged()
  }

  const statusColor =
    defect.status === 'ACTIVE' ? 'error' : defect.status === 'MOVED_TO_HIL' ? 'warning' : 'success'

  const flightTimeLabel = `${Math.floor(defect.flightMins / 60)}:${String(defect.flightMins % 60).padStart(2, '0')}`

  const linkedHil = hilEntries?.find((h) => h.hilId === defect.hilId)
  const resolvedByNote = maintenanceNotes?.find((n) => n.noteId === defect.resolvedNoteId)

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon icon='mdi:alert-circle' width={20} />
        {t('flightLog.defects.viewTitle')}
        <Chip
          size='small'
          label={t(`flightLog.defects.status.${defect.status}`)}
          color={statusColor}
          sx={{ ml: 'auto' }}
        />
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
                    label={t('flightLog.defects.description')}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                    fullWidth
                    required
                    autoFocus
                    multiline
                    minRows={2}
                  />
                )}
              />

              {isPreFlight && (
                <>
                  <Controller
                    name='rows'
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={t('flightLog.maintenanceNotes.rows')}
                        type='number'
                        error={!!errors.rows}
                        helperText={
                          errors.rows?.message ?? t('flightLog.maintenanceNotes.rowsHelp')
                        }
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
                </>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
              <Box>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('flightLog.defects.description')}
                </Typography>
                <Typography>{defect.description}</Typography>
              </Box>

              <Box>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('flightLog.defects.flightTime')}
                </Typography>
                <Typography>{flightTimeLabel}</Typography>
              </Box>

              {isPreFlight && (
                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.maintenanceNotes.rows')}
                  </Typography>
                  <Typography>{defect.rows}</Typography>
                </Box>
              )}

              {isPreFlight && defect.blankRowsAfter > 0 && (
                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.maintenanceNotes.blankRowsAfter')}
                  </Typography>
                  <Typography>{defect.blankRowsAfter}</Typography>
                </Box>
              )}

              {defect.hilId && (
                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.defects.linkedHil')}
                  </Typography>
                  <Link
                    component={RouterLink}
                    to={`/fly?registration=${encodeURIComponent(aircraftRegistration)}&hil=${defect.hilId}`}
                    variant='body2'
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <Icon icon='mdi:clipboard-list' width={16} />
                    {linkedHil
                      ? `HIL #${linkedHil.hilNumber} — ${linkedHil.description}`
                      : t('flightLog.defects.openHil')}
                  </Link>
                </Box>
              )}

              {defect.resolvedNoteId && (
                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('flightLog.defects.resolvedBy')}
                  </Typography>
                  <Link
                    component='button'
                    type='button'
                    onClick={() => resolvedByNote && handleOpenNote(resolvedByNote)}
                    variant='body2'
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, textAlign: 'left' }}
                  >
                    <Icon icon='mdi:wrench' width={16} />
                    {resolvedByNote
                      ? `${resolvedByNote.description} — ${resolvedByNote.performedBy}`
                      : t('flightLog.defects.openNote')}
                  </Link>
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
                <Typography variant='body2'>{defect.createdBy}</Typography>
              </Box>

              {isFlightLogAdmin && defect.status !== 'RESOLVED' && (
                <>
                  {isLinkingHil ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControl fullWidth size='small'>
                        <InputLabel>{t('flightLog.defects.selectHil')}</InputLabel>
                        <Select
                          value={selectedHilId}
                          label={t('flightLog.defects.selectHil')}
                          onChange={(e: SelectChangeEvent) => setSelectedHilId(e.target.value)}
                        >
                          <MenuItem value=''>
                            <em>{t('flightLog.defects.noHil')}</em>
                          </MenuItem>
                          {hilEntries
                            ?.filter((h) => !h.resolvedNoteId)
                            .map((hil) => (
                              <MenuItem key={hil.hilId} value={hil.hilId}>
                                HIL #{hil.hilNumber} — {hil.description}
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size='small'
                          onClick={() => setIsLinkingHil(false)}
                          variant='outlined'
                        >
                          {t('general.cancel')}
                        </Button>
                        <Button
                          size='small'
                          onClick={handleLinkHil}
                          variant='contained'
                          disabled={updateMutation.isMutating}
                        >
                          {t('general.save')}
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Button
                      size='small'
                      variant='outlined'
                      color='warning'
                      startIcon={<Icon icon='mdi:link' />}
                      onClick={() => {
                        setSelectedHilId(defect.hilId ?? '')
                        setIsLinkingHil(true)
                      }}
                    >
                      {defect.hilId
                        ? t('flightLog.defects.changeHil')
                        : t('flightLog.defects.linkHil')}
                    </Button>
                  )}

                  {!defect.hilId && !isLinkingHil && (
                    <Button
                      size='small'
                      variant='outlined'
                      color='warning'
                      startIcon={<Icon icon='mdi:clipboard-plus' />}
                      onClick={() => setHilEditMode('new')}
                    >
                      {t('flightLog.defects.deferToNewHil')}
                    </Button>
                  )}

                  {defect.status === 'MOVED_TO_HIL' &&
                    (isResolvingOpen ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <FormControl fullWidth size='small'>
                          <InputLabel>{t('flightLog.defects.resolvedNoteId')}</InputLabel>
                          <Select
                            value={resolvedNoteId}
                            label={t('flightLog.defects.resolvedNoteId')}
                            onChange={(e: SelectChangeEvent) => setResolvedNoteId(e.target.value)}
                          >
                            <MenuItem value=''>
                              <em>{t('flightLog.defects.noNote')}</em>
                            </MenuItem>
                            {maintenanceNotes?.map((note) => (
                              <MenuItem key={note.noteId} value={note.noteId}>
                                {note.description} — {note.performedBy}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size='small'
                            onClick={() => setIsResolvingOpen(false)}
                            variant='outlined'
                          >
                            {t('general.cancel')}
                          </Button>
                          <Button
                            size='small'
                            onClick={handleResolve}
                            variant='contained'
                            color='success'
                            disabled={updateMutation.isMutating || !resolvedNoteId.trim()}
                          >
                            {t('flightLog.defects.markResolved')}
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      <Button
                        size='small'
                        variant='outlined'
                        color='success'
                        startIcon={<Icon icon='mdi:check-circle' />}
                        onClick={() => setIsResolvingOpen(true)}
                      >
                        {t('flightLog.defects.markResolved')}
                      </Button>
                    ))}
                </>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={isEditing ? handleEditToggle : onClose} variant='outlined'>
            {isEditing ? t('general.cancel') : t('general.close')}
          </Button>

          {canModify && !isEditing && defect.status !== 'RESOLVED' && (
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

      <EditHilModal
        mode={hilEditMode}
        aircraftRegistration={aircraftRegistration}
        defect={{
          defectId: defect.defectId,
          description: defect.description,
        }}
        onClose={() => {
          setHilEditMode(undefined)
          onChanged()
        }}
      />
    </Dialog>
  )
}
