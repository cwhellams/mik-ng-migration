import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import dayjs from 'dayjs'
import { useState } from 'react'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import type { ClubEvent, EventListResponse } from '@mik/contracts/events'
import { downloadEventIcs, generateEventGoogleCalendarLink } from '../../../utils/eventCalendar'
import { getEventDisplayText } from '../../events/eventLanguage'
import { useTimezone } from '../../../hooks/useTimezone'

const DashboardEventItem = ({ event }: { event: ClubEvent }) => {
  const { t, i18n } = useTranslation()
  const { formatDateCustom, formatTime, timezoneOffset } = useTimezone()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const menuOpen = Boolean(anchorEl)

  const start = dayjs(event.startTime)
  const end = dayjs(event.endTime)
  const isMultiDay = formatDateCustom(start, 'YYYY-MM-DD') !== formatDateCustom(end, 'YYYY-MM-DD')
  const isPast = end.isBefore(dayjs())
  const { title } = getEventDisplayText(event, i18n.language)

  const dateLabel = isMultiDay
    ? `${formatDateCustom(start, 'D.M.YYYY HH:mm')} – ${formatDateCustom(end, 'D.M.YYYY HH:mm')}`
    : `${formatDateCustom(start, 'D.M.YYYY')} ${formatTime(start.toDate())} – ${formatTime(end.toDate())}`
  const tzLabel = timezoneOffset(start.toDate())

  return (
    <Box sx={{ opacity: isPast ? 0.65 : 1 }}>
      <Stack
        direction='row'
        sx={{
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        {event.imageUrl && (
          <Box
            component='img'
            src={event.imageUrl}
            alt={title}
            sx={{
              width: 48,
              height: 48,
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
              variant='body1'
              sx={{
                fontWeight: 'medium',
              }}
            >
              {title}
            </Typography>
            {isPast && <Chip label={t('events.past')} size='small' variant='outlined' />}
          </Stack>

          <Stack
            direction='row'
            sx={{
              alignItems: 'center',
              gap: 0.5,
              mt: 0.25,
            }}
          >
            <Icon icon='mdi:clock-outline' width={13} />
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
                mt: 0.1,
              }}
            >
              <Icon icon='mdi:map-marker-outline' width={13} />
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

        <Tooltip title={t('events.addToCalendar')}>
          <IconButton
            size='small'
            onClick={(e) => setAnchorEl(e.currentTarget)}
            aria-label={t('events.addToCalendar')}
          >
            <Icon icon='mdi:calendar-plus' width={18} />
          </IconButton>
        </Tooltip>
      </Stack>
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

export const EventsDashboard = () => {
  const { t } = useTranslation()

  const { data, isLoading, error } = useApi<EventListResponse>({
    url: 'v1/events',
  })

  const now = dayjs()

  // Previous event: most recently ended event (sort by endTime DESC)
  const previousEvent = data?.events
    .filter((e) => dayjs(e.endTime).isBefore(now))
    .slice()
    .sort((a, b) => dayjs(b.endTime).diff(dayjs(a.endTime)))
    .at(0)

  // Next 2 upcoming events
  const nextEvents = data?.events.filter((e) => dayjs(e.endTime).isAfter(now)).slice(0, 2)

  const displayEvents = [...(previousEvent ? [previousEvent] : []), ...(nextEvents ?? [])]

  return (
    <Accordion defaultExpanded sx={{ mt: 4 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant='h5'>{t('events.dashboardTitle')}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <RemoteContent isLoading={isLoading} error={error}>
          {displayEvents.length === 0 ? (
            <Typography
              sx={{
                color: 'text.secondary',
              }}
            >
              {t('events.noEvents')}
            </Typography>
          ) : (
            <Stack
              sx={{
                gap: 0,
              }}
            >
              {displayEvents.map((event, i) => (
                <Box key={event.eventId}>
                  <DashboardEventItem event={event} />
                  {i < displayEvents.length - 1 && <Divider sx={{ my: 1.5 }} />}
                </Box>
              ))}
            </Stack>
          )}

          <Box
            sx={{
              mt: 2,
            }}
          >
            <Button
              component={Link}
              to='/club/events'
              variant='text'
              size='small'
              endIcon={<Icon icon='mdi:arrow-right' width={16} />}
            >
              {t('events.viewAll')}
            </Button>
          </Box>
        </RemoteContent>
      </AccordionDetails>
    </Accordion>
  )
}
