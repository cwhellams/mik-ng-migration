import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Views, type Messages, type View } from 'react-big-calendar'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { dayjs, HELSINKI_TIMEZONE } from '@mik/ui/utils/date'

/**
 * The calendar-widget plumbing shared by the plane calendar and the item
 * reservation calendar.
 *
 * The two domains stay apart deliberately — `schedule/helpers.ts` and
 * `inventoryReservations/helpers.ts` say why — but none of that is in here.
 * This is which view is showing, which date it sits on, keeping `?day=`/`?week=`
 * in step with both, resetting the display timezone, and turning the pair into
 * the from/to window the list request asks for. Both calendars had a verbatim
 * copy, which meant a fix to the URL sync or the timezone reset had to be made
 * twice or the two silently drifted.
 *
 * The window is applied to the caller's own filter state rather than returned
 * for the caller to apply, so the "did from/to actually change" guard exists
 * once too: without it, navigating inside one month would replace the filter
 * object with an equal one on every arrow press.
 *
 * `messagesKey` is the only per-calendar difference: each one names its own i18n
 * block of react-big-calendar labels.
 */
type CalendarWindowFilters = { from?: string; to?: string }

export interface CalendarViewState {
  currentView: View
  onView: (view: View) => void
  currentDate: Date | undefined
  onNavigate: (date: Date) => void
  /** Memoised react-big-calendar props: translated labels and the visible hours. */
  calendarOpts: { messages: Messages; min: Date; max: Date }
  /**
   * The window the current view covers, already applied to the caller's
   * filters. Returned as well because it is the one piece of derived state a
   * test or a sibling request may want to read.
   */
  viewWindow: { from: string; to: string }
}

export const useCalendarViewState = <T extends CalendarWindowFilters>(
  messagesKey: string,
  setFilters: Dispatch<SetStateAction<T>>,
): CalendarViewState => {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [currentView, setCurrentView] = useState<View>(
    searchParams.has('day') ? Views.DAY : Views.WEEK,
  )
  // react-big-calendar asks for memoised callbacks and values:
  // https://jquense.github.io/react-big-calendar/examples/index.html?path=/docs/about-our-examples--page
  const onView = useCallback((view: View) => setCurrentView(view), [])

  const [currentDate, setCurrentDate] = useState<Date | undefined>(
    searchParams.has('day')
      ? new Date(searchParams.get('day')!)
      : searchParams.has('week')
        ? new Date(searchParams.get('week')!)
        : new Date(),
  )
  const onNavigate = useCallback((date: Date) => setCurrentDate(date), [])

  const calendarOpts = useMemo(
    () => ({
      messages: t(messagesKey, { returnObjects: true }) as Messages,
      min: dayjs.tz('2000-01-01T07:00:00', HELSINKI_TIMEZONE).toDate(),
      max: dayjs.tz('2000-01-01T22:00:00', HELSINKI_TIMEZONE).toDate(),
    }),
    [t, messagesKey],
  )

  // Show times in Helsinki wherever the member is — both the aeroplanes and the
  // equipment are in a hangar in Finland.
  useEffect(() => {
    dayjs.tz.setDefault(HELSINKI_TIMEZONE)
    return () => {
      dayjs.tz.setDefault() // back to the browser's zone on unmount
    }
  }, [])

  const viewWindow = useMemo(() => {
    const date = dayjs(currentDate)

    return currentView === Views.AGENDA
      ? {
          // a month of events at a time in agenda view
          from: date.startOf('day').toISOString(),
          to: date.add(1, 'month').endOf('day').toISOString(),
        }
      : {
          // the whole weeks the current month touches
          from: date.startOf('month').startOf('week').toISOString(),
          to: date.endOf('month').endOf('week').toISOString(),
        }
  }, [currentDate, currentView])

  useEffect(() => {
    setFilters((previous) =>
      previous.from === viewWindow.from && previous.to === viewWindow.to
        ? previous
        : { ...previous, ...viewWindow },
    )
  }, [viewWindow, setFilters])

  // Keep the URL saying what is on screen, so a view can be linked to.
  useEffect(() => {
    const date = dayjs(currentDate)

    if (currentView === Views.DAY) {
      setSearchParams({ day: date.format('YYYY-MM-DD') })
    } else if (currentView === Views.WEEK) {
      setSearchParams({ week: date.format('YYYY-MM-DD') })
    } else {
      setSearchParams({})
    }
  }, [currentDate, currentView, setSearchParams])

  return { currentView, onView, currentDate, onNavigate, calendarOpts, viewWindow }
}
