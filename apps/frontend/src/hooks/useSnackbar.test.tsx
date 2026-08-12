import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { SnackbarProvider, useSnackbar, type ShowSnackbarOptions } from './useSnackbar'

const wrapper = ({ children }: { children: ReactNode }) => (
  <SnackbarProvider>{children}</SnackbarProvider>
)

const Trigger = ({ message, options }: { message: string; options?: ShowSnackbarOptions }) => {
  const { showSnackbar } = useSnackbar()
  return <button onClick={() => showSnackbar(message, options)}>trigger</button>
}

const TwoTriggers = () => {
  const { showSnackbar } = useSnackbar()
  return (
    <>
      <button onClick={() => showSnackbar('First')}>first</button>
      <button onClick={() => showSnackbar('Second')}>second</button>
    </>
  )
}

describe('useSnackbar without a provider', () => {
  it('throws rather than silently no-op', () => {
    expect(() => renderHook(() => useSnackbar())).toThrow(
      'useSnackbar must be used within a SnackbarProvider',
    )
  })
})

describe('SnackbarProvider', () => {
  it('shows nothing until showSnackbar is called', () => {
    render(<Trigger message='Saved' />, { wrapper })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the message with an info severity by default', async () => {
    const user = userEvent.setup()
    render(<Trigger message='Saved' />, { wrapper })

    await user.click(screen.getByRole('button'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Saved')
    expect(alert.className).toMatch(/colorInfo/)
  })

  it('shows the requested severity', async () => {
    const user = userEvent.setup()
    render(<Trigger message='Could not save' options={{ severity: 'error' }} />, { wrapper })

    await user.click(screen.getByRole('button'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not save')
    expect(alert.className).toMatch(/colorError/)
  })

  it('renders a custom action alongside the message', async () => {
    const user = userEvent.setup()
    render(
      <Trigger message='Added to cart' options={{ action: <a href='/shop/cart'>View cart</a> }} />,
      { wrapper },
    )

    await user.click(screen.getByRole('button'))

    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'View cart' })).toBeInTheDocument()
  })

  it('closing the alert hides it', async () => {
    const user = userEvent.setup()
    render(<Trigger message='Saved' />, { wrapper })

    await user.click(screen.getByRole('button'))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('queues a second message instead of discarding the still-visible first one', async () => {
    const user = userEvent.setup()
    render(<TwoTriggers />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'first' }))
    await user.click(screen.getByRole('button', { name: 'second' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('First')

    await user.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Second'))
  })
})
