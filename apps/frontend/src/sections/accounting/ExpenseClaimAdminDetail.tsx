import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
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
import type { ItemListResponse } from '@backend/routes/invoicing/models'
import { ExpenseClaimStatus, type ExpenseClaim } from '@backend/routes/expenses/models'
import { MIKPermissions } from '@backend/routes/members/models'
import useApi, { sharedApi } from '../../hooks/useApi'
import { useMe } from '../../hooks/useMe'
import { useRoles } from '../../hooks/useRoles'
import { useThemeMode } from '../../theme/ThemeContext'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import {
  ExpenseStatusChip,
  formatExpenseAmount,
  formatExpenseUnitPrice,
  getExpenseCategoryLabel,
} from '../expenses/expenseUi'
import { LineItemsTable, type EditableLineItem } from '../expenses/expenseShared'

const HETU_REVEAL_DURATION_MS = 30_000

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
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editAircraftId, setEditAircraftId] = useState('')
  const [editExpenseDate, setEditExpenseDate] = useState('')
  const [editLineItems, setEditLineItems] = useState<EditableLineItem[]>([])
  const [editError, setEditError] = useState<string>()
  const [editSaving, setEditSaving] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [revealedHetu, setRevealedHetu] = useState<string | null>(null)
  const [hetuError, setHetuError] = useState<string>()
  const hetuHideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  const { hasAccess } = useRoles()
  const { sudo } = useThemeMode()
  const canRevealHetu = sudo && hasAccess(MIKPermissions.EXPENSE_HETU_ADMIN)

  const claimApi = useApi<ExpenseClaim>({ url: `v1/expenses/${id}` })
  const { mutation } = useApi<ExpenseClaim | { url: string } | { hetu: string }>({
    url: 'v1/expenses',
    skipFetch: true,
  })
  const { data: costCentres } = useApi<{ code: string; description: string }[]>({
    url: 'v1/cost-centres',
  })
  const { data: invoiceItemsData } = useApi<ItemListResponse>({ url: 'v1/invoices/items' })

  const claim = claimApi.data
  const selfApproval = me?.memberId === claim?.memberId
  const isFuelClaim = claim?.categoryCode === 'fuel'
  const isMileageClaim = claim?.categoryCode === 'mileage'
  const expenseClaimItems = (invoiceItemsData?.items ?? [])
    .filter((item) => {
      if (!item.expense_claim_item) return false
      if (isFuelClaim) return item.is_fuel_item
      if (isMileageClaim) return item.is_km_item
      return item.is_other_item
    })
    .map((item) => ({ id: item.id, code: item.code, name: item.name }))

  const openEdit = () => {
    if (!claim) return
    setEditTitle(claim.title)
    setEditAircraftId(claim.aircraftId ?? '')
    setEditExpenseDate(claim.expenseDate ?? '')
    setEditLineItems(
      (claim.lineItems ?? []).map((item) => ({
        id: item.id,
        itemId: item.itemId ?? null,
        description: item.description,
        date: item.date ?? '',
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalCost: item.totalCost,
        sortOrder: item.sortOrder,
        costCentreCode: item.costCentreCode ?? null,
        fuelType: item.fuelType,
        airport: item.airport ?? null,
        paidWithClubCard: item.paidWithClubCard ?? false,
      })),
    )
    setEditError(undefined)
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!claim) return
    setEditSaving(true)
    setEditError(undefined)
    const response = await mutation.trigger(
      'PATCH',
      {
        title: editTitle,
        aircraftId: editAircraftId || null,
        expenseDate: editExpenseDate,
        lineItems: editLineItems
          .filter((item) => item.id != null)
          .map((item) => ({
            id: item.id,
            itemId: item.itemId ?? null,
            description: item.description,
            date: item.date || null,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            costCentreCode: item.costCentreCode ?? null,
            airport: item.airport ?? null,
            paidWithClubCard: item.paidWithClubCard,
          })),
      },
      `${claim.id}/edit`,
    )
    setEditSaving(false)
    if (response.error) {
      setEditError(response.error.detail)
      return
    }
    setEditOpen(false)
    await claimApi.mutate()
  }

  useEffect(() => {
    setRevealedHetu(null)
    setHetuError(undefined)
    if (hetuHideTimeout.current) clearTimeout(hetuHideTimeout.current)
    return () => {
      if (hetuHideTimeout.current) clearTimeout(hetuHideTimeout.current)
    }
  }, [id])

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

  const openMergedAttachments = async () => {
    if (!claim) return
    const res = await sharedApi.get(`v1/expenses/${claim.id}/attachments/merged-preview`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

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

  const revealHetu = async () => {
    if (!claim) {
      return
    }

    setHetuError(undefined)
    const response = await mutation.trigger<Record<string, never>, { hetu: string }>(
      'GET',
      {},
      `${claim.id}/mileage/hetu`,
    )
    if (response.error) {
      setHetuError(response.error.detail)
      return
    }

    setRevealedHetu(response.data?.hetu ?? null)
    if (hetuHideTimeout.current) clearTimeout(hetuHideTimeout.current)
    hetuHideTimeout.current = setTimeout(() => setRevealedHetu(null), HETU_REVEAL_DURATION_MS)
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
                            : formatExpenseUnitPrice(item.unitPrice)}
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

            {claim.categoryCode === 'fuel' && claim.fuelReimbursementSummary && (
              <Paper sx={{ p: 3 }}>
                <Typography variant='h6' sx={{ mb: 2 }}>
                  {t('expenses.fuel.summaryTitle')}
                </Typography>
                <Stack spacing={0.5}>
                  <Typography variant='body2'>
                    {t('expenses.fuel.totalLitres')}: {claim.fuelReimbursementSummary.totalLitres} l
                  </Typography>
                  <Typography variant='body2'>
                    {t('expenses.fuel.totalCost')}:{' '}
                    {formatExpenseAmount(claim.fuelReimbursementSummary.totalCost)}
                  </Typography>
                  {claim.fuelReimbursementSummary.localPriceEurPerLitre != null && (
                    <Typography variant='body2'>
                      {t('expenses.fuel.localPriceCost')}:{' '}
                      {formatExpenseAmount(claim.fuelReimbursementSummary.localPriceCost ?? 0)} (
                      {claim.fuelReimbursementSummary.localPriceEurPerLitre.toFixed(4)} €/l)
                    </Typography>
                  )}
                  {claim.fuelReimbursementSummary.clubCardCost > 0 && (
                    <Typography variant='body2'>
                      {t('expenses.fuel.clubCardCost')}:{' '}
                      {formatExpenseAmount(claim.fuelReimbursementSummary.clubCardCost)} (
                      {claim.fuelReimbursementSummary.clubCardLitres} l)
                    </Typography>
                  )}
                  <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
                    {t('expenses.fuel.memberReimbursement')}:{' '}
                    {formatExpenseAmount(claim.fuelReimbursementSummary.memberReimbursement)}
                  </Typography>
                  {claim.fuelReimbursementSummary.memberOwesClub > 0 && (
                    <Alert severity='warning'>
                      {t('expenses.fuel.memberOwesClub', {
                        amount: formatExpenseAmount(claim.fuelReimbursementSummary.memberOwesClub),
                      })}
                    </Alert>
                  )}
                  {claim.fuelReimbursementSummary.capped && (
                    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                      {t('expenses.fuel.cappedNotice')}
                    </Typography>
                  )}
                </Stack>
              </Paper>
            )}

            {claim.categoryCode === 'mileage' && !!claim.mileageLegs?.length && (
              <Paper sx={{ p: 3 }}>
                <Typography variant='h6' sx={{ mb: 2 }}>
                  {t('expenses.mileage.sectionTitle')}
                </Typography>
                <Stack spacing={2}>
                  {claim.mileageLegs.map((leg, idx) => (
                    <Stack key={leg.id ?? idx} spacing={0.5}>
                      <Typography variant='body2'>
                        <b>
                          {t('expenses.mileage.sectionTitle')} {idx + 1}:
                        </b>{' '}
                        {leg.route || `${leg.startAddress} → ${leg.endAddress}`}
                      </Typography>
                      <Typography variant='body2'>
                        {t('expenses.mileage.journeyDate')}: {leg.journeyDate}
                      </Typography>
                      <Typography variant='body2'>
                        {t('expenses.mileage.distanceKm')}: {leg.distanceKm} km
                        {leg.directDistanceKm != null &&
                          ` (${t('expenses.mileage.directDistance', { km: leg.directDistanceKm })})`}
                      </Typography>
                      {leg.justificationNote && (
                        <Typography variant='body2'>
                          {t('expenses.mileage.justificationNote')}: {leg.justificationNote}
                        </Typography>
                      )}
                      {leg.ratePerKm != null && (
                        <Typography variant='body2'>
                          {t('expenses.mileage.ratePerKm')}: {leg.ratePerKm} €/km
                        </Typography>
                      )}
                      <Typography variant='body2'>
                        {t('expenses.mileage.boardApprovedLabel')}:{' '}
                        {leg.boardApproved ? t('common.yes') : t('common.no')}
                      </Typography>
                    </Stack>
                  ))}
                  {claim.hetu && (
                    <Stack
                      direction='row'
                      spacing={1}
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <Typography variant='body2'>
                        {t('expenses.mileage.hetu')}: {revealedHetu ?? claim.hetu}
                      </Typography>
                      {canRevealHetu && !revealedHetu && (
                        <Button size='small' onClick={() => void revealHetu()}>
                          {t('expenses.mileage.reveal')}
                        </Button>
                      )}
                      {revealedHetu && (
                        <Button
                          size='small'
                          onClick={() => void navigator.clipboard.writeText(revealedHetu)}
                        >
                          {t('expenses.mileage.copy')}
                        </Button>
                      )}
                    </Stack>
                  )}
                  {revealedHetu && (
                    <Alert severity='warning'>{t('expenses.mileage.revealNotice')}</Alert>
                  )}
                  {hetuError && <Alert severity='error'>{hetuError}</Alert>}
                </Stack>
              </Paper>
            )}

            <Paper sx={{ p: 3 }}>
              <Typography variant='h6' sx={{ mb: 2 }}>
                {t('expenses.fields.receipt')}
              </Typography>
              {!claim.receipt && !claim.attachments?.length && (
                <Alert severity='info'>No receipt uploaded.</Alert>
              )}
              {!claim.receipt && !!claim.attachments?.length && (
                <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                  {claim.attachments.map((attachment) => (
                    <Typography
                      key={attachment.id}
                      variant='body2'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {attachment.fileName} · {Math.round(attachment.fileSize / 1024)} kB
                    </Typography>
                  ))}
                  <Button size='small' onClick={() => void openMergedAttachments()}>
                    {t('expenses.wizard.previewMergedPdf')}
                  </Button>
                </Stack>
              )}
              {!!claim.receipt && (
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
                  <Tooltip title={selfApproval ? t('expenses.messages.selfApproval') : ''}>
                    <span>
                      <Button variant='outlined' disabled={selfApproval} onClick={openEdit}>
                        {t('expenses.actions.editClaim')}
                      </Button>
                    </span>
                  </Tooltip>
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
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth='md'>
        <DialogTitle>{t('expenses.actions.editClaim')}</DialogTitle>
        <DialogContent>
          <Alert severity='info' sx={{ mb: 2 }}>
            {t('expenses.messages.treasurerEditNotice')}
          </Alert>
          {!!editError && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label={t('expenses.fields.title')}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <TextField
              fullWidth
              label={t('expenses.fields.aircraft')}
              value={editAircraftId}
              onChange={(e) => setEditAircraftId(e.target.value)}
            />
            <TextField
              label={t('expenses.fields.expenseDate')}
              type='date'
              value={editExpenseDate}
              onChange={(e) => setEditExpenseDate(e.target.value)}
              sx={{ maxWidth: 200 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Typography variant='subtitle2'>{t('expenses.fields.lineItems')}</Typography>
            <LineItemsTable
              items={editLineItems}
              onChange={setEditLineItems}
              claimCurrency={claim?.currency ?? 'EUR'}
              claimFxRate={claim?.fxRate}
              expenseClaimItems={expenseClaimItems}
              costCentres={costCentres ?? []}
              isFuel={isFuelClaim}
              allowRowRemoval={false}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>
            {t('general.cancel')}
          </Button>
          <Button variant='contained' onClick={() => void saveEdit()} disabled={editSaving}>
            {t('expenses.actions.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
