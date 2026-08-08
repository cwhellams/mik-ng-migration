import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { RemoteContent } from './RemoteContent'

const CONTENT = 'the member list'

describe('RemoteContent', () => {
  it('renders its children when there is nothing to report', () => {
    renderWithProviders(<RemoteContent>{CONTENT}</RemoteContent>)

    expect(screen.getByText(CONTENT)).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('keeps the content on screen while refreshing, with a spinner over it', () => {
    // A refresh must not blank the page — the user keeps reading the old data.
    renderWithProviders(<RemoteContent isLoading>{CONTENT}</RemoteContent>)

    expect(screen.getByText(CONTENT)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('replaces the content with the problem detail on failure', () => {
    renderWithProviders(
      <RemoteContent error={{ status: 500, detail: 'Database unavailable' }}>
        {CONTENT}
      </RemoteContent>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable')
    expect(screen.queryByText(CONTENT)).toBeNull()
  })

  it('shows a friendly message for a 403 rather than the raw detail', () => {
    renderWithProviders(
      <RemoteContent error={{ status: 403, detail: 'member.admin required' }}>
        {CONTENT}
      </RemoteContent>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No access')
    expect(screen.queryByText(/member.admin required/)).toBeNull()
  })

  it('falls back to the problem title when there is no detail', () => {
    renderWithProviders(
      <RemoteContent error={{ status: 500, title: 'Internal Server Error' }}>
        {CONTENT}
      </RemoteContent>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Internal Server Error')
  })

  it('prefers the error over the spinner when both are set', () => {
    renderWithProviders(
      <RemoteContent isLoading error={{ status: 500, detail: 'Boom' }}>
        {CONTENT}
      </RemoteContent>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
