import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import type { ExpenseClaim } from '@backend/routes/expenses/models'
import { ExpenseClaimStatus } from '@backend/routes/expenses/models'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import {
  ExpenseStatusChip,
  formatExpenseAmount,
  getExpenseCategoryLabel,
  isExpenseEditable,
} from './expenseUi'

export default function ExpenseClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, error, mutate } = useApi<ExpenseClaim>({ url: `v1/expenses/${id}` })
  const { mutation } = useApi<{ url: string }>({ url: 'v1/expenses', skipFetch: true })
  const [retracting, setRetracting] = useState(false)
  const [retractError, setRetractError] = useState<string>()

  const handleRetract = async () => {
    if (!data) return
    setRetracting(true)
    setRetractError(undefined)
    const res = await mutation.trigger('POST', {}, `${data.id}/retract`)
    setRetracting(false)
    if (res.error) {
      setRetractError(res.error.detail)
    } else {
      await mutate()
    }
  }

  const openReceipt = async () => {
    if (!data) return
    const response = await mutation.trigger<undefined, { url: string }>(
      'GET',
      undefined,
      `${data.id}/receipt`,
    )
    if (response.data?.url) {
      window.open(response.data.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Box>
      <Title label={data?.title ?? t('expenses.title')}>
        {data && isExpenseEditable(data.status) && (
          <Button
            variant='outlined'
            startIcon={<Icon icon='mdi:pencil-outline' />}
            onClick={() => navigate(`/expenses/${data.id}/edit`)}
          >
            {t('general.edit')}
          </Button>
        )}
        {data?.status === ExpenseClaimStatus.SUBMITTED && (
          <Button
            variant='outlined'
            color='warning'
            startIcon={<Icon icon='mdi:undo' />}
            disabled={retracting}
            onClick={() => void handleRetract()}
          >
            {t('expenses.actions.setToDraft')}
          </Button>
        )}
      </Title>

      <RemoteContent isLoading={isLoading} error={error}>
        {data && (
          <Stack spacing={3}>
            {!!retractError && <Alert severity='error'>{retractError}</Alert>}
            <Paper sx={{ p: 3 }}>
              <Stack spacing={1}>
                <Stack direction='row' spacing={1} alignItems='center'>
                  <ExpenseStatusChip status={data.status} t={t} />
                  <Typography variant='body2' color='text.secondary'>
                    {getExpenseCategoryLabel(data, t)}
                  </Typography>
                </Stack>
                <Typography variant='body1'>{data.description || '—'}</Typography>
                <Typography variant='body2'>
                  {t('expenses.fields.totalAmount')}: {formatExpenseAmount(data.totalAmount)}
                </Typography>
                {data.currency && data.currency !== 'EUR' && (
                  <Typography variant='body2'>
                    {t('expenses.fields.currency')}: {data.currency}
                    {data.fxRate ? ` (1 ${data.currency} = ${data.fxRate} EUR)` : ''}
                  </Typography>
                )}
                {data.aircraftId && (
                  <Typography variant='body2'>
                    {t('expenses.fields.aircraft')}: {data.aircraftId}
                  </Typography>
                )}
                {data.flightLogId && (
                  <Typography variant='body2'>Flight log ID: {data.flightLogId}</Typography>
                )}
                {data.simplbooksPurchaseId != null && (
                  <Typography variant='body2'>
                    SimplBooks purchase ID: {data.simplbooksPurchaseId}
                  </Typography>
                )}
              </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                {t('expenses.fields.lineItems')}
              </Typography>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Description</TableCell>
                    <TableCell>Qty</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Unit price</TableCell>
                    <TableCell align='right'>
                      {data.currency && data.currency !== 'EUR' ? 'Total (EUR)' : 'Total'}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.lineItems?.map((item) => {
                    const claimFxRate = data.fxRate
                    const isNonEur = data.currency && data.currency !== 'EUR'
                    const lineTotal = item.quantity * item.unitPrice
                    const eurTotal = isNonEur
                      ? claimFxRate != null
                        ? lineTotal * claimFxRate
                        : null
                      : lineTotal
                    return (
                      <TableRow key={item.id ?? item.sortOrder}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>
                          {isNonEur
                            ? `${item.unitPrice} ${data.currency}`
                            : formatExpenseAmount(item.unitPrice)}
                        </TableCell>
                        <TableCell align='right'>
                          {eurTotal != null ? formatExpenseAmount(eurTotal) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                {t('expenses.fields.receipt')}
              </Typography>
              {!data.receipt ? (
                <Alert severity='info'>No receipt uploaded.</Alert>
              ) : (
                <Stack direction='row' justifyContent='space-between' alignItems='center'>
                  <Typography variant='body2'>
                    {data.receipt.fileName} · {Math.round(data.receipt.fileSize / 1024)} kB
                  </Typography>
                  <Button onClick={() => void openReceipt()}>Open</Button>
                </Stack>
              )}
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                Messages
              </Typography>
              {!data.messages?.length ? (
                <Alert severity='info'>No messages yet.</Alert>
              ) : (
                <Stack spacing={2}>
                  {data.messages.map((message) => (
                    <Paper key={message.id} variant='outlined' sx={{ p: 2 }}>
                      <Typography variant='body2' color='text.secondary'>
                        {message.messageType} · {new Date(message.sentAt).toLocaleString()}
                      </Typography>
                      <Typography variant='body1'>{message.body}</Typography>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                Status history
              </Typography>
              <Stack spacing={1}>
                <Typography variant='body2'>
                  Created: {new Date(data.createdAt).toLocaleString()}
                </Typography>
                {data.submittedAt && (
                  <Typography variant='body2'>
                    {t('expenses.fields.submittedAt')}:{' '}
                    {new Date(data.submittedAt).toLocaleString()}
                  </Typography>
                )}
                {data.approvedAt && (
                  <Typography variant='body2'>
                    {t('expenses.fields.approvedAt')}: {new Date(data.approvedAt).toLocaleString()}
                  </Typography>
                )}
                {data.rejectedAt && (
                  <Typography variant='body2'>
                    Rejected: {new Date(data.rejectedAt).toLocaleString()}
                  </Typography>
                )}
                {data.rejectionReason && (
                  <Typography variant='body2'>Reason: {data.rejectionReason}</Typography>
                )}
              </Stack>
            </Paper>

            <Button component={Link} to='/expenses' variant='outlined'>
              Back
            </Button>
          </Stack>
        )}
      </RemoteContent>
    </Box>
  )
}
