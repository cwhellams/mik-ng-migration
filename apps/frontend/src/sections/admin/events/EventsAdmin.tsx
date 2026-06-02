import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '../../../components/RemoteContent'
import { useThemeMode } from '../../../theme/ThemeContext'
import type {
  ClubEvent,
  EventListResponse,
} from '@backend/routes/events/models'

interface EventForm {
  title: string
  description: string
  location: string
  startTime: Dayjs | null
  endTime: Dayjs | null
  isPublic: boolean
}

const emptyForm = (): EventForm => ({
  title: '',
  description: '',
  location: '',
  startTime: dayjs().add(7, 'day').startOf('hour'),
  endTime: dayjs().add(7, 'day').startOf('hour').add(2, 'hour'),
  isPublic: false,
})

const eventToForm = (event: ClubEvent): EventForm => ({
  title: event.title,
  description: event.description ?? '',
  location: event.location ?? '',
  startTime: dayjs(event.startTime),
  endTime: dayjs(event.endTime),
  isPublic: event.isPublic,
})

const EventsAdmin = () => {
  const { t } = useTranslation()
  const { sudo } = useThemeMode()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null)
  const [form, setForm] = useState<EventForm>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<ClubEvent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { data, isLoading, error, mutation, mutate } =
    useApi<EventListResponse>({
      url: 'v1/events',
    })

  // Only show admin features if in admin mode
  if (!sudo) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography sx={{ color: 'warning.main' }}>
          {t('common.requiresAdminMode')}
        </Typography>
      </Box>
    )
  }

  const events = data?.events ?? []
  const now = dayjs()
  const upcomingEvents = events.filter((e) => dayjs(e.endTime).isAfter(now))
  const pastEvents = events.filter((e) => !dayjs(e.endTime).isAfter(now))

  const openCreate = () => {
    setEditingEvent(null)
    setForm(emptyForm())
    setSaveError(null)
    setDialogOpen(true)
  }

  const openEdit = (event: ClubEvent) => {
    setEditingEvent(event)
    setForm(eventToForm(event))
    setSaveError(null)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.startTime || !form.endTime) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        location: form.location || null,
        startTime: form.startTime.toISOString(),
        endTime: form.endTime.toISOString(),
        isPublic: form.isPublic,
      }

      const response = editingEvent
        ? await mutation.trigger('PUT', payload, editingEvent.eventId)
        : await mutation.trigger('POST', payload)
      if (response.error) {
        setSaveError(t('events.saveError'))
        return
      }
      await mutate()
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await mutation.trigger(
        'DELETE',
        undefined,
        deleteTarget.eventId
      )
      if (response.error) {
        setDeleteError(t('events.deleteError'))
        return
      }
      await mutate()
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const isFormValid =
    form.title.trim().length > 0 &&
    form.startTime !== null &&
    form.endTime !== null &&
    form.endTime.isAfter(form.startTime)

  const renderEventRow = (event: ClubEvent) => {
    const start = dayjs(event.startTime)
    const end = dayjs(event.endTime)
    const isMultiDay = !start.isSame(end, 'day')
    const dateLabel = isMultiDay
      ? `${start.format('D.M.YYYY HH:mm')} – ${end.format('D.M.YYYY HH:mm')}`
      : `${start.format('D.M.YYYY')} ${start.format('HH:mm')} – ${end.format('HH:mm')}`
    const isPast = end.isBefore(now)

    return (
      <Box key={event.eventId}>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            py: 2,
            alignItems: 'flex-start',
            opacity: isPast ? 0.65 : 1,
          }}
        >
          <Box flex={1} minWidth={0}>
            <Stack direction='row' alignItems='center' gap={1} flexWrap='wrap'>
              <Typography fontWeight='medium'>{event.title}</Typography>
              {event.isPublic && (
                <Chip
                  label={t('events.public')}
                  size='small'
                  color='primary'
                  variant='outlined'
                />
              )}
              {isPast && (
                <Chip
                  label={t('events.past')}
                  size='small'
                  variant='outlined'
                />
              )}
            </Stack>
            <Stack direction='row' alignItems='center' gap={0.5} mt={0.5}>
              <Icon icon='mdi:clock-outline' width={14} />
              <Typography variant='body2' color='text.secondary'>
                {dateLabel}
              </Typography>
            </Stack>
            {event.location && (
              <Stack direction='row' alignItems='center' gap={0.5} mt={0.25}>
                <Icon icon='mdi:map-marker-outline' width={14} />
                <Typography variant='body2' color='text.secondary'>
                  {event.location}
                </Typography>
              </Stack>
            )}
          </Box>

          <Stack direction='row' gap={0.5}>
            <Tooltip title={t('common.edit')}>
              <IconButton size='small' onClick={() => openEdit(event)}>
                <Icon icon='mdi:pencil' width={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('common.delete')}>
              <IconButton
                size='small'
                color='error'
                onClick={() => setDeleteTarget(event)}
              >
                <Icon icon='mdi:delete' width={18} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
        <Divider />
      </Box>
    )
  }

  return (
    <>
      <Title label={t('events.adminTitle')}>
        <Stack direction='row' gap={1}>
          <Button
            component={Link}
            to='/club/events'
            variant='outlined'
            startIcon={<Icon icon='mdi:eye' />}
          >
            {t('events.viewAll')}
          </Button>
          <Button
            variant='contained'
            startIcon={<Icon icon='mdi:plus' />}
            onClick={openCreate}
          >
            {t('events.create')}
          </Button>
        </Stack>
      </Title>

      <RemoteContent isLoading={isLoading} error={error}>
        {events.length === 0 ? (
          <Typography color='text.secondary'>{t('events.noEvents')}</Typography>
        ) : (
          <>
            {upcomingEvents.length > 0 && (
              <>
                <Typography variant='subtitle1' fontWeight='bold' mb={1}>
                  {t('events.upcoming')}
                </Typography>
                {upcomingEvents.map(renderEventRow)}
              </>
            )}

            {pastEvents.length > 0 && (
              <>
                <Typography variant='subtitle1' fontWeight='bold' mt={3} mb={1}>
                  {t('events.past_section')}
                </Typography>
                {[...pastEvents].reverse().map(renderEventRow)}
              </>
            )}
          </>
        )}
      </RemoteContent>

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>
          {editingEvent ? t('events.editEvent') : t('events.createEvent')}
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            {saveError && <Alert severity='error'>{saveError}</Alert>}
            <TextField
              label={t('events.form.title')}
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              required
              fullWidth
              inputProps={{ maxLength: 200 }}
            />

            <DateTimePicker
              label={t('events.form.startTime')}
              value={form.startTime}
              onChange={(v) => setForm((f) => ({ ...f, startTime: v }))}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <DateTimePicker
              label={t('events.form.endTime')}
              value={form.endTime}
              minDateTime={form.startTime ?? undefined}
              onChange={(v) => setForm((f) => ({ ...f, endTime: v }))}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <TextField
              label={t('events.form.location')}
              value={form.location}
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
              fullWidth
            />

            <TextField
              label={t('events.form.description')}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              fullWidth
              multiline
              rows={4}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.isPublic}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isPublic: e.target.checked }))
                  }
                />
              }
              label={t('events.form.isPublic')}
            />
            <Typography variant='caption' color='text.secondary' mt={-1.5}>
              {t('events.form.isPublicHint')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={!isFormValid || saving}
          >
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth='xs'
      >
        <DialogTitle>{t('events.deleteTitle')}</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity='error' sx={{ mb: 1 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            {t('events.deleteConfirm', { title: deleteTarget?.title ?? '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteTarget(null)
              setDeleteError(null)
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant='contained'
            color='error'
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default EventsAdmin
