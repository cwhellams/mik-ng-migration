import { screen } from '@testing-library/react'
import type { Problem } from '@mik/contracts/problem'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { SnackAlert } from './SnackAlert'

describe('SnackAlert', () => {
  it('shows nothing without a problem', () => {
    renderWithProviders(<SnackAlert />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a failure as an error', async () => {
    renderWithProviders(<SnackAlert problem={{ status: 500, detail: 'Could not save' }} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not save')
    expect(alert.className).toContain('MuiAlert-colorError')
  })

  it('reports a 200 as a success', async () => {
    renderWithProviders(<SnackAlert problem={{ status: 200, detail: 'Member saved' }} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Member saved')
    expect(alert.className).toContain('MuiAlert-colorSuccess')
  })

  it('falls back to the title when there is no detail', async () => {
    renderWithProviders(<SnackAlert problem={{ status: 500, title: 'Bad Gateway' }} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Bad Gateway')
  })

  it('falls back to a generic word when the problem carries no text', async () => {
    renderWithProviders(<SnackAlert problem={{ status: 500 }} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Error')
  })

  it('keeps the message on screen after the prop is cleared', async () => {
    // It copies the problem into state so the message survives the parent
    // resetting the prop — otherwise the snackbar would blank mid-animation.
    const problem: Problem = { status: 500, detail: 'Could not save' }
    const { rerender } = renderWithProviders(<SnackAlert problem={problem} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')

    rerender(<SnackAlert />)

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  it('replaces the message when a new problem arrives', async () => {
    const { rerender } = renderWithProviders(
      <SnackAlert problem={{ status: 500, detail: 'First' }} />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('First')

    rerender(<SnackAlert problem={{ status: 500, detail: 'Second' }} />)

    expect(await screen.findByText('Second')).toBeInTheDocument()
  })
})
