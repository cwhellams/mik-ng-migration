import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import type { Order, OrderStatus } from '@mik/contracts/shop'
import { useParams, Link } from 'react-router'
import useApi from '@mik/ui/hooks/useApi'
import { useSnackbar } from '../../hooks/useSnackbar'
import { useLocalisedText, type UiLanguage } from '@mik/ui/utils/localisedText'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { ORDER_STATUS_COLOR } from '@mik/ui/utils/orderStatusColor'

const ALL_STATUSES: OrderStatus[] = [
  'PENDING',
  'PROCESSING',
  'INVOICED',
  'INVOICE_PAID',
  'CANCELLED',
  'REFUNDED',
]

export default function OrderDetailAdmin() {
  const { orderId } = useParams<{ orderId: string }>()
  const { t } = useTranslation()
  const { localise } = useLocalisedText()

  const { showSnackbar } = useSnackbar()
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | ''>('')

  const {
    data: order,
    mutate,
    isLoading,
    error,
    mutation: statusMutation,
  } = useApi<Order>({
    url: `v1/shop/orders/${orderId ?? ''}`,
    skipFetch: !orderId,
  })

  const handleStatusSave = async () => {
    if (!pendingStatus || !orderId) return
    const result = await statusMutation.trigger('PUT', { status: pendingStatus }, 'status')
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error', autoHideDuration: 4000 })
    } else {
      showSnackbar(t('shop.admin.statusUpdated'), { severity: 'success', autoHideDuration: 4000 })
      setPendingStatus('')
      await mutate()
    }
  }

  const itemsTotal =
    order?.items?.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0
  const discountAmount = order?.discountAmount ?? 0

  return (
    <Box>
      <Button
        component={Link}
        to='/admin/shop/orders'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('shop.admin.orders')}
      </Button>
      <Title label={t('shop.orderDetail')} />
      <RemoteContent isLoading={isLoading} error={error}>
        {!isLoading && !error && !order && <Alert severity='error'>{t('common.notFound')}</Alert>}
        {order && (
          <Box>
            {/* Order summary */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 2 }}>
                <Box>
                  <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {t('shop.orderId')}
                  </Typography>
                  <Typography variant='h6'>#{order.orderId}</Typography>
                </Box>
                <Box>
                  <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {t('shop.status')}
                  </Typography>
                  <Box>
                    <Chip
                      size='small'
                      label={order.status}
                      color={ORDER_STATUS_COLOR[order.status] ?? 'default'}
                    />
                  </Box>
                </Box>
                {order.createdAt && (
                  <Box>
                    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                      {t('shop.orderDate')}
                    </Typography>
                    <Typography>{new Date(order.createdAt).toLocaleDateString()}</Typography>
                  </Box>
                )}
                {order.invoiceId && (
                  <Box>
                    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                      {t('shop.invoiceId')}
                    </Typography>
                    <Typography>{order.invoiceId}</Typography>
                  </Box>
                )}
              </Box>

              {/* Member contact info */}
              {order.member && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant='subtitle2' gutterBottom>
                    {t('shop.member')}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    <Typography>
                      {order.member.firstName} {order.member.lastName}
                    </Typography>
                    <Typography>
                      <a href={`mailto:${order.member.email}`}>{order.member.email}</a>
                    </Typography>
                    {order.member.phoneNumber && (
                      <Typography>{order.member.phoneNumber}</Typography>
                    )}
                  </Box>
                </>
              )}

              {/* Notes */}
              {order.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant='subtitle2' gutterBottom>
                    {t('shop.notes')}
                  </Typography>
                  <Typography variant='body2'>{order.notes}</Typography>
                </>
              )}

              {/* Status update */}
              <Divider sx={{ my: 2 }} />
              <Typography variant='subtitle2' gutterBottom>
                {t('shop.admin.updateStatus')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControl size='small' sx={{ minWidth: 200 }}>
                  <InputLabel>{t('shop.status')}</InputLabel>
                  <Select
                    value={pendingStatus || order.status}
                    label={t('shop.status')}
                    onChange={(e) => setPendingStatus(e.target.value as OrderStatus)}
                  >
                    {ALL_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant='contained'
                  onClick={handleStatusSave}
                  loading={statusMutation.isMutating}
                  disabled={!pendingStatus || pendingStatus === order.status}
                >
                  {t('common.save')}
                </Button>
              </Box>
            </Paper>

            {/* Order items */}
            <TableContainer component={Paper} sx={{ mb: 3 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('shop.product')}</TableCell>
                    <TableCell align='right'>{t('shop.unitPrice')}</TableCell>
                    <TableCell align='right'>{t('shop.quantity')}</TableCell>
                    <TableCell align='right'>{t('shop.lineTotal')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.items?.map((item) => (
                    <TableRow key={item.orderItemId}>
                      <TableCell>
                        {localise(
                          (item.productSnapshot as Record<string, unknown>)?.name as
                            Partial<Record<UiLanguage, string>> | undefined,
                        ) || `Product #${item.productId}`}
                      </TableCell>
                      <TableCell align='right'>€{item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell align='right'>{item.quantity}</TableCell>
                      <TableCell align='right'>
                        €{(item.unitPrice * item.quantity).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Totals */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Box sx={{ width: 280 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>{t('shop.subtotal')}</Typography>
                  <Typography>€{itemsTotal.toFixed(2)}</Typography>
                </Box>
                {discountAmount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: 'success.main' }}>{t('shop.discount')}</Typography>
                    <Typography sx={{ color: 'success.main' }}>
                      -€{discountAmount.toFixed(2)}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 700 }}>{t('shop.total')}</Typography>
                  <Typography sx={{ fontWeight: 700 }}>€{order.totalAmount.toFixed(2)}</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </RemoteContent>
    </Box>
  )
}
