import { renderHook, screen, waitFor } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/renderWithProviders'
import { readOccurrencePrefill } from './safetyOccurrence'
import { useIncidentAsLoaded, useSafetyReportPrompt } from './useSafetyReportPrompt'
import { SafetyReportPromptDialog } from './components/SafetyReportPromptDialog'

/**
 * The prompt navigates, so it is exercised through a route tree: answer it, then read
 * back where the router landed and what it carried there (#1225).
 */
const flight = {
  aircraftRegistration: 'OH-STL',
  departureAirport: 'EFNU',
  arrivalAirport: 'EFHK',
  offBlockTimeEpoch: '1747900800', // 2025-05-22T08:00:00Z
}

const Saver = ({
  sourceFlightId,
  incidentOrObservations,
  previousIncidentOrObservations,
  onProceed,
}: {
  sourceFlightId?: string
  incidentOrObservations?: string | null
  previousIncidentOrObservations?: string | null
  onProceed: () => void
}) => {
  const { withSafetyPrompt, safetyPromptProps } = useSafetyReportPrompt()
  return (
    <>
      <button
        onClick={() =>
          withSafetyPrompt(
            {
              sourceFlightId,
              flight,
              content: { incidentOrObservations, previousIncidentOrObservations },
            },
            onProceed,
          )
        }
      >
        save
      </button>
      <SafetyReportPromptDialog {...safetyPromptProps} />
    </>
  )
}

const Landing = () => {
  const { pathname, state } = useLocation()
  const prefill = readOccurrencePrefill(state)
  return (
    <span>
      landed {pathname} for {prefill?.aircraftRegistration} on {prefill?.occurrenceDate} saying{' '}
      {prefill?.description}
    </span>
  )
}

const renderSaver = (props: Partial<Parameters<typeof Saver>[0]> = {}) => {
  const onProceed = props.onProceed ?? vi.fn()
  // Spread after the default so a test can deliberately pass `sourceFlightId: undefined`.
  const saverProps = { sourceFlightId: 'fl-1', ...props }
  const rendered = renderWithProviders(
    <Routes>
      <Route path='/logs/flights/new' element={<Saver {...saverProps} onProceed={onProceed} />} />
      <Route path='/logs/occurrences/new' element={<Landing />} />
    </Routes>,
    { route: '/logs/flights/new' },
  )
  return { ...rendered, onProceed }
}

describe('useSafetyReportPrompt', () => {
  it('asks nothing, and goes straight on, when the entry noted nothing', async () => {
    const { user, onProceed } = renderSaver({ incidentOrObservations: null })

    await user.click(screen.getByRole('button', { name: 'save' }))

    expect(onProceed).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Safety related incidents or observations?')).not.toBeInTheDocument()
  })

  it('asks whether safety was affected once something was noted', async () => {
    const { user, onProceed } = renderSaver({ incidentOrObservations: 'Engine ran rough' })

    await user.click(screen.getByRole('button', { name: 'save' }))

    expect(await screen.findByText('Safety related incidents or observations?')).toBeInTheDocument()
    // The entry is saved either way — the question is only about where to go next.
    expect(onProceed).not.toHaveBeenCalled()
  })

  it('names the flight it is asking about, which the pilot has already left behind', async () => {
    const { user } = renderSaver({ incidentOrObservations: 'Engine ran rough' })

    await user.click(screen.getByRole('button', { name: 'save' }))
    const dialog = await screen.findByRole('dialog')

    expect(dialog).toHaveTextContent('OH-STL')
    expect(dialog).toHaveTextContent('EFNU → EFHK')
    expect(dialog).toHaveTextContent('22.05.2025')
  })

  it('carries on to wherever the save was headed when the answer is no', async () => {
    const { user, onProceed } = renderSaver({ incidentOrObservations: 'Engine ran rough' })

    await user.click(screen.getByRole('button', { name: 'save' }))
    await user.click(await screen.findByRole('button', { name: 'No' }))

    expect(onProceed).toHaveBeenCalledTimes(1)
  })

  it('treats a dismissal as a no', async () => {
    const { user, onProceed } = renderSaver({ incidentOrObservations: 'Engine ran rough' })

    await user.click(screen.getByRole('button', { name: 'save' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1))
  })

  it('hands the flight over to a pre-filled occurrence report when the answer is yes', async () => {
    const { user, onProceed } = renderSaver({ incidentOrObservations: 'Engine ran rough' })

    await user.click(screen.getByRole('button', { name: 'save' }))
    await user.click(await screen.findByRole('button', { name: 'Yes, start a report' }))

    expect(await screen.findByText(/landed \/logs\/occurrences\/new/)).toHaveTextContent(
      'for OH-STL on 2025-05-22T08:00:00.000Z saying Engine ran rough',
    )
    // The pilot went somewhere else instead — the pending navigation is dropped,
    // not run on the way.
    expect(onProceed).not.toHaveBeenCalled()
  })

  it('does not ask again about a remark that was already on the entry before this edit', async () => {
    const { user, onProceed } = renderSaver({
      incidentOrObservations: 'Engine ran rough',
      previousIncidentOrObservations: 'Engine ran rough',
    })

    await user.click(screen.getByRole('button', { name: 'save' }))

    expect(onProceed).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Safety related incidents or observations?')).not.toBeInTheDocument()
  })

  it('goes straight on when the save produced no flight to report against', async () => {
    const { user, onProceed } = renderSaver({
      sourceFlightId: undefined,
      incidentOrObservations: 'Engine ran rough',
    })

    await user.click(screen.getByRole('button', { name: 'save' }))

    expect(onProceed).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Safety related incidents or observations?')).not.toBeInTheDocument()
  })
})

/**
 * The comparison baseline. A form that fetches its own entry must not read this live
 * from the SWR cache, because its own save writes back into that cache (#1303 review).
 */
describe('useIncidentAsLoaded', () => {
  type Entry = { incidentOrObservations?: string | null } | undefined

  const renderLatch = (entry: Entry) =>
    renderHook(({ entry }: { entry: Entry }) => useIncidentAsLoaded(entry), {
      initialProps: { entry },
    })

  it('has nothing to report while the entry has not loaded', () => {
    const { result } = renderLatch(undefined)

    expect(result.current).toBeUndefined()
  })

  it('holds what the entry said when it loaded', () => {
    const { result, rerender } = renderLatch(undefined)

    rerender({ entry: { incidentOrObservations: 'Engine ran rough' } })

    expect(result.current).toBe('Engine ran rough')
  })

  it('ignores the save writing its own response back into the cache', () => {
    const { result, rerender } = renderLatch({ incidentOrObservations: null })

    // What populateCache does after a save: `data` now reports the text just written.
    rerender({ entry: { incidentOrObservations: 'Engine ran rough' } })

    // Still "nothing was there before", so a second save of this entry is still asked
    // about rather than silently skipped.
    expect(result.current).toBeNull()
  })

  it('latches an entry that loaded with no observation, not the first one to appear', () => {
    const { result, rerender } = renderLatch({})

    rerender({ entry: { incidentOrObservations: 'Written after the fact' } })

    expect(result.current).toBeUndefined()
  })
})
