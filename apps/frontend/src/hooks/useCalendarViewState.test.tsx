import { act, waitFor } from '@testing-library/react'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Views } from 'react-big-calendar'
import { useSearchParams } from 'react-router'
import { describe, expect, it } from 'vitest'

import { renderHookWithProviders } from '../test/renderWithProviders'
import { useCalendarViewState } from './useCalendarViewState'

/**
 * The view/date plumbing the plane calendar and the item reservation calendar
 * share (#1260 review). Both ran a verbatim copy of it, so these are the
 * assertions that used to exist only implicitly, twice over, inside two page
 * suites.
 */

type Filters = { from?: string; to?: string; showCancelled?: boolean }

const renderCalendarState = (route = '/') =>
  renderHookWithProviders(
    () => {
      const [filters, setFilters] = useState<Filters>({ showCancelled: true })
      const state = useCalendarViewState('schedule.calendarMessages', setFilters)
      const [searchParams] = useSearchParams()
      return { ...state, filters, search: searchParams.toString() }
    },
    { route, serverClock: false },
  )

describe('useCalendarViewState initial view', () => {
  it('starts on the week view with no search params', () => {
    const { result } = renderCalendarState()

    expect(result.current.currentView).toBe(Views.WEEK)
  })

  it('starts on the day view, at that day, when ?day= is set', () => {
    const { result } = renderCalendarState('/?day=2026-03-04')

    expect(result.current.currentView).toBe(Views.DAY)
    expect(dayjs(result.current.currentDate).format('YYYY-MM-DD')).toBe('2026-03-04')
  })

  it('opens the week a ?week= param names', () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    expect(result.current.currentView).toBe(Views.WEEK)
    expect(dayjs(result.current.currentDate).format('YYYY-MM-DD')).toBe('2026-03-04')
  })
})

describe('useCalendarViewState window', () => {
  it('asks for the whole weeks the shown month touches', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    const march = dayjs('2026-03-04')
    await waitFor(() =>
      expect(result.current.filters.from).toBe(
        march.startOf('month').startOf('week').toISOString(),
      ),
    )
    expect(result.current.filters.to).toBe(march.endOf('month').endOf('week').toISOString())
  })

  it('asks for a month ahead in the agenda view', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    act(() => result.current.onView(Views.AGENDA))

    const march = dayjs('2026-03-04')
    await waitFor(() =>
      expect(result.current.filters.from).toBe(march.startOf('day').toISOString()),
    )
    expect(result.current.filters.to).toBe(march.add(1, 'month').endOf('day').toISOString())
  })

  it('leaves the caller’s other filters alone', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    await waitFor(() => expect(result.current.filters.from).toEqual(expect.any(String)))
    expect(result.current.filters.showCancelled).toBe(true)
  })

  it('does not replace the filter object when navigating inside one month', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    await waitFor(() => expect(result.current.filters.from).toEqual(expect.any(String)))
    const before = result.current.filters

    // A different date, the same window: the guard is what stops every arrow
    // press from handing `useApi` a new params object to key its cache on.
    act(() => result.current.onNavigate(dayjs('2026-03-11').toDate()))

    await waitFor(() =>
      expect(dayjs(result.current.currentDate).format('YYYY-MM-DD')).toBe('2026-03-11'),
    )
    expect(result.current.filters).toBe(before)
  })

  it('moves the window when navigating to another month', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    await waitFor(() => expect(result.current.filters.from).toEqual(expect.any(String)))

    act(() => result.current.onNavigate(dayjs('2026-05-04').toDate()))

    const may = dayjs('2026-05-04')
    await waitFor(() =>
      expect(result.current.filters.from).toBe(may.startOf('month').startOf('week').toISOString()),
    )
  })
})

describe('useCalendarViewState url sync', () => {
  it('keeps ?week= in step with the shown week', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    act(() => result.current.onNavigate(dayjs('2026-03-11').toDate()))

    await waitFor(() => expect(result.current.search).toBe('week=2026-03-11'))
  })

  it('writes ?day= when the day view is chosen', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    act(() => result.current.onView(Views.DAY))

    await waitFor(() => expect(result.current.search).toBe('day=2026-03-04'))
  })

  it('drops both params in the agenda view, which is neither', async () => {
    const { result } = renderCalendarState('/?week=2026-03-04')

    act(() => result.current.onView(Views.AGENDA))

    await waitFor(() => expect(result.current.search).toBe(''))
  })

  it('offers the translated calendar labels and the visible hours', () => {
    const { result } = renderCalendarState()

    expect(result.current.calendarOpts.messages).toMatchObject({ today: expect.any(String) })
    expect(dayjs(result.current.calendarOpts.min).format('HH:mm')).toBe('07:00')
    expect(dayjs(result.current.calendarOpts.max).format('HH:mm')).toBe('22:00')
  })
})
