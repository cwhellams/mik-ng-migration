import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { ExpenseClaimStatus, type ExpenseClaim } from '@backend/routes/expenses/models'
import useApi, { sharedApi } from '../../hooks/useApi'
import { useMe } from '../../hooks/useMe'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import {
  ExpenseStatusChip,
  formatExpenseAmount,
  getExpenseCategoryLabel,
} from '../expenses/expenseUi'

export function ExpenseClaimAdminDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const { me } = useMe()
  const [rejectReason, setRejectReason] = useState('')
  const [infoRequest, setInfoRequest] = useState('')
  const [efnuPrice, setEfnuPrice] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [setDraftOpen, setSetDraftOpen] = useState(false)
  const [overrideFuelPriceOpen, setOverrideFuelPriceOpen] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)

  const claimApi = useApi<ExpenseClaim>({ url: `v1/expenses/${id}` })
  const { mutation } = useApi<ExpenseClaim | { url: string }>({
    url: 'v1/expenses',
    skipFetch: true,
  })

  const claim = claimApi.data
  const selfApproval = me?.memberId === claim?.memberId

  // Auto-fetch presigned URL for the receipt so it can be rendered inline
  useEffect(() => {
    if (!claim?.receipt?.storageKey) {
      setReceiptUrl(null)
      return
    }
    void sharedApi
      .get<{ url: string }>(`v1/expenses/${claim.id}/receipt`)
      .then((res) => setReceiptUrl(res.data.url))
      .catch(() => setReceiptUrl(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim?.id, claim?.receipt?.storageKey])

  const approve = async () => {
    if (!claim) {
      return
    }

    setActionError(undefined)
    const response = await mutation.trigger('POST', {}, `${claim.id}/approve`)
    if (response.error) {
      setActionError(response.error.detail)
      return
    }
    await claimApi.mutate()
  }

  const reject = async () => {
    if (!claim) {
      return
    }

    setActionError(undefined)
    const response = await mutation.trigger('POST', { reason: rejectReason }, `${claim.id}/reject`)
    if (response.error) {
      setActionError(response.error.detail)
      return
    }
    setRejectOpen(false)
    setRejectReason('')
    await claimApi.mutate()
  }

  const requestInfo = async () => {
    if (!claim) {
      return
    }

    setActionError(undefined)
    const response = await mutation.trigger(
      'POST',
      { message: infoRequest },
      `${claim.id}/request-info`,
    )
    if (response.error) {
      setActionError(response.error.detail)
      return
    }
    setInfoOpen(false)
    setInfoRequest('')
    await claimApi.mutate()
  }

  const overrideFuelPrice = async () => {
    if (!claim) {
      return
    }

    setActionError(undefined)
    const response = await mutation.trigger(
      'POST',
      { efnuPrice: Number(efnuPrice) },
      `${claim.id}/override-fuel-price`,
    )
    if (response.error) {
      setActionError(response.error.detail)
      return
    }
    setOverrideFuelPriceOpen(false)
    setEfnuPrice('')
    await claimApi.mutate()
  }

  const setToDraft = async () => {
    if (!claim) {
      return
    }

    setActionError(undefined)
    const response = await mutation.trigger('POST', {}, `${claim.id}/set-draft`)
    if (response.error) {
      setActionError(response.error.detail)
      return
    }
    setSetDraftOpen(false)
    await claimApi.mutate()
  }

  return (
    <Box>
      <Title label={claim?.title ?? t('header.expenseClaims')} />
      <RemoteContent isLoading={claimApi.isLoading} error={claimApi.error}>
        {claim && (
          <Stack spacing={3}>
            {!!actionError && <Alert severity='error'>{actionError}</Alert>}

            <Paper sx={{ p: 3 }}>
              <Stack spacing={1}>
                <Typography variant='h6'>{claim.memberName ?? claim.memberId}</Typography>
                <Typography variant='body2'>{claim.memberEmail ?? '—'}</Typography>
                <Typography variant='body2'>Member ID: {claim.memberId}</Typography>
                {claim.iban && (
                  <Typography variant='body2'>
                    IBAN: {claim.iban}
                    {claim.ibanAccountName ? ` (${claim.ibanAccountName})` : ''}
                  </Typography>
                )}
              </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Stack spacing={1}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <ExpenseStatusChip status={claim.status} t={t} />
                  <Typography variant='body2'>{getExpenseCategoryLabel(claim, t)}</Typography>
                </Stack>
                <Typography variant='body1'>{claim.description || '—'}</Typography>
                <Typography variant='body2'>
                  {t('expenses.fields.totalAmount')}: {formatExpenseAmount(claim.totalAmount)}
                </Typography>
                {claim.aircraftId && (
                  <Typography variant='body2'>
                    {t('expenses.fields.aircraft')}: {claim.aircraftId}
                  </Typography>
                )}
                {claim.categoryCode === 'fuel' && (
                  <Typography variant='body2'>
                    {t('expenses.fields.refuelOutsideFinland')}:{' '}
                    {claim.refuelOutsideFinland ? t('common.yes') : t('common.no')}
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
                    <TableCell>Item code</TableCell>
                    <TableCell>Cost centre</TableCell>
                    <TableCell>Qty</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Unit price</TableCell>
                    <TableCell align='right'>
                      {claim.currency && claim.currency !== 'EUR' ? 'Total (EUR)' : 'Total'}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {claim.lineItems?.map((item) => {
                    const claimFxRate = claim.fxRate
                    const isNonEur = claim.currency && claim.currency !== 'EUR'
                    const lineTotal = item.quantity * item.unitPrice
                    const eurTotal = isNonEur
                      ? claimFxRate != null
                        ? lineTotal * claimFxRate
                        : null
                      : lineTotal
                    return (
                      <TableRow key={item.id ?? item.sortOrder}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.itemCode ?? '—'}</TableCell>
                        <TableCell>{item.costCentreCode ?? '—'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>
                          {isNonEur
                            ? `${item.unitPrice} ${claim.currency}`
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
              {!claim.receipt ? (
                <Alert severity='info'>No receipt uploaded.</Alert>
              ) : (
                <Box>
                  <Stack
                    direction='row'
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant='body2'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {claim.receipt.fileName} · {Math.round(claim.receipt.fileSize / 1024)} kB
                    </Typography>
                    {receiptUrl && (
                      <Button
                        size='small'
                        onClick={() => window.open(receiptUrl, '_blank', 'noopener,noreferrer')}
                      >
                        Open in tab
                      </Button>
                    )}
                  </Stack>
                  {!receiptUrl && (
                    <Typography
                      variant='body2'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      Loading…
                    </Typography>
                  )}
                  {receiptUrl && claim.receipt.mimeType === 'application/pdf' && (
                    <Box
                      component='iframe'
                      src={receiptUrl}
                      sx={{
                        width: '100%',
                        height: 700,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                      }}
                    />
                  )}
                  {receiptUrl && claim.receipt.mimeType !== 'application/pdf' && (
                    <Box
                      component='img'
                      src={receiptUrl}
                      alt={claim.receipt.fileName}
                      sx={{
                        maxWidth: '100%',
                        display: 'block',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                  )}
                </Box>
              )}
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                Messages
              </Typography>
              {!claim.messages?.length ? (
                <Alert severity='info'>No messages yet.</Alert>
              ) : (
                <Stack spacing={2}>
                  {claim.messages.map((message) => (
                    <Paper key={message.id} variant='outlined' sx={{ p: 2 }}>
                      <Typography
                        variant='body2'
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        {message.messageType} · {new Date(message.sentAt).toLocaleString()}
                      </Typography>
                      <Typography variant='body1'>{message.body}</Typography>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Paper>

            <Stack
              direction='row'
              spacing={2}
              sx={{
                flexWrap: 'wrap',
              }}
            >
              {[ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.PENDING_INFO].includes(
                claim.status,
              ) && (
                <>
                  <Tooltip title={selfApproval ? t('expenses.messages.selfApproval') : ''}>
                    <span>
                      <Button
                        variant='contained'
                        disabled={selfApproval}
                        onClick={() => void approve()}
                      >
                        {t('expenses.actions.approve')}
                      </Button>
                    </span>
                  </Tooltip>
                  <Button variant='outlined' color='error' onClick={() => setRejectOpen(true)}>
                    {t('expenses.actions.reject')}
                  </Button>
                  <Button variant='outlined' onClick={() => setInfoOpen(true)}>
                    {t('expenses.actions.requestInfo')}
                  </Button>
                  <Button variant='outlined' color='warning' onClick={() => setSetDraftOpen(true)}>
                    {t('expenses.actions.setToDraft')}
                  </Button>
                  {claim.categoryCode === 'fuel' && (
                    <Button variant='outlined' onClick={() => setOverrideFuelPriceOpen(true)}>
                      {t('expenses.actions.overrideFuelPrice')}
                    </Button>
                  )}
                </>
              )}
              <Button component={Link} to='/accounting/expenses' variant='text'>
                Back
              </Button>
            </Stack>
          </Stack>
        )}
      </RemoteContent>
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} fullWidth maxWidth='sm'>
        <DialogTitle>{t('expenses.actions.reject')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label={t('expenses.messages.rejectionReason')}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>{t('general.cancel')}</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => void reject()}
            disabled={!rejectReason.trim()}
          >
            {t('expenses.actions.reject')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} fullWidth maxWidth='sm'>
        <DialogTitle>{t('expenses.actions.requestInfo')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label={t('expenses.messages.infoRequest')}
            value={infoRequest}
            onChange={(event) => setInfoRequest(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoOpen(false)}>{t('general.cancel')}</Button>
          <Button
            variant='contained'
            onClick={() => void requestInfo()}
            disabled={!infoRequest.trim()}
          >
            {t('expenses.actions.requestInfo')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={setDraftOpen} onClose={() => setSetDraftOpen(false)} fullWidth maxWidth='sm'>
        <DialogTitle>{t('expenses.actions.setToDraft')}</DialogTitle>
        <DialogContent>
          <Typography>{t('expenses.messages.setToDraftConfirm')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetDraftOpen(false)}>{t('general.cancel')}</Button>
          <Button variant='contained' color='warning' onClick={() => void setToDraft()}>
            {t('expenses.actions.setToDraft')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={overrideFuelPriceOpen}
        onClose={() => setOverrideFuelPriceOpen(false)}
        fullWidth
        maxWidth='sm'
      >
        <DialogTitle>{t('expenses.actions.overrideFuelPrice')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            type='number'
            label={t('expenses.messages.efnuPriceLabel')}
            value={efnuPrice}
            onChange={(event) => setEfnuPrice(event.target.value)}
            onFocus={(event) => event.target.select()}
            sx={{ mt: 1 }}
            slotProps={{
              htmlInput: { step: '0.01', min: 0 },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverrideFuelPriceOpen(false)}>{t('general.cancel')}</Button>
          <Button
            variant='contained'
            onClick={() => void overrideFuelPrice()}
            disabled={!efnuPrice || Number(efnuPrice) <= 0}
          >
            {t('expenses.actions.overrideFuelPrice')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
