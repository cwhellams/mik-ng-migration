import { screen, waitFor } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/renderWithProviders'
import { readOccurrencePrefill } from './safetyOccurrence'
import { useSafetyReportPrompt } from './useSafetyReportPrompt'
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
  incidentOrObservations,
  previousIncidentOrObservations,
  onProceed,
}: {
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
              sourceFlightId: 'fl-1',
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
  const rendered = renderWithProviders(
    <Routes>
      <Route path='/logs/flights/new' element={<Saver {...props} onProceed={onProceed} />} />
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
})
