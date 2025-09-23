import { useCallback, useEffect, useState } from 'react'
import {
  Calendar,
  dayjsLocalizer,
  Event,
  EventPropGetter,
  Messages,
  SlotInfo,
  View,
  Views,
} from 'react-big-calendar'

import withDragAndDrop, {
  withDragAndDropProps,
} from 'react-big-calendar/lib/addons/dragAndDrop'

import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { dayjs } from '../../utils/date'
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
  Alert,
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Slide,
  Snackbar,
  Checkbox,
  FormControlLabel,
} from '@mui/material'
import { BookingEditor } from './components/EditBookingModal'
import { Upsert } from '@backend/types/schema'
import { t } from 'i18next'
import { useRoles } from '../../hooks/useRoles'
import { Dayjs } from 'dayjs'

dayjs.locale('fi')

interface BookingEvent extends Event {
  id: string
  start: Date
  end: Date
  registration: string
  fullTitle: string
  type?: BookingType
  isEditable: boolean
  isCancelled?: boolean
}

const colors: Record<string, string> = {
  'OH-STL-MAINTENANCE': '#eacf22ff',
  'OH-STL-PRACTICE': '#729AAC',
  'OH-STL-CROSSCOUNTRY': '#8DCE92',
  'OH-STL-TRAINING': '#DCBCD5',
  'OH-IHQ-MAINTENANCE': '#fde85d78',
  'OH-IHQ-PRACTICE': '#729aac85',
  'OH-IHQ-CROSSCOUNTRY': '#8dce92a0',
  'OH-IHQ-TRAINING': '#dcbcd59c',
}

const localizer = dayjsLocalizer(dayjs)

const Schedule = () => {
  const { me, isBookingAdmin } = useRoles()

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: 'v1/aircrafts',
      params: { activeOnly: true },
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

      return {
        id: booking.bookingId,
        title: `${booking.registration} ${who} ${booking.description ?? ''}`,
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
        isEditable: booking.memberId == me?.memberId || isBookingAdmin,
        isCancelled: booking.status == BookingStatus.CANCELLED,
      }
    },
    [me, isBookingAdmin]
  )

  const [filters, setFilters] = useState<BookingFilters>({
    'registration[]': [],
  })

  const {
    data: eventData,
    mutation,
    fetch,
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
        'registration[]': [registration],
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

  const [editMode, setEditMode] = useState<Upsert<Booking>>()

  const DnDCalendar = withDragAndDrop(Calendar)

  const { i18n } = useTranslation()

  const [currentView, setCurrentView] = useState<View>(Views.WEEK)
  const [currentDate, setCurrentDate] = useState<Date | undefined>(new Date())

  const [events, setEvents] = useState<BookingEvent[]>([])

  useEffect(() => {
    if (!eventData) {
      setEvents([])
      return
    }

    setEvents(eventData.bookings.map((b) => toEvent(b)))
  }, [eventData, toEvent])

  const [errorMsg, setErrorMsg] = useState('')

  // add new event if no overlaps
  const handleAddEvent = useCallback(
    async (data: SlotInfo) =>
      setEditMode({
        bookingId: '',
        memberId: me?.memberId ?? '',
        registration:
          typeof filters['registration[]'] === 'string'
            ? filters['registration[]']
            : (aircraftData?.aircrafts?.[0].registration ?? ''),
        type: BookingType.PRACTICE,
        status: BookingStatus.CONFIRMED,
        startTimeEpoch: Math.floor(data.start.getTime() / 1000).toString(),
        endTimeEpoch: Math.floor(data.end.getTime() / 1000).toString(),
        startTime: data.start.toISOString(),
        endTime: data.end.toISOString(),
      }),
    [setEditMode, aircraftData, filters, me?.memberId]
  )

  // open the clicked event in modal
  const handleEditEvent = useCallback(
    async (data: Event) => {
      const bookingEvent = data as BookingEvent

      setEditMode(
        eventData?.bookings.find((b) => b.bookingId == bookingEvent.id)
      )
    },
    [eventData?.bookings, setEditMode]
  )

  // patch the resized or moved event
  const moveEvent = async (
    reservation: BookingEvent,
    startDate: Dayjs,
    endDate: Dayjs
  ) => {
    if (
      await hasOverlap(
        reservation.registration,
        startDate,
        endDate,
        reservation.id
      )
    ) {
      return setErrorMsg(t('schedule.bookingOverlapError'))
    }

    mutation.trigger(
      'PATCH',
      {
        startTimeEpoch: startDate.unix().toString(),
        endTimeEpoch: endDate.unix().toString(),
      },
      reservation.id
    )
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

  const eventStyle: EventPropGetter<object> = (event) => {
    if (currentView == Views.AGENDA) {
      return {}
    }
    const reservation = event as BookingEvent
    const backgroundColor =
      colors[`${reservation.registration}-${reservation.type}`]
    return {
      style: {
        border: reservation.isEditable ? '5px solid #000000' : 'none',
        opacity: reservation.isCancelled ? 0.5 : 1,
        color: reservation.registration == 'OH-IHQ' ? '#000000ca' : '#ffffff',
        background: reservation.isCancelled
          ? `repeating-linear-gradient(45deg, grey, ${backgroundColor} 1%, ${backgroundColor} 2%)`
          : backgroundColor,
      },
    }
  }

  return (
    <>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={errorMsg.length > 0}
        autoHideDuration={3000}
        onClose={() => setErrorMsg('')}
        slots={{ transition: Slide }}
      >
        <Alert severity='error'>{errorMsg}</Alert>
      </Snackbar>

      <Box display='flex' flexDirection='row' alignItems='center' mb={2}>
        <Typography variant='body2'>{t('schedule.showPlanes')}</Typography>

        <ToggleButtonGroup
          value={filters['registration[]']}
          exclusive
          onChange={(_, value) =>
            setFilters((filters) => ({ ...filters, 'registration[]': value }))
          }
          aria-label='plane selection'
          size='small'
          sx={{ ml: 2 }}
        >
          <ToggleButton
            value={[]}
            selected={filters['registration[]']?.length == 0}
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

        <FormControlLabel
          sx={{ ml: 4 }}
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
      </Box>

      <DnDCalendar
        onView={setCurrentView}
        view={currentView}
        date={currentDate}
        onNavigate={(date) => {
          setCurrentDate(date)
        }}
        events={events}
        culture={i18n.language}
        messages={
          t('schedule.calendarMessages', { returnObjects: true }) as Messages
        }
        localizer={localizer}
        min={new Date(2000, 1, 1, 7, 0, 0)}
        max={new Date(2000, 1, 1, 22, 0, 0)}
        onEventDrop={onEventDrop}
        onEventResize={onEventResize}
        onSelectSlot={handleAddEvent}
        onSelectEvent={handleEditEvent}
        showMultiDayTimes={true}
        resizable
        selectable
        dayLayoutAlgorithm='no-overlap'
        draggableAccessor={(event) => (event as BookingEvent).isEditable}
        eventPropGetter={eventStyle}
        style={{ height: '90vh' }}
        tooltipAccessor={(event) => (event as BookingEvent).fullTitle}
      />

      <BookingEditor
        booking={editMode}
        onClose={() => setEditMode(undefined)}
      />
    </>
  )
}

export default Schedule
