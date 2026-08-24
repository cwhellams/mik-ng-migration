import { Chip } from '@mui/material'
import { ExpenseClaimStatus } from '@mik/contracts/expenses'

import { getExpenseStatusColor, getExpenseStatusLabel } from '../utils/expenseUi'

/**
 * Split out of `utils/expenseUi` when that moved here: everything else in it is
 * a pure formatter usable from a `.ts` module, and this is the one piece that
 * renders. Keeping them in one `.tsx` would have made the formatters
 * unimportable from anywhere that isn't already pulling in MUI.
 */
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
