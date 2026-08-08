import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MEMBER_ID } from '../test/fixtures'
import { renderWithProviders } from '../test/renderWithProviders'
import { AuditFormField } from './AuditFormField'

const AT = '2025-06-02T09:00:00Z'

describe('AuditFormField', () => {
  it('renders the label and the date', () => {
    renderWithProviders(<AuditFormField label='Created' at={AT} />)

    expect(screen.getByText('Created:')).toBeInTheDocument()
    expect(screen.getByText(/02\.06\.2025/)).toBeInTheDocument()
  })

  it('adds the time when asked', () => {
    renderWithProviders(<AuditFormField label='Created' at={AT} includeTime />)

    expect(screen.getByText(/02\.06\.2025 09:00/)).toBeInTheDocument()
  })

  it('renders the date in the reader’s chosen timezone', () => {
    renderWithProviders(<AuditFormField label='Created' at={AT} includeTime />, {
      timezone: 'local',
    })

    // Helsinki is UTC+3 in June (the suite pins TZ=Europe/Helsinki).
    expect(screen.getByText(/02\.06\.2025 12:00/)).toBeInTheDocument()
  })

  it('renders a dash when there is no timestamp', () => {
    renderWithProviders(<AuditFormField label='Created' />)

    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('shows nothing about the author when there is none', () => {
    renderWithProviders(<AuditFormField label='Created' at={AT} />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/\(/)).toBeNull()
  })

  it('names the author when a display name is known', () => {
    renderWithProviders(
      <AuditFormField label='Created' at={AT} by='k1mnimda' byName='Klubi Admin' />,
    )

    expect(screen.getByText(/\(Klubi Admin\)/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('links to the member when only an id is known', () => {
    renderWithProviders(<AuditFormField label='Created' at={AT} by='k1mnimda' />)

    expect(screen.getByRole('link', { name: 'k1mnimda' })).toHaveAttribute(
      'href',
      '/members/k1mnimda',
    )
  })

  it('says "self" when the reader is the author', () => {
    renderWithProviders(
      <AuditFormField label='Created' at={AT} by={MEMBER_ID} memberId={MEMBER_ID} />,
    )

    expect(screen.getByText(/\(self\)/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('prefers "self" over the display name', () => {
    renderWithProviders(
      <AuditFormField
        label='Created'
        at={AT}
        by={MEMBER_ID}
        byName='Matti Virtanen'
        memberId={MEMBER_ID}
      />,
    )

    expect(screen.getByText(/\(self\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Matti Virtanen/)).toBeNull()
  })
})
