import { Chip } from '@mui/material'
import { ExpenseClaimStatus, type ExpenseClaim } from '@backend/routes/expenses/models'

const currencyFormatter = new Intl.NumberFormat('fi-FI', {
  style: 'currency',
  currency: 'EUR',
})

export const formatExpenseAmount = (amount?: number): string =>
  currencyFormatter.format(amount ?? 0)

export const getExpenseStatusColor = (
  status: ExpenseClaimStatus,
): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  switch (status) {
    case ExpenseClaimStatus.SUBMITTED:
      return 'info'
    case ExpenseClaimStatus.PENDING_INFO:
      return 'warning'
    case ExpenseClaimStatus.APPROVED:
    case ExpenseClaimStatus.SYNCED:
      return 'success'
    case ExpenseClaimStatus.REJECTED:
      return 'error'
    default:
      return 'default'
  }
}

export const getExpenseStatusLabel = (
  status: ExpenseClaimStatus,
  t: (key: string) => string,
): string => t(`expenses.status.${status}`)

export const getExpenseCategoryLabel = (
  claim: Pick<ExpenseClaim, 'categoryCode' | 'categoryId'>,
  t: (key: string) => string,
): string => {
  if (claim.categoryCode) {
    return t(`expenses.category.${claim.categoryCode}`)
  }

  return String(claim.categoryId)
}

export const isExpenseEditable = (status: ExpenseClaimStatus): boolean =>
  status === ExpenseClaimStatus.DRAFT || status === ExpenseClaimStatus.PENDING_INFO

export const ExpenseStatusChip = ({
  status,
  t,
}: {
  status: ExpenseClaimStatus
  t: (key: string) => string
}) => (
  <Chip
    size='small'
    label={getExpenseStatusLabel(status, t)}
    color={getExpenseStatusColor(status)}
    variant={status === ExpenseClaimStatus.DRAFT ? 'outlined' : 'filled'}
  />
)
