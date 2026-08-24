import { screen } from '@testing-library/react'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'
import { describe, expect, it } from 'vitest'

import { ExpenseStatusChip } from './ExpenseStatusChip'
import { renderWithProviders } from '../test/renderWithProviders'

/** The component takes `t` as a prop rather than calling the hook, so a stub is enough. */
const t = (key: string) => key

describe('ExpenseStatusChip', () => {
  it('labels the chip from the status’s translation key', () => {
    renderWithProviders(<ExpenseStatusChip status={ExpenseClaimStatus.APPROVED} t={t} />)

    expect(screen.getByText('expenses.status.APPROVED')).toBeInTheDocument()
  })

  it('outlines a draft and fills everything else', () => {
    // A draft is the one status that is not yet a claim on the club's money, so
    // it reads as provisional rather than as a state the treasurer has set.
    const { unmount } = renderWithProviders(
      <ExpenseStatusChip status={ExpenseClaimStatus.DRAFT} t={t} />,
    )
    expect(screen.getByText('expenses.status.DRAFT').closest('.MuiChip-root')).toHaveClass(
      'MuiChip-outlined',
    )
    unmount()

    renderWithProviders(<ExpenseStatusChip status={ExpenseClaimStatus.SYNCED} t={t} />)
    expect(screen.getByText('expenses.status.SYNCED').closest('.MuiChip-root')).toHaveClass(
      'MuiChip-filled',
    )
  })
})
