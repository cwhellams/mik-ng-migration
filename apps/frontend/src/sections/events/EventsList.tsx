import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router-dom'
import type { ClubEvent, EventListResponse } from '@backend/routes/events/models'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { useRoles } from '../../hooks/useRoles'
import { useThemeMode } from '../../theme/ThemeContext'
import { MIKPermissions } from '@backend/routes/members/models'
import dayjs from 'dayjs'
import { useState } from 'react'
import { downloadEventIcs, generateEventGoogleCalendarLink } from '../../utils/eventCalendar'

const EventCard = ({ event }: { event: ClubEvent }) => {
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const menuOpen = Boolean(anchorEl)

  const start = dayjs(event.startTime)
  const end = dayjs(event.endTime)
  const isMultiDay = !start.isSame(end, 'day')
  const isPast = end.isBefore(dayjs())

  const dateLabel = isMultiDay
    ? `${start.format('D.M.YYYY HH:mm')} – ${end.format('D.M.YYYY HH:mm')}`
    : `${start.format('D.M.YYYY')} ${start.format('HH:mm')} – ${end.format('HH:mm')}`

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        py: 2,
        opacity: isPast ? 0.65 : 1,
      }}
    >
      {/* Date column */}
      <Box
        sx={{
          minWidth: 64,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 0.5,
        }}
      >
        <Typography variant='h5' fontWeight='bold' lineHeight={1}>
          {start.format('D')}
        </Typography>
        <Typography variant='caption' color='text.secondary' textTransform='uppercase'>
          {start.format('MMM')}
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          {start.format('YYYY')}
        </Typography>
      </Box>

      {/* Content column */}
      <Box flex={1} minWidth={0}>
        <Stack direction='row' alignItems='flex-start' justifyContent='space-between' gap={1}>
          <Box flex={1} minWidth={0}>
            <Stack direction='row' alignItems='center' gap={1} flexWrap='wrap'>
              <Typography variant='h6' component='span'>
                {event.title}
              </Typography>
              {event.isPublic && (
                <Chip label={t('events.public')} size='small' color='primary' variant='outlined' />
              )}
              {isPast && <Chip label={t('events.past')} size='small' variant='outlined' />}
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

            {event.description && (
              <Typography variant='body2' mt={1} sx={{ whiteSpace: 'pre-line' }}>
                {event.description}
              </Typography>
            )}
          </Box>

          {/* Calendar add button */}
          <Tooltip title={t('events.addToCalendar')}>
            <IconButton
              size='small'
              onClick={(e) => setAnchorEl(e.currentTarget)}
              aria-label={t('events.addToCalendar')}
            >
              <Icon icon='mdi:calendar-plus' width={20} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Calendar add menu */}
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={() => setAnchorEl(null)}
        onClick={() => setAnchorEl(null)}
      >
        <MenuItem
          component='a'
          href={generateEventGoogleCalendarLink(event)}
          target='_blank'
          rel='noopener noreferrer'
        >
          <Icon icon='mdi:google' width={18} style={{ marginRight: 8 }} />
          {t('events.addToGoogle')}
        </MenuItem>
        <MenuItem onClick={() => downloadEventIcs(event)}>
          <Icon icon='mdi:calendar-export' width={18} style={{ marginRight: 8 }} />
          {t('events.downloadIcs')}
        </MenuItem>
      </Menu>
    </Box>
  )
}

const EventsList = () => {
  const { t } = useTranslation()
  const { hasAccess } = useRoles()
  const { sudo } = useThemeMode()
  const isEventsAdmin = hasAccess(MIKPermissions.EVENTS_ADMIN)
  const canManageEvents = isEventsAdmin && sudo

  const { data, isLoading, error } = useApi<EventListResponse>({
    url: 'v1/events',
  })

  const events = data?.events ?? []
  const now = dayjs()
  const upcomingEvents = events.filter((e) => dayjs(e.endTime).isAfter(now))
  const pastEvents = events.filter((e) => !dayjs(e.endTime).isAfter(now))

  return (
    <>
      <Title label={t('events.title')}>
        {canManageEvents && (
          <Button
            component={RouterLink}
            to='/admin/events'
            variant='contained'
            startIcon={<Icon icon='mdi:plus' />}
          >
            {t('events.manage')}
          </Button>
        )}
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
                <Box>
                  {upcomingEvents.map((event, i) => (
                    <Box key={event.eventId}>
                      <EventCard event={event} />
                      {i < upcomingEvents.length - 1 && <Divider />}
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {pastEvents.length > 0 && (
              <>
                <Typography variant='subtitle1' fontWeight='bold' mt={3} mb={1}>
                  {t('events.past_section')}
                </Typography>
                <Box>
                  {[...pastEvents].reverse().map((event, i) => (
                    <Box key={event.eventId}>
                      <EventCard event={event} />
                      {i < pastEvents.length - 1 && <Divider />}
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </>
        )}
      </RemoteContent>
    </>
  )
}

export default EventsList
