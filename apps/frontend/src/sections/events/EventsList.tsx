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
import { Link as RouterLink } from 'react-router'
import type { ClubEvent, EventListResponse } from '@backend/routes/events/models'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { useRoles } from '../../hooks/useRoles'
import { useThemeMode } from '../../theme/ThemeContext'
import { useTimezone } from '../../hooks/useTimezone'
import { MIKPermissions } from '@backend/routes/members/models'
import dayjs from 'dayjs'
import { useState } from 'react'
import { downloadEventIcs, generateEventGoogleCalendarLink } from '../../utils/eventCalendar'
import { getEventDisplayText } from './eventLanguage'

const EventCard = ({ event }: { event: ClubEvent }) => {
  const { t, i18n } = useTranslation()
  const { formatDateCustom, formatTime, timezoneOffset } = useTimezone()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const menuOpen = Boolean(anchorEl)

  const start = dayjs(event.startTime)
  const end = dayjs(event.endTime)
  const isMultiDay = formatDateCustom(start, 'YYYY-MM-DD') !== formatDateCustom(end, 'YYYY-MM-DD')
  const isPast = end.isBefore(dayjs())
  const { title, description } = getEventDisplayText(event, i18n.language)

  const dateLabel = isMultiDay
    ? `${formatDateCustom(start, 'D.M.YYYY HH:mm')} – ${formatDateCustom(end, 'D.M.YYYY HH:mm')}`
    : `${formatDateCustom(start, 'D.M.YYYY')} ${formatTime(start.toDate())} – ${formatTime(end.toDate())}`
  const tzLabel = timezoneOffset(start.toDate())
  const startDay = formatDateCustom(start, 'D')
  const startMonth = formatDateCustom(start, 'MMM')
  const startYear = formatDateCustom(start, 'YYYY')

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        py: 2,
        opacity: isPast ? 0.65 : 1,
      }}
    >
      {event.imageUrl && (
        <Box
          component='img'
          src={event.imageUrl}
          alt={title}
          sx={{
            width: 96,
            height: 96,
            borderRadius: 1,
            objectFit: 'cover',
            flexShrink: 0,
            display: { xs: 'none', sm: 'block' },
          }}
        />
      )}
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
        <Typography
          variant='h5'
          sx={{
            fontWeight: 'bold',
            lineHeight: 1,
          }}
        >
          {startDay}
        </Typography>
        <Typography
          variant='caption'
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
          }}
        >
          {startMonth}
        </Typography>
        <Typography
          variant='caption'
          sx={{
            color: 'text.secondary',
          }}
        >
          {startYear}
        </Typography>
      </Box>
      {/* Content column */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
        }}
      >
        <Stack
          direction='row'
          sx={{
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
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
              <Typography variant='h6' component='span'>
                {title}
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

            {event.performer && (
              <Stack
                direction='row'
                sx={{
                  alignItems: 'center',
                  gap: 0.5,
                  mt: 0.25,
                }}
              >
                <Icon icon='mdi:microphone' width={14} />
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {event.performer}
                </Typography>
              </Stack>
            )}

            {description && (
              <Typography
                variant='body2'
                sx={{
                  mt: 1,
                  whiteSpace: 'pre-line',
                }}
              >
                {description}
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
