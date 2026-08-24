import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import {
  Alert,
  Box,
  Button,
  Pagination,
  Paper,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import { Icon } from '@iconify/react'
import {
  ExpenseClaimStatus,
  type ExpenseClaim,
  type ExpenseClaimListResponse,
} from '@mik/contracts/expenses'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { formatExpenseAmount, getExpenseCategoryLabel } from '@mik/ui/utils/expenseUi'
import { ExpenseStatusChip } from '@mik/ui/components/ExpenseStatusChip'

const PAGE_SIZE = 20

type ExpenseTab = 'all' | 'open' | 'approved' | 'paid'

export default function ExpensesList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<ExpenseTab>('all')
  const [page, setPage] = useState(1)

  const statusParam =
    tab === 'approved'
      ? ExpenseClaimStatus.APPROVED
      : tab === 'paid'
        ? ExpenseClaimStatus.SYNCED
        : undefined

  const { data, isLoading, error } = useApi<ExpenseClaimListResponse>({
    url: 'v1/expenses',
    params: {
      page,
      pageSize: PAGE_SIZE,
      ...(statusParam ? { status: statusParam } : {}),
    },
  })

  const claims = useMemo(() => {
    const rows = data?.claims ?? []
    if (tab !== 'open') {
      return rows
    }

    return rows.filter((claim) =>
      [
        ExpenseClaimStatus.DRAFT,
        ExpenseClaimStatus.SUBMITTED,
        ExpenseClaimStatus.PENDING_INFO,
      ].includes(claim.status),
    )
  }, [data?.claims, tab])

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  return (
    <Box>
      <Title label={t('expenses.title')}>
        <Button
          component={Link}
          to='/expenses/new'
          variant='contained'
          startIcon={<Icon icon='mdi:plus' />}
        >
          {t('expenses.new')}
        </Button>
      </Title>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: ExpenseTab) => {
            setTab(value)
            setPage(1)
          }}
          variant='scrollable'
          allowScrollButtonsMobile
        >
          <Tab value='all' label={t('common.all')} />
          <Tab value='open' label={t('expenses.tabs.open', 'Open')} />
          <Tab value='approved' label={t('expenses.status.APPROVED')} />
          <Tab value='paid' label={t('expenses.status.SYNCED')} />
        </Tabs>
      </Paper>

      <RemoteContent isLoading={isLoading} error={error}>
        {!claims.length ? (
          <Alert severity='info'>{t('expenses.noClaims', 'No expense claims found.')}</Alert>
        ) : (
          <Paper>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('common.date')}</TableCell>
                  <TableCell>{t('expenses.fields.title')}</TableCell>
                  <TableCell>{t('expenses.fields.category')}</TableCell>
                  <TableCell>{t('expenses.fields.totalAmount')}</TableCell>
                  <TableCell>{t('common.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {claims.map((claim: ExpenseClaim) => (
                  <TableRow
                    key={claim.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/expenses/${claim.id}`)}
                  >
                    <TableCell>
                      {new Date(claim.submittedAt ?? claim.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{claim.title}</TableCell>
                    <TableCell>{getExpenseCategoryLabel(claim, t)}</TableCell>
                    <TableCell>{formatExpenseAmount(claim.totalAmount)}</TableCell>
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
