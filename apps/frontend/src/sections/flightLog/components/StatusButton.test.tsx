import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FlightLogStatus } from '@mik/contracts/flight-log'
import { StatusButton } from './StatusButton'
import { renderAs, authScenarios } from '../../../test/auth'
import { aFlightLogListEntry } from '../../../test/fixtures'
import { MEMBER_ID } from '@mik/ui/test/fixtures/cast'

describe('StatusButton', () => {
  it('renders an editable NEW badge that triggers update on click', async () => {
    const update = vi.fn()
    const { user } = renderAs(
      authScenarios.user,
      <StatusButton log={aFlightLogListEntry({ status: FlightLogStatus.NEW })} update={update} />,
    )

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:schedule')
    await user.click(screen.getByRole('button', { name: 'Waiting for validation' }))
    expect(update).toHaveBeenCalled()
  })

  it('renders a VALIDATED badge', () => {
    renderAs(
      authScenarios.user,
      <StatusButton log={aFlightLogListEntry({ status: FlightLogStatus.VALIDATED })} />,
    )

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:check')
  })

  it('renders a QUEUED_FOR_INVOICING badge', () => {
    renderAs(
      authScenarios.user,
      <StatusButton log={aFlightLogListEntry({ status: FlightLogStatus.QUEUED_FOR_INVOICING })} />,
    )

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:clock-outline')
  })

  it('renders a plain INVOICED badge when the viewer cannot download the invoice', () => {
    renderAs(
      authScenarios.user,
      <StatusButton
        log={aFlightLogListEntry({
          status: FlightLogStatus.INVOICED,
          invoiceNumber: '123',
          billableMemberId: 'SomeoneElse1',
        })}
      />,
    )

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:invoice-send-outline')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a downloadable INVOICED badge for the billable member', async () => {
    renderAs(
      authScenarios.user,
      <StatusButton
        log={aFlightLogListEntry({
          status: FlightLogStatus.INVOICED,
          invoiceNumber: '123',
          billableMemberId: MEMBER_ID,
        })}
      />,
    )

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:invoice-send-outline')
    // canDownloadInvoice() depends on `me`, loaded asynchronously via useRoles.
    expect(await screen.findByRole('button')).toBeInTheDocument()
  })

  it('renders a downloadable PAID badge for the billable member', async () => {
    renderAs(
      authScenarios.user,
      <StatusButton
        log={aFlightLogListEntry({
          status: FlightLogStatus.PAID,
          invoiceNumber: '123',
          billableMemberId: MEMBER_ID,
        })}
      />,
    )

    expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:invoice-check')
    expect(await screen.findByRole('button')).toBeInTheDocument()
  })
})
