import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import {
  Calendar,
  type DateRangeFormatFunction,
  type DayLayoutFunction,
  Event,
  EventProps,
  EventPropGetter,
  Messages,
  SlotInfo,
  View,
  Views,
} from 'react-big-calendar'
import { dayjsLocalizerTz } from './dayjsLocalizerTz'

import withDragAndDropImport from 'react-big-calendar/lib/addons/dragAndDrop'
import type { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import noOverlap from 'react-big-calendar/lib/utils/layout-algorithms/no-overlap'

import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'
// https://github.com/jquense/react-big-calendar/issues/2739
import './styles.css'

import { dayjs, HELSINKI_TIMEZONE } from '../../utils/date'
import { useTranslation } from 'react-i18next'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import {
  Booking,
  BookingFilters,
  BookingListResponse,
  BookingStatus,
  BookingType,
} from '@backend/routes/bookings/models'
import useApi from '../../hooks/useApi'
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Stack,
  Button,
} from '@mui/material'
import { BookingEditor, BookingFlags } from './components/EditBookingModal'
import { Upsert } from '@backend/types/schema'
import { useRoles } from '../../hooks/useRoles'
import { Dayjs } from 'dayjs'
import { useSearchParams } from 'react-router-dom'
import { RemoteContent } from '../../components/RemoteContent'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { Title } from '../../components/Title'
import { Icon } from '@iconify/react'
import { bookingFlags, bookingMinDate } from './helpers'

dayjs.locale('fi')

const withDragAndDrop = ((
  withDragAndDropImport as unknown as { default?: typeof withDragAndDropImport }
).default ?? withDragAndDropImport) as typeof withDragAndDropImport

interface BookingEvent extends Event {
  id: string
  start: Date
  end: Date
  registration: string
  fullTitle: string
  type?: BookingType
  isEditable: boolean
  isPastBooking: boolean
  isCancelled: boolean
}

const colors: Record<string, string> = {
  'OH-STL-MAINTENANCE': '#eacf22ff',
  'OH-STL-PRIVATE': '#729AAC',
  'OH-STL-TRAINING': '#DCBCD5',
  'OH-IHQ-MAINTENANCE': '#fde85d78',
  'OH-IHQ-PRIVATE': '#729aac85',
  'OH-IHQ-TRAINING': '#dcbcd59c',
}

const localizer = dayjsLocalizerTz()
const DnDCalendar = withDragAndDrop<BookingEvent>(Calendar)

const CalendarEvent = ({ event }: EventProps<BookingEvent>) => {
  const reg = event.registration.substring(3)
  const rest = (event.title as string).substring(reg.length)
  return (
    <span>
      <strong>{reg}</strong>
      {rest}
    </span>
  )
}

const Schedule = () => {
  const { me, isBookingAdmin } = useRoles()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useTranslation()

  const canMakeReservations = me?.canMakeReservations == true

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: 'v1/aircrafts',
      params: { activeOnly: true, visibleOnly: false },
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    }
  )

  // convert backend booking to event model used in calendar
  const toEvent = useCallback(
    (booking: BookingListResponse['bookings'][0]): BookingEvent => {
      const who =
        booking.memberId == me?.memberId
          ? 'self'
          : `${booking.member?.firstName} ${booking.member?.lastName}`

      const flags = bookingFlags(booking, me, isBookingAdmin)

      return {
        id: booking.bookingId,
        title: `${booking.registration.substring(3)} ${who} ${booking.description ?? ''}`,
        fullTitle: [
          booking.registration,
          who,
          booking.description,
          t(`schedule.types.${booking.type}`),
        ]
          .filter(Boolean)
          .join(' - '),
        start: new Date(booking.startTime),
        end: new Date(booking.endTime),
        registration: booking.registration,
        type: booking.type,
        isEditable: !flags.isReadonly,
        isPastBooking: flags.isPastBooking,
        isCancelled: flags.isCancelled,
      }
    },
    [me, isBookingAdmin, t]
  )

  const [filters, setFilters] = useState<BookingFilters>({
    registration: [],
  })

  const {
    data: eventData,
    mutation,
    fetch,
    error: eventError,
    isLoading: eventLoading,
  } = useApi<BookingListResponse, Booking>({
    url: 'v1/bookings',
    params: filters,
  })

  const hasOverlap = useCallback(
    async (
      registration: string,
      from: Dayjs,
      to: Dayjs,
      bookingId?: string
    ): Promise<boolean> => {
      const payload: BookingFilters = {
        registration: [registration],
        from: from.toISOString(),
        to: to.toISOString(),
        exclusiveStartEnd: true,
        excludeBookingId: bookingId,
      }

      const { data } = await fetch.trigger('GET', payload, undefined)
      return (data?.bookings.length ?? 0) > 0
    },
    [fetch]
  )

  const [editMode, setEditMode] = useState<Upsert<Booking & BookingFlags>>()

  const { i18n } = useTranslation()

  const [currentView, setCurrentView] = useState<View>(
    searchParams.has('day') ? Views.DAY : Views.WEEK
  )

  // it's recommended to memoize callbacks and values passed to the calendar
  // https://jquense.github.io/react-big-calendar/examples/index.html?path=/docs/about-our-examples--page
  const onView = useCallback(
    (newView: View) => setCurrentView(newView),
    [setCurrentView]
  )

  const [currentDate, setCurrentDate] = useState<Date | undefined>(
    searchParams.has('day')
      ? new Date(searchParams.get('day')!)
      : searchParams.has('week')
        ? new Date(searchParams.get('week')!)
        : new Date()
  )
  const onNavigate = useCallback(
    (newDate: Date) => setCurrentDate(newDate),
    [setCurrentDate]
  )

  // memoize calendar options to avoid unnecessary rerenders
  const calendarOpts = useMemo(
    () => ({
      messages: t('schedule.calendarMessages', {
        returnObjects: true,
      }) as Messages,
      min: dayjs.tz('2000-01-01T07:00:00', HELSINKI_TIMEZONE).toDate(),
      max: dayjs.tz('2000-01-01T22:00:00', HELSINKI_TIMEZONE).toDate(),
    }),
    [t]
  )

  // show calendar events always in Helsinki timezone
  useEffect(() => {
    dayjs.tz.setDefault(HELSINKI_TIMEZONE)
    return () => {
      dayjs.tz.setDefault() // reset to browser TZ on unmount
    }
  }, [])

  useEffect(() => {
    const date = dayjs(currentDate)

    const { from, to } =
      currentView == Views.AGENDA
        ? {
            // show one month of events in agenda view
            from: date.startOf('day').toISOString(),
            to: date.add(1, 'month').endOf('day').toISOString(),
          }
        : {
            // show the whole weeks of the current month
            from: date.startOf('month').startOf('week').toISOString(),
            to: date.endOf('month').endOf('week').toISOString(),
          }

    if (filters.from != from || filters.to != to) {
      setFilters((filters) => ({
        ...filters,
        from,
        to,
      }))
    }

    // update url to match the current view
    if (currentView == Views.DAY) {
      setSearchParams({ day: date.format('YYYY-MM-DD') })
    } else if (currentView == Views.WEEK) {
      setSearchParams({ week: date.format('YYYY-MM-DD') })
    } else {
      setSearchParams({})
    }
  }, [currentDate, currentView, filters, setFilters, setSearchParams])

  const [events, setEvents] = useState<BookingEvent[]>([])

  useEffect(() => {
    if (!eventData) {
      setEvents([])
      return
    }

    setEvents(eventData.bookings.map(toEvent))
  }, [eventData, toEvent])

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  // add new event if no overlaps
  const handleAddEvent = useCallback(
    async (data?: SlotInfo) => {
      const now = dayjs()
      const start = data?.start ?? now.startOf('hour').add(1, 'hour').toDate()
      const end = data?.end ?? dayjs(start).add(1, 'hour').toDate()

      setEditMode({
        bookingId: '',
        memberId: me?.memberId ?? '',
        registration:
          typeof filters['registration'] === 'string'
            ? filters['registration']
            : (aircraftData?.aircrafts?.[0].registration ?? ''),
        type: BookingType.PRIVATE,
        status: BookingStatus.CONFIRMED,
        startTimeEpoch: Math.floor(start.getTime() / 1000).toString(),
        endTimeEpoch: Math.floor(end.getTime() / 1000).toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        calendarSequence: 0,

        isNewBooking: true,
        isReadonly: false,
        minDate: bookingMinDate(),
      })
    },
    [setEditMode, aircraftData, filters, me?.memberId]
  )

  // open the clicked event in modal
  const handleEditEvent = useCallback(
    async (data: Event) => {
      const reservation = data as BookingEvent

      const booking = eventData?.bookings.find(
        (b) => b.bookingId == reservation.id
      )
      if (booking) {
        setEditMode({
          ...booking,
          isNewBooking: false,
          isReadonly: !reservation.isEditable,
          minDate: bookingMinDate(dayjs(reservation.start)),
        })
      }
    },
    [eventData?.bookings, setEditMode]
  )

  // patch the resized or moved event
  const moveEvent = async (
    reservation: BookingEvent,
    startDate: Dayjs,
    endDate: Dayjs
  ) => {
    const min = bookingMinDate(dayjs(reservation.start))
    if (startDate.isBefore(min)) {
      return setProblem({
        status: 400,
        detail: t('schedule.validation.disablePast'),
      })
    }

    if (
      await hasOverlap(
        reservation.registration,
        startDate,
        endDate,
        reservation.id
      )
    ) {
      return setProblem({
        status: 400,
        detail: t('schedule.bookingOverlapError'),
      })
    }

    const { error } = await mutation.trigger(
      'PATCH',
      {
        startTimeEpoch: startDate.unix().toString(),
        endTimeEpoch: endDate.unix().toString(),
      },
      reservation.id
    )
    if (error) {
      setProblem(error)
    }
  }

  const onEventResize: withDragAndDropProps['onEventResize'] = ({
    start,
    end,
    event,
  }) => moveEvent(event as BookingEvent, dayjs(start), dayjs(end))

  const onEventDrop: withDragAndDropProps['onEventDrop'] = ({
    start,
    end,
    event,
  }) => moveEvent(event as BookingEvent, dayjs(start), dayjs(end))

  const eventStyle: EventPropGetter<object> = useCallback(
    (event) => {
      if (currentView == Views.AGENDA) {
        return {}
      }
      const reservation = event as BookingEvent
      const backgroundColor =
        colors[`${reservation.registration}-${reservation.type}`]
      return {
        style: {
          border: reservation.isEditable ? '3px solid #00731d' : 'none',
          opacity: reservation.isPastBooking
            ? 0.75
            : reservation.isCancelled
              ? 0.5
              : 1,
          color: reservation.registration == 'OH-IHQ' ? '#000000ca' : '#ffffff',
          background: reservation.isCancelled
            ? `repeating-linear-gradient(45deg, grey, ${backgroundColor} 1%, ${backgroundColor} 2%)`
            : backgroundColor,
          marginLeft: '1px',
        },
      }
    },
    [currentView]
  )

  const eventTimeRangeFormat: DateRangeFormatFunction = (
    { start, end },
    culture,
    localizer
  ) =>
    localizer?.format(
      start,
      start.getMinutes() == 0 ? 'HH' : 'HH:mm',
      culture
    ) +
    '–' +
    localizer?.format(end, end.getMinutes() == 0 ? 'HH' : 'HH:mm', culture)

  const eventTimeRangeStartFormat: DateRangeFormatFunction = (
    { start },
    culture,
    localizer
  ) =>
    localizer?.format(
      start,
      start.getMinutes() == 0 ? 'HH' : 'HH:mm',
      culture
    ) + '–'

  const eventTimeRangeEndFormat: DateRangeFormatFunction = (
    { end },
    culture,
    localizer
  ) =>
    '–' +
    localizer?.format(end, end.getMinutes() == 0 ? 'HH' : 'HH:mm', culture)

  const dayLayoutAlgorithm: DayLayoutFunction<BookingEvent> = (params) => {
    return noOverlap(params).map((item) => {
      if (item.size == 100 && filters['registration']?.length == 0) {
        // make a single plane booking more narrow to make it more clear another plane
        // can also be booked at the same time
        return {
          ...item,
          size: 85,
          style: {
            ...item.style,
            width: '85%',
          },
        }
      }

      return item
    }) as { event: BookingEvent; style: CSSProperties }[]
  }

  return (
    <RemoteContent error={eventError}>
      <SnackAlert problem={problem} />

      <Title label={t('header.schedule')}>
        <Button
          variant='contained'
          color='primary'
          startIcon={<Icon icon='mdi:plus' />}
          onClick={() => handleAddEvent()}
          disabled={!canMakeReservations}
        >
          {t('schedule.newBooking')}
        </Button>
      </Title>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent='space-between'
        mb={3}
      >
        <Box display='flex' flexDirection='row' alignItems='center'>
          <Typography variant='body2'>{t('schedule.showPlanes')}</Typography>
          <ToggleButtonGroup
            value={filters['registration']}
            exclusive
            onChange={(_, value) =>
              setFilters((filters) => ({ ...filters, registration: value }))
            }
            aria-label='plane selection'
            size='small'
            sx={{ ml: 2 }}
          >
            <ToggleButton
              value={[]}
              selected={filters['registration']?.length == 0}
            >
              {t('schedule.ALL')}
            </ToggleButton>
            {aircraftData?.aircrafts.map((aircraft) => (
              <ToggleButton
                key={aircraft.registration}
                value={aircraft.registration}
              >
                {aircraft.registration}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={filters['showCancelled'] ?? false}
              onChange={({ target }) =>
                setFilters((filters) => ({
                  ...filters,
                  showCancelled: target.checked,
                }))
              }
            />
          }
          label={t('schedule.showCancelled')}
        ></FormControlLabel>
      </Stack>

      <Box position='relative'>
        <DnDCalendar
          onView={onView}
          view={currentView}
          date={currentDate}
          onNavigate={onNavigate}
          events={events}
          // en-gb has 24h time format
          culture={i18n.language == 'fi' ? 'fi' : 'en-gb'}
          localizer={localizer}
          formats={{
            // make time format shorter when it's on the hour,
            // e.g. 14-15 instead of 14:00-15:00
            eventTimeRangeFormat,
            eventTimeRangeStartFormat,
            eventTimeRangeEndFormat,
          }}
          messages={calendarOpts.messages}
          min={calendarOpts.min}
          max={calendarOpts.max}
          onEventDrop={onEventDrop}
          onEventResize={onEventResize}
          onSelectSlot={canMakeReservations ? handleAddEvent : undefined}
          onSelectEvent={handleEditEvent}
          showMultiDayTimes={true}
          resizable
          selectable
          dayLayoutAlgorithm={dayLayoutAlgorithm}
          components={{ event: CalendarEvent }}
          draggableAccessor={(event: BookingEvent) => event.isEditable}
          eventPropGetter={eventStyle}
          style={{ height: '80vh' }}
          tooltipAccessor={(event: BookingEvent) => event.fullTitle}
          className={eventLoading ? 'reloading' : undefined}
        />

        {eventLoading && (
          <CircularProgress
            size={40}
            color='inherit'
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
      </Box>

      <BookingEditor
        booking={editMode}
        onClose={() => setEditMode(undefined)}
      />
    </RemoteContent>
  )
}

export default Schedule
