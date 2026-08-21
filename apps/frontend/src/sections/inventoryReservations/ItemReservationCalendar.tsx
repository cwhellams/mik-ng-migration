import { Icon } from '@iconify/react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Views,
  type DateRangeFormatFunction,
  type Event,
  type EventPropGetter,
  type Messages,
  type SlotInfo,
  type View,
} from 'react-big-calendar'
import withDragAndDropImport from 'react-big-calendar/lib/addons/dragAndDrop'
import type { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'
// Shared with the plane calendar — same widget, same overrides.
import '../schedule/styles.css'

import type { InventoryItem } from '@mik/contracts/inventory'
import {
  ItemReservationStatus,
  type ItemReservation,
  type ItemReservationFilters,
  type ItemReservationListResponse,
} from '@mik/contracts/inventory-reservations'
import { MIKPermissions } from '@mik/contracts/members'
import type { Problem } from '@mik/contracts/problem'
import type { Upsert } from '@mik/contracts/schema'

import { endpoints } from '../../api/endpoints'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { dayjs, HELSINKI_TIMEZONE } from '@mik/ui/utils/date'
import { localName, resolveLanguage } from '../inventory/localized'
import { dayjsLocalizerTz } from '../schedule/dayjsLocalizerTz'
import {
  ItemReservationEditor,
  type ItemReservationFlags,
} from './components/EditItemReservationModal'
import { itemColor, itemReservationFlags, reservationMinDate, reservationTitle } from './helpers'

/**
 * The item reservation calendar (#1139).
 *
 * A separate page from `sections/schedule`, which is the whole point of the
 * issue: oxygen tanks and life vests were never going to share the plane
 * calendar without burying it. The two share the `react-big-calendar` stack and
 * the Helsinki localizer, and nothing else — an item reservation overlapping
 * another is normal (that is what having eight vests means), so there is no
 * overlap check here, only a capacity one, and it lives in the editor.
 */

const withDragAndDrop = ((
  withDragAndDropImport as unknown as { default?: typeof withDragAndDropImport }
).default ?? withDragAndDropImport) as typeof withDragAndDropImport

interface ReservationEvent extends Event {
  id: string
  start: Date
  end: Date
  itemId: string
  fullTitle: string
  isEditable: boolean
  isPast: boolean
  isCancelled: boolean
}

const localizer = dayjsLocalizerTz()
const DnDCalendar = withDragAndDrop<ReservationEvent>(Calendar)

const ItemReservationCalendar = () => {
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)
  const { me, hasAccess, hasSudoAccess } = useRoles()
  const [searchParams, setSearchParams] = useSearchParams()

  const isReservationAdmin = hasSudoAccess(MIKPermissions.INVENTORY_RESERVATION_ADMIN)
  const canReserve =
    me?.canMakeReservations === true &&
    hasAccess(MIKPermissions.INVENTORY_RESERVATION_USER, MIKPermissions.INVENTORY_RESERVATION_ADMIN)

  // Only reservable items reach the filter row and the editor's picker — a
  // consumable tracked by quantity alone has nothing to reserve.
  const { data: items } = useApi<InventoryItem[]>(
    {
      url: 'v1/inventory/items',
      params: { reservableOnly: 'true' },
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  )

  const reservableItems = useMemo(() => items ?? [], [items])

  const [filters, setFilters] = useState<ItemReservationFilters>({ itemId: [] })

  const {
    data: reservationData,
    mutation,
    error,
    isLoading,
  } = useApi<ItemReservationListResponse, ItemReservation>({
    url: endpoints.inventoryReservations.root,
    params: filters,
  })

  const [currentView, setCurrentView] = useState<View>(
    searchParams.has('day') ? Views.DAY : Views.WEEK,
  )
  const onView = useCallback((view: View) => setCurrentView(view), [])

  const [currentDate, setCurrentDate] = useState<Date | undefined>(
    searchParams.has('day')
      ? new Date(searchParams.get('day')!)
      : searchParams.has('week')
        ? new Date(searchParams.get('week')!)
        : new Date(),
  )
  const onNavigate = useCallback((date: Date) => setCurrentDate(date), [])

  const [editMode, setEditMode] = useState<
    Upsert<ItemReservation & ItemReservationFlags> | undefined
  >()
  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  const calendarOpts = useMemo(
    () => ({
      messages: t('itemReservations.calendarMessages', { returnObjects: true }) as Messages,
      min: dayjs.tz('2000-01-01T07:00:00', HELSINKI_TIMEZONE).toDate(),
      max: dayjs.tz('2000-01-01T22:00:00', HELSINKI_TIMEZONE).toDate(),
    }),
    [t],
  )

  // Show times in Helsinki regardless of where the member is, as the plane
  // calendar does — the equipment is in a hangar in Finland.
  useEffect(() => {
    dayjs.tz.setDefault(HELSINKI_TIMEZONE)
    return () => {
      dayjs.tz.setDefault()
    }
  }, [])

  useEffect(() => {
    const date = dayjs(currentDate)

    const { from, to } =
      currentView === Views.AGENDA
        ? {
            from: date.startOf('day').toISOString(),
            to: date.add(1, 'month').endOf('day').toISOString(),
          }
        : {
            from: date.startOf('month').startOf('week').toISOString(),
            to: date.endOf('month').endOf('week').toISOString(),
          }

    if (filters.from !== from || filters.to !== to) {
      setFilters((previous) => ({ ...previous, from, to }))
    }

    if (currentView === Views.DAY) {
      setSearchParams({ day: date.format('YYYY-MM-DD') })
    } else if (currentView === Views.WEEK) {
      setSearchParams({ week: date.format('YYYY-MM-DD') })
    } else {
      setSearchParams({})
    }
  }, [currentDate, currentView, filters, setSearchParams])

  const itemNameFor = useCallback(
    (reservation: ItemReservation) =>
      localName(reservation.itemName as Record<string, string> | undefined, lang),
    [lang],
  )

  const toEvent = useCallback(
    (reservation: ItemReservation): ReservationEvent => {
      const who =
        reservation.memberId === me?.memberId
          ? t('itemReservations.self')
          : `${reservation.member?.firstName ?? ''} ${reservation.member?.lastName ?? ''}`.trim()

      const itemName = itemNameFor(reservation)
      const flags = itemReservationFlags(reservation, me, isReservationAdmin)

      return {
        id: reservation.reservationId,
        title: reservationTitle(reservation, itemName, who),
        fullTitle: [
          reservationTitle(reservation, itemName, who),
          reservation.unitTag,
          reservation.description,
        ]
          .filter(Boolean)
          .join(' — '),
        start: new Date(reservation.startTime),
        end: new Date(reservation.endTime),
        itemId: reservation.itemId,
        isEditable: !flags.isReadonly,
        isPast: flags.isPast,
        isCancelled: flags.isCancelled,
      }
    },
    [me, isReservationAdmin, itemNameFor, t],
  )

  const events = useMemo(
    () => (reservationData?.reservations ?? []).map(toEvent),
    [reservationData, toEvent],
  )

  const handleAddEvent = useCallback(
    (slot?: SlotInfo) => {
      const start = slot?.start ?? dayjs().startOf('hour').add(1, 'hour').toDate()
      const end = slot?.end ?? dayjs(start).add(1, 'hour').toDate()

      const selectedItem =
        typeof filters.itemId === 'string' ? filters.itemId : (reservableItems[0]?.itemId ?? '')

      setEditMode({
        reservationId: '',
        memberId: me?.memberId ?? '',
        itemId: selectedItem,
        unitId: null,
        quantity: 1,
        linkedBookingId: null,
        status: ItemReservationStatus.CONFIRMED,
        startTimeEpoch: Math.floor(start.getTime() / 1000).toString(),
        endTimeEpoch: Math.floor(end.getTime() / 1000).toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),

        isNewReservation: true,
        isReadonly: false,
        minDate: reservationMinDate(),
      })
    },
    [filters.itemId, me?.memberId, reservableItems],
  )

  const handleEditEvent = useCallback(
    (event: Event) => {
      const clicked = event as ReservationEvent
      const reservation = reservationData?.reservations.find(
        (candidate) => candidate.reservationId === clicked.id,
      )
      if (!reservation) return

      setEditMode({
        ...reservation,
        isNewReservation: false,
        isReadonly: !clicked.isEditable,
        minDate: reservationMinDate(dayjs(clicked.start)),
      })
    },
    [reservationData?.reservations],
  )

  // Drag and resize patch the window straight away. Capacity is unchanged by a
  // move within the same item only if nothing else has been booked in the new
  // window, so the backend's 400 is what reports a clash — there is no
  // client-side overlap check to run first, unlike the plane calendar.
  const moveEvent = async (event: ReservationEvent, start: Dayjs, end: Dayjs) => {
    const min = reservationMinDate(dayjs(event.start))
    if (start.isBefore(min)) {
      return setProblem({ status: 400, detail: t('itemReservations.validation.disablePast') })
    }

    const { error: moveError } = await mutation.trigger(
      'PATCH',
      { startTimeEpoch: start.unix().toString(), endTimeEpoch: end.unix().toString() },
      event.id,
    )
    if (moveError) setProblem(moveError)
  }

  const onEventResize: withDragAndDropProps['onEventResize'] = ({ start, end, event }) =>
    moveEvent(event as ReservationEvent, dayjs(start), dayjs(end))

  const onEventDrop: withDragAndDropProps['onEventDrop'] = ({ start, end, event }) =>
    moveEvent(event as ReservationEvent, dayjs(start), dayjs(end))

  const eventStyle: EventPropGetter<object> = useCallback(
    (event) => {
      if (currentView === Views.AGENDA) return {}

      const reservation = event as ReservationEvent
      const backgroundColor = itemColor(reservation.itemId)

      return {
        style: {
          border: reservation.isEditable ? '3px solid #00731d' : 'none',
          opacity: reservation.isPast ? 0.75 : reservation.isCancelled ? 0.5 : 1,
          color: '#ffffff',
          background: reservation.isCancelled
            ? `repeating-linear-gradient(45deg, grey, ${backgroundColor} 1%, ${backgroundColor} 2%)`
            : backgroundColor,
          marginLeft: '1px',
        },
      }
    },
    [currentView],
  )

  const eventTimeRangeFormat: DateRangeFormatFunction = ({ start, end }, culture, localizer) =>
    `${localizer?.format(start, start.getMinutes() === 0 ? 'HH' : 'HH:mm', culture)}–${localizer?.format(
      end,
      end.getMinutes() === 0 ? 'HH' : 'HH:mm',
      culture,
    )}`

  return (
    <RemoteContent error={error}>
      <SnackAlert problem={problem} />
      <Title label={t('itemReservations.title')}>
        <Button
          variant='contained'
          color='primary'
          startIcon={<Icon icon='mdi:plus' />}
          onClick={() => handleAddEvent()}
          disabled={!canReserve || reservableItems.length === 0}
        >
          {t('itemReservations.newReservation')}
        </Button>
      </Title>

      {items && reservableItems.length === 0 && (
        <Alert severity='info' sx={{ mb: 3 }}>
          {t('itemReservations.noReservableItems')}
        </Alert>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', mb: 3 }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <Typography variant='body2'>{t('itemReservations.showItems')}</Typography>
          <ToggleButtonGroup
            value={filters.itemId}
            exclusive
            onChange={(_event, value) =>
              setFilters((previous) => ({ ...previous, itemId: value ?? [] }))
            }
            aria-label={t('itemReservations.showItems')}
            size='small'
            sx={{ ml: 2, flexWrap: 'wrap' }}
          >
            <ToggleButton value={[]} selected={filters.itemId?.length === 0}>
              {t('itemReservations.ALL')}
            </ToggleButton>
            {reservableItems.map((item) => (
              <ToggleButton key={item.itemId} value={item.itemId}>
                {localName(item.name as Record<string, string>, lang)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={filters.showCancelled ?? false}
              onChange={({ target }) =>
                setFilters((previous) => ({ ...previous, showCancelled: target.checked }))
              }
            />
          }
          label={t('itemReservations.showCancelled')}
        />
      </Stack>

      <Box sx={{ position: 'relative' }}>
        <DnDCalendar
          onView={onView}
          view={currentView}
          date={currentDate}
          onNavigate={onNavigate}
          events={events}
          // en-gb for the 24h clock, as on the plane calendar.
          culture={i18n.language === 'fi' ? 'fi' : 'en-gb'}
          localizer={localizer}
          formats={{ eventTimeRangeFormat }}
          messages={calendarOpts.messages}
          min={calendarOpts.min}
          max={calendarOpts.max}
          onEventDrop={onEventDrop}
          onEventResize={onEventResize}
          onSelectSlot={canReserve ? handleAddEvent : undefined}
          onSelectEvent={handleEditEvent}
          showMultiDayTimes
          resizable
          selectable
          draggableAccessor={(event: ReservationEvent) => event.isEditable}
          eventPropGetter={eventStyle}
          style={{ height: '80vh' }}
          tooltipAccessor={(event: ReservationEvent) => event.fullTitle}
          className={isLoading ? 'reloading' : undefined}
        />

        {isLoading && (
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

      <ItemReservationEditor
        reservation={editMode}
        items={reservableItems}
        onClose={() => setEditMode(undefined)}
      />
    </RemoteContent>
  )
}

export default ItemReservationCalendar
