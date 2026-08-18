import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/renderWithProviders'
import { ReportRemarksSection } from './ReportRemarksSection'

describe('ReportRemarksSection', () => {
  it('adds a new blank row when "Add remark" is clicked', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <ReportRemarksSection descriptions={[]} onChange={onChange} />,
    )

    await user.click(screen.getByRole('button', { name: /add remark/i }))

    expect(onChange).toHaveBeenCalledWith([''])
  })

  it('lets the user type a description into an existing row', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <ReportRemarksSection descriptions={['']} onChange={onChange} />,
    )

    await user.type(screen.getByLabelText(/description/i), 'x')

    expect(onChange).toHaveBeenCalledWith(['x'])
  })

  it('removes a row when its delete button is clicked', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <ReportRemarksSection descriptions={['Oil stain']} onChange={onChange} />,
    )

    await user.click(screen.getByRole('button', { name: /delete/i }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('flags a whitespace-only row as blank', () => {
    renderWithProviders(<ReportRemarksSection descriptions={['   ']} onChange={vi.fn()} />)

    expect(screen.getByText("Remark description can't be empty")).toBeInTheDocument()
  })
})
