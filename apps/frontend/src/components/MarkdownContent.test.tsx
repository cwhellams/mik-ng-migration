import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
  it('renders the HTML it is given as markup, not as text', () => {
    renderWithProviders(<MarkdownContent html='<p>Coffee at <strong>EFNU</strong></p>' />)

    expect(screen.getByText('EFNU').tagName).toBe('STRONG')
  })

  it('renders tables, which the styling exists for', () => {
    renderWithProviders(
      <MarkdownContent html='<table><tr><th>Aircraft</th><td>OH-STL</td></tr></table>' />,
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Aircraft' })).toBeInTheDocument()
  })

  it('renders nothing for empty content', () => {
    const { container } = renderWithProviders(<MarkdownContent html='' />)

    expect(container.textContent).toBe('')
  })

  it('injects the HTML verbatim — callers must sanitise upstream', () => {
    // dangerouslySetInnerHTML is exactly that: this pins the contract so nobody
    // assumes the component is doing any escaping of its own.
    renderWithProviders(<MarkdownContent html='<a href="https://mik.fi">Club site</a>' />)

    expect(screen.getByRole('link', { name: 'Club site' })).toHaveAttribute(
      'href',
      'https://mik.fi',
    )
  })
})
