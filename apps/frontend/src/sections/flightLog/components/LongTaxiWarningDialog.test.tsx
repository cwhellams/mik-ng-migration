import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/renderWithProviders'
import { LongTaxiWarningDialog } from './LongTaxiWarningDialog'
import type { LongTaxiLeg } from '../useLongTaxiCheck'

const render = (
  longLegs: LongTaxiLeg[],
  overrides: Partial<Parameters<typeof LongTaxiWarningDialog>[0]> = {},
) =>
  renderWithProviders(
    <LongTaxiWarningDialog
      open
      longLegs={longLegs}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      {...overrides}
    />,
  )

describe('LongTaxiWarningDialog', () => {
  it('lists the one long leg with the block boundaries it was measured between', async () => {
    render([{ leg: 'out', minutes: 50 }])

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Taxi-out (off-block → takeoff): 50 min')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Taxi-in/)).not.toBeInTheDocument()
  })

  it('lists both long legs as two separate rows, not one run-on sentence', async () => {
    // The presentation half of #1250: with both legs long the old ConfirmDialog got
    // the two sentences joined with a space, so the pilot read one paragraph saying
    // "please confirm this is correct" twice and could miss that there were two
    // distinct entries to check.
    render([
      { leg: 'out', minutes: 50 },
      { leg: 'in', minutes: 50 },
    ])

    const dialog = await screen.findByRole('dialog')
    const rows = within(dialog).getAllByText(/: 50 min$/)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Taxi-out (off-block → takeoff): 50 min')
    expect(rows[1]).toHaveTextContent('Taxi-in (landing → on-block): 50 min')
    // Two elements, not one -- what makes them visibly two items.
    expect(rows[0]).not.toBe(rows[1])
  })

  it('keeps one intro line however many legs are listed', async () => {
    render([
      { leg: 'out', minutes: 50 },
      { leg: 'in', minutes: 50 },
    ])

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getAllByText(
        'Please check the taxi times below and confirm they are correct.',
      ),
    ).toHaveLength(1)
  })

  it('confirms and cancels through its own callbacks', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const { user } = render([{ leg: 'in', minutes: 31 }], { onClose, onConfirm })

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm & Save' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while closed', () => {
    render([{ leg: 'out', minutes: 50 }], { open: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
