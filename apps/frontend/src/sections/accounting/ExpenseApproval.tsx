import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  Alert,
  Box,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import {
  ExpenseClaimStatus,
  type ExpenseClaim,
  type ExpenseClaimListResponse,
} from '@backend/routes/expenses/models'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import {
  ExpenseStatusChip,
  formatExpenseAmount,
  getExpenseCategoryLabel,
} from '../expenses/expenseUi'

const PAGE_SIZE = 20

export function ExpenseApproval() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>(ExpenseClaimStatus.SUBMITTED)

  const { data, isLoading, error } = useApi<ExpenseClaimListResponse>({
    url: 'v1/expenses/admin/all',
    params: {
      page,
      pageSize: PAGE_SIZE,
      ...(status ? { status } : {}),
    },
  })

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  return (
    <Box>
      <Title label={t('header.expenseClaims')} />

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label='Status'
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value=''>All</MenuItem>
            {[
              ExpenseClaimStatus.SUBMITTED,
              ExpenseClaimStatus.PENDING_INFO,
              ExpenseClaimStatus.APPROVED,
              ExpenseClaimStatus.REJECTED,
            ].map((value) => (
              <MenuItem key={value} value={value}>
                {t(`expenses.status.${value}`)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      <RemoteContent isLoading={isLoading} error={error}>
        {!data?.claims.length ? (
          <Alert severity='info'>No expense claims found.</Alert>
        ) : (
          <Paper>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Member</TableCell>
                  <TableCell>{t('expenses.fields.category')}</TableCell>
                  <TableCell>{t('expenses.fields.totalAmount')}</TableCell>
                  <TableCell>{t('expenses.fields.submittedAt')}</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.claims.map((claim: ExpenseClaim) => (
                  <TableRow
                    key={claim.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/accounting/expenses/${claim.id}`)}
                  >
                    <TableCell>{claim.memberName ?? claim.memberId}</TableCell>
                    <TableCell>{getExpenseCategoryLabel(claim, t)}</TableCell>
                    <TableCell>{formatExpenseAmount(claim.totalAmount)}</TableCell>
                    <TableCell>
                      {claim.submittedAt ? new Date(claim.submittedAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <ExpenseStatusChip status={claim.status} t={t} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={pageCount} page={page} onChange={(_event, value) => setPage(value)} />
        </Box>
      </RemoteContent>
    </Box>
  )
}
