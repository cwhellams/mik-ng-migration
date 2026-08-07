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
  Menu,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '../../../components/RemoteContent'
import { useTimezone } from '../../../hooks/useTimezone'
import { getOffsetLabelInTz, timezoneName } from '../../../utils/date'
import type { ClubEvent, EventListResponse } from '@backend/routes/events/models'

type EventTimezone = 'helsinki' | 'utc' | 'local'

type TranslationLanguage = 'fi' | 'sv'
const TRANSLATION_LANGUAGES: TranslationLanguage[] = ['fi', 'sv']

interface TranslationForm {
  title: string
  description: string
}

interface EventForm {
  title: string
  description: string
  location: string
  performer: string
  startTime: Dayjs | null
  endTime: Dayjs | null
  timezone: EventTimezone
  isPublic: boolean
  translations: Partial<Record<TranslationLanguage, TranslationForm>>
}

const emptyForm = (): EventForm => ({
  title: '',
  description: '',
  location: '',
  performer: '',
  startTime: dayjs().add(7, 'day').startOf('hour'),
  endTime: dayjs().add(7, 'day').startOf('hour').add(2, 'hour'),
  timezone: 'helsinki',
  isPublic: false,
  translations: {},
})

const eventToForm = (event: ClubEvent): EventForm => ({
  title: event.title,
  description: event.description ?? '',
  location: event.location ?? '',
  performer: event.performer ?? '',
  startTime: dayjs(event.startTime),
  endTime: dayjs(event.endTime),
  // The backend only persists the resulting UTC instant, not the zone it was entered in,
  // so we can't recover the original selector value — default to Helsinki intentionally.
  timezone: 'helsinki',
  isPublic: event.isPublic,
  translations: {
    ...(event.translations.fi && {
      fi: {
        title: event.translations.fi.title,
        description: event.translations.fi.description ?? '',
      },
    }),
    ...(event.translations.sv && {
      sv: {
        title: event.translations.sv.title,
        description: event.translations.sv.description ?? '',
      },
    }),
  },
})

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Matches the backend's raw upload ceiling (apps/backend/src/util/imageUpload.ts) —
// the server compresses images down after upload, so this is a sanity ceiling on the
// original file, not the effective size limit (issue #1075).
const MAX_IMAGE_UPLOAD_BYTES = 40 * 1024 * 1024

const EventsAdmin = () => {
  const { t } = useTranslation()
  const { formatDateCustom, formatTime, timezoneOffset } = useTimezone()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null)
  const [form, setForm] = useState<EventForm>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<ClubEvent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [translationMenuAnchor, setTranslationMenuAnchor] = useState<HTMLElement | null>(null)

  const { data, isLoading, error, mutation, mutate } = useApi<EventListResponse>({
    url: 'v1/events',
  })
  const { mutation: imageMutation } = useApi<ClubEvent>({
    method: 'POST',
    url: 'v1/events',
    skipFetch: true,
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  const events = data?.events ?? []
  const now = dayjs()
  const upcomingEvents = events.filter((e) => dayjs(e.endTime).isAfter(now))
  const pastEvents = events.filter((e) => !dayjs(e.endTime).isAfter(now))

  const resetImageState = (previewUrl: string | null) => {
    setImageFile(null)
    setImagePreviewUrl(previewUrl)
    setImageRemoved(false)
    setImageError(null)
  }

  const openCreate = () => {
    setEditingEvent(null)
    setForm(emptyForm())
    setSaveError(null)
    resetImageState(null)
    setDialogOpen(true)
  }

  const openEdit = (event: ClubEvent) => {
    setEditingEvent(event)
    setForm(eventToForm(event))
    setSaveError(null)
    resetImageState(event.imageUrl)
    setDialogOpen(true)
  }

  const handleImageSelect = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError(t('events.form.imageTypeError'))
      return
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setImageError(t('events.form.imageSizeError', { maxSize: '40 MB' }))
      return
    }
    if (imageFile && imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    setImageError(null)
    setImageFile(file)
    setImageRemoved(false)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const handleImageRemove = () => {
    if (imageFile && imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    setImageFile(null)
    setImagePreviewUrl(null)
    setImageError(null)
    setImageRemoved(!!editingEvent?.imageUrl)
  }

  const addTranslation = (language: TranslationLanguage) => {
    setForm((f) => ({
      ...f,
      translations: { ...f.translations, [language]: { title: '', description: '' } },
    }))
    setTranslationMenuAnchor(null)
  }

  const removeTranslation = (language: TranslationLanguage) => {
    setForm((f) => {
      const translations = { ...f.translations }
      delete translations[language]
      return { ...f, translations }
    })
  }

  const updateTranslationField = (
    language: TranslationLanguage,
    field: keyof TranslationForm,
    value: string,
  ) => {
    setForm((f) => ({
      ...f,
      translations: {
        ...f.translations,
        [language]: {
          ...(f.translations[language] ?? { title: '', description: '' }),
          [field]: value,
        },
      },
    }))
  }

  const buildTranslationsPayload = () => {
    const payload: Partial<
      Record<TranslationLanguage, { title: string; description: string | null } | null>
    > = {}

    for (const language of TRANSLATION_LANGUAGES) {
      const block = form.translations[language]
      if (block) {
        payload[language] = {
          title: block.title.trim(),
          description: block.description.trim() || null,
        }
      } else if (editingEvent?.translations[language]) {
        payload[language] = null
      }
    }

    return Object.keys(payload).length > 0 ? payload : undefined
  }

  const handleSave = async () => {
    if (!form.startTime || !form.endTime) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        location: form.location || null,
        performer: form.performer.trim() || null,
        translations: buildTranslationsPayload(),
        startTime: form.startTime.toISOString(),
        endTime: form.endTime.toISOString(),
        isPublic: form.isPublic,
      }

      const response = editingEvent
        ? await mutation.trigger<typeof payload, ClubEvent>('PUT', payload, editingEvent.eventId)
        : await mutation.trigger<typeof payload, ClubEvent>('POST', payload)

      if (response.error) {
        setSaveError(t('events.saveError'))
        return
      }

      const eventId = editingEvent?.eventId ?? response.data?.eventId
      if (eventId) {
        if (imageFile) {
          const formData = new FormData()
          formData.append('file', imageFile)
          const imageResponse = await imageMutation.trigger('POST', formData, `${eventId}/image`)
          if (imageResponse.error) {
            setSaveError(t('events.form.uploadError'))
            return
          }
        } else if (imageRemoved) {
          const imageResponse = await imageMutation.trigger('DELETE', undefined, `${eventId}/image`)
          if (imageResponse.error) {
            setSaveError(t('events.form.uploadError'))
            return
          }
        }
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
      const response = await mutation.trigger('DELETE', undefined, deleteTarget.eventId)
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

  const activeTranslationLanguages = TRANSLATION_LANGUAGES.filter((l) => l in form.translations)
  const availableTranslationLanguages = TRANSLATION_LANGUAGES.filter(
    (l) => !(l in form.translations),
  )
  const translationsValid = activeTranslationLanguages.every(
    (l) => (form.translations[l]?.title.trim().length ?? 0) > 0,
  )

  const isFormValid =
    form.title.trim().length > 0 &&
    form.startTime !== null &&
    form.endTime !== null &&
    form.endTime.isAfter(form.startTime) &&
    !imageError &&
    translationsValid

  const renderEventRow = (event: ClubEvent) => {
    const start = dayjs(event.startTime)
    const end = dayjs(event.endTime)
    const isMultiDay = formatDateCustom(start, 'YYYY-MM-DD') !== formatDateCustom(end, 'YYYY-MM-DD')
    const dateLabel = isMultiDay
      ? `${formatDateCustom(start, 'D.M.YYYY HH:mm')} – ${formatDateCustom(end, 'D.M.YYYY HH:mm')}`
      : `${formatDateCustom(start, 'D.M.YYYY')} ${formatTime(start.toDate())} – ${formatTime(end.toDate())}`
    const tzLabel = timezoneOffset(start.toDate())
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
          {event.imageUrl && (
            <Box
              component='img'
              src={event.imageUrl}
              alt=''
              sx={{
                width: 56,
                height: 56,
                borderRadius: 1,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          )}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <Stack
              direction='row'
              sx={{
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              <Typography
                sx={{
                  fontWeight: 'medium',
                }}
              >
                {event.title}
              </Typography>
              {event.isPublic && (
                <Chip label={t('events.public')} size='small' color='primary' variant='outlined' />
              )}
              {isPast && <Chip label={t('events.past')} size='small' variant='outlined' />}
            </Stack>
            <Stack
              direction='row'
              sx={{
                alignItems: 'center',
                gap: 0.5,
                mt: 0.5,
              }}
            >
              <Icon icon='mdi:clock-outline' width={14} />
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {dateLabel} ({tzLabel})
              </Typography>
            </Stack>
            {event.location && (
              <Stack
                direction='row'
                sx={{
                  alignItems: 'center',
                  gap: 0.5,
                  mt: 0.25,
                }}
              >
                <Icon icon='mdi:map-marker-outline' width={14} />
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {event.location}
                </Typography>
              </Stack>
            )}
          </Box>

          <Stack
            direction='row'
            sx={{
              gap: 0.5,
            }}
          >
            <Tooltip title={t('common.edit')}>
              <IconButton size='small' onClick={() => openEdit(event)}>
                <Icon icon='mdi:pencil' width={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('common.delete')}>
              <IconButton size='small' color='error' onClick={() => setDeleteTarget(event)}>
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
        <Stack
          direction='row'
          sx={{
            gap: 1,
          }}
        >
          <Button
            component={Link}
            to='/club/events'
            variant='outlined'
            startIcon={<Icon icon='mdi:eye' />}
          >
            {t('events.viewAll')}
          </Button>
          <Button variant='contained' startIcon={<Icon icon='mdi:plus' />} onClick={openCreate}>
            {t('events.create')}
          </Button>
        </Stack>
      </Title>
      <RemoteContent isLoading={isLoading} error={error}>
        {events.length === 0 ? (
          <Typography
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('events.noEvents')}
          </Typography>
        ) : (
          <>
            {upcomingEvents.length > 0 && (
              <>
                <Typography
                  variant='subtitle1'
                  sx={{
                    fontWeight: 'bold',
                    mb: 1,
                  }}
                >
                  {t('events.upcoming')}
                </Typography>
                {upcomingEvents.map(renderEventRow)}
              </>
            )}

            {pastEvents.length > 0 && (
              <>
                <Typography
                  variant='subtitle1'
                  sx={{
                    fontWeight: 'bold',
                    mt: 3,
                    mb: 1,
                  }}
                >
                  {t('events.past_section')}
                </Typography>
                {[...pastEvents].reverse().map(renderEventRow)}
              </>
            )}
          </>
        )}
      </RemoteContent>
      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>{editingEvent ? t('events.editEvent') : t('events.createEvent')}</DialogTitle>
        <DialogContent>
          <Stack
            sx={{
              gap: 2,
              mt: 1,
            }}
          >
            {saveError && <Alert severity='error'>{saveError}</Alert>}
            <TextField
              label={t('events.form.title')}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              fullWidth
              slotProps={{
                htmlInput: { maxLength: 200 },
              }}
            />

            <Box>
              <Typography variant='body2' sx={{ mb: 0.5 }}>
                {t('events.form.timezone')}
              </Typography>
              <ToggleButtonGroup
                value={form.timezone}
                exclusive
                size='small'
                onChange={(_, value: EventTimezone | null) => {
                  if (value !== null) setForm((f) => ({ ...f, timezone: value }))
                }}
                aria-label={t('events.form.timezone')}
              >
                <ToggleButton value='helsinki' aria-label='Helsinki time'>
                  {t('events.form.timezoneHelsinki')}
                </ToggleButton>
                <ToggleButton value='utc' aria-label='UTC time'>
                  {t('flightLog.utcTime')}
                </ToggleButton>
                <ToggleButton value='local' aria-label='Local time'>
                  {t('flightLog.localTime')}
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography
                variant='caption'
                sx={{
                  display: 'block',
                  mt: 0.5,
                  color: 'text.secondary',
                }}
              >
                {t('events.form.timezoneHint')}
              </Typography>
            </Box>

            <DateTimePicker
              label={t('events.form.startTimeTz', {
                tz: getOffsetLabelInTz(form.startTime?.toDate(), form.timezone),
              })}
              value={form.startTime}
              timezone={timezoneName(form.timezone)}
              onChange={(v) => setForm((f) => ({ ...f, startTime: v }))}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <DateTimePicker
              label={t('events.form.endTimeTz', {
                tz: getOffsetLabelInTz(form.endTime?.toDate(), form.timezone),
              })}
              value={form.endTime}
              timezone={timezoneName(form.timezone)}
              minDateTime={form.startTime ?? undefined}
              onChange={(v) => setForm((f) => ({ ...f, endTime: v }))}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <TextField
              label={t('events.form.location')}
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              fullWidth
            />

            <TextField
              label={t('events.form.description')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              rows={4}
            />

            <TextField
              label={t('events.form.performer')}
              value={form.performer}
              onChange={(e) => setForm((f) => ({ ...f, performer: e.target.value }))}
              fullWidth
              helperText={t('events.form.performerHint')}
              slotProps={{
                htmlInput: { maxLength: 200 },
              }}
            />

            <Box>
              <Typography variant='body2' sx={{ mb: 0.5 }}>
                {t('events.form.image')}
              </Typography>
              {imagePreviewUrl ? (
                <Stack direction='row' sx={{ alignItems: 'center', gap: 1.5 }}>
                  <Box
                    component='img'
                    src={imagePreviewUrl}
                    alt=''
                    sx={{ width: 80, height: 80, borderRadius: 1, objectFit: 'cover' }}
                  />
                  <Button
                    size='small'
                    color='error'
                    variant='outlined'
                    startIcon={<Icon icon='mdi:delete' />}
                    onClick={handleImageRemove}
                  >
                    {t('events.form.removeImage')}
                  </Button>
                </Stack>
              ) : (
                <Button
                  size='small'
                  variant='outlined'
                  component='label'
                  startIcon={<Icon icon='mdi:image-plus' />}
                >
                  {t('events.form.image')}
                  <input
                    type='file'
                    hidden
                    accept={ALLOWED_IMAGE_TYPES.join(',')}
                    capture='environment'
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImageSelect(file)
                      e.target.value = ''
                    }}
                  />
                </Button>
              )}
              <Typography
                variant='caption'
                sx={{
                  display: 'block',
                  mt: 0.5,
                  color: imageError ? 'error.main' : 'text.secondary',
                }}
              >
                {imageError ?? t('events.form.imageHint')}
              </Typography>
            </Box>

            <Box>
              <Stack
                direction='row'
                sx={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Typography variant='body2'>{t('events.form.addTranslation')}</Typography>
                {availableTranslationLanguages.length > 0 && (
                  <Button
                    size='small'
                    startIcon={<Icon icon='mdi:plus' />}
                    onClick={(e) => setTranslationMenuAnchor(e.currentTarget)}
                  >
                    {t('events.form.addTranslation')}
                  </Button>
                )}
              </Stack>
              <Menu
                anchorEl={translationMenuAnchor}
                open={!!translationMenuAnchor}
                onClose={() => setTranslationMenuAnchor(null)}
              >
                {availableTranslationLanguages.map((language) => (
                  <MenuItem key={language} onClick={() => addTranslation(language)}>
                    {t(`events.form.languages.${language}`)}
                  </MenuItem>
                ))}
              </Menu>

              {activeTranslationLanguages.map((language) => (
                <Box
                  key={language}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    mt: 1.5,
                  }}
                >
                  <Stack
                    direction='row'
                    sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
                  >
                    <Chip label={t(`events.form.languages.${language}`)} size='small' />
                    <Tooltip title={t('events.form.removeTranslation')}>
                      <IconButton size='small' onClick={() => removeTranslation(language)}>
                        <Icon icon='mdi:close' width={16} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Stack sx={{ gap: 1.5 }}>
                    <TextField
                      label={t('events.form.translationTitle')}
                      value={form.translations[language]?.title ?? ''}
                      onChange={(e) => updateTranslationField(language, 'title', e.target.value)}
                      required
                      fullWidth
                      slotProps={{ htmlInput: { maxLength: 200 } }}
                    />
                    <TextField
                      label={t('events.form.translationDescription')}
                      value={form.translations[language]?.description ?? ''}
                      onChange={(e) =>
                        updateTranslationField(language, 'description', e.target.value)
                      }
                      fullWidth
                      multiline
                      rows={3}
                    />
                  </Stack>
                </Box>
              ))}
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={form.isPublic}
                  onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
                />
              }
              label={t('events.form.isPublic')}
            />
            <Typography
              variant='caption'
              sx={{
                color: 'text.secondary',
                mt: -1.5,
              }}
            >
              {t('events.form.isPublicHint')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant='contained' onClick={handleSave} disabled={!isFormValid || saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth='xs'>
        <DialogTitle>{t('events.deleteTitle')}</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity='error' sx={{ mb: 1 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>{t('events.deleteConfirm', { title: deleteTarget?.title ?? '' })}</Typography>
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
          <Button variant='contained' color='error' onClick={handleDelete} disabled={deleting}>
            {deleting ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default EventsAdmin
