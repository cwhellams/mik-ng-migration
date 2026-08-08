import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { ConfirmButton, ConfirmDialog } from './ConfirmDialog'

const props = {
  title: 'Delete member',
  message: 'This cannot be undone.',
  confirmText: 'Delete',
  cancelText: 'Cancel',
}

describe('ConfirmDialog', () => {
  it('stays out of the DOM until opened', () => {
    renderWithProviders(
      <ConfirmDialog {...props} open={false} onClose={() => {}} onConfirm={() => {}} />,
    )

    expect(screen.queryByText('This cannot be undone.')).toBeNull()
  })

  it('shows the title, message and both actions when open', () => {
    renderWithProviders(<ConfirmDialog {...props} open onClose={() => {}} onConfirm={() => {}} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete member')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('confirms without closing itself — the caller owns the open state', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <ConfirmDialog {...props} open onClose={onClose} onConfirm={onConfirm} />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancels without confirming', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <ConfirmDialog {...props} open onClose={onClose} onConfirm={onConfirm} />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <ConfirmDialog {...props} open onClose={onClose} onConfirm={() => {}} />,
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('focuses the confirm button, so Enter confirms', async () => {
    renderWithProviders(<ConfirmDialog {...props} open onClose={() => {}} onConfirm={() => {}} />)

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it.each([
    ['warning', 'mdi:alert'],
    ['error', 'mdi:alert-circle'],
    ['info', 'mdi:information'],
  ] as const)('uses the %s icon', (severity, icon) => {
    renderWithProviders(
      <ConfirmDialog {...props} open severity={severity} onClose={() => {}} onConfirm={() => {}} />,
    )

    expect(screen.getAllByTestId('icon')[0]).toHaveAttribute('data-icon', icon)
  })

  it('defaults to the warning severity', () => {
    renderWithProviders(<ConfirmDialog {...props} open onClose={() => {}} onConfirm={() => {}} />)

    expect(screen.getAllByTestId('icon')[0]).toHaveAttribute('data-icon', 'mdi:alert')
  })
})

describe('ConfirmButton', () => {
  it('shows only its trigger to begin with', () => {
    renderWithProviders(<ConfirmButton {...props} onConfirm={() => {}} />)

    expect(screen.getByRole('button', { name: /Delete member/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the dialog when the trigger is pressed', async () => {
    const { user } = renderWithProviders(<ConfirmButton {...props} onConfirm={() => {}} />)

    await user.click(screen.getByRole('button', { name: /Delete member/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('confirms and closes in one step', async () => {
    const onConfirm = vi.fn()
    const { user } = renderWithProviders(<ConfirmButton {...props} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /Delete member/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    // MUI keeps the dialog mounted through its exit transition.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on cancel without confirming', async () => {
    const onConfirm = vi.fn()
    const { user } = renderWithProviders(<ConfirmButton {...props} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /Delete member/ }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
