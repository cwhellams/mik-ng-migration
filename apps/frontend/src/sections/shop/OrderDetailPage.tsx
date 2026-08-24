import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import type { Order } from '@mik/contracts/shop'
import { useParams, Link } from 'react-router'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { ORDER_STATUS_COLOR } from '@mik/ui/utils/orderStatusColor'
import { useLocalisedText, type UiLanguage } from '@mik/ui/utils/localisedText'

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { t } = useTranslation()
  const { localise } = useLocalisedText()

  const {
    data: order,
    isLoading,
    error,
  } = useApi<Order>({
    url: `v1/shop/orders/${orderId ?? ''}`,
    skipFetch: !orderId,
  })

  const itemsTotal =
    order?.items?.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0
  const discountAmount = order?.discountAmount ?? 0

  return (
    <Box>
      <Button
        component={Link}
        to='/shop/orders'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('shop.myOrders')}
      </Button>
      <Title label={t('shop.orderDetail')} />
      <RemoteContent isLoading={isLoading} error={error}>
        {!isLoading && !error && !order && <Alert severity='error'>{t('common.notFound')}</Alert>}
        {order && (
          <Box>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 2 }}>
                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('shop.orderId')}
                  </Typography>
                  <Typography variant='h6'>#{order.orderId}</Typography>
                </Box>
                <Box>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
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
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {t('shop.orderDate')}
                    </Typography>
                    <Typography>{new Date(order.createdAt).toLocaleDateString()}</Typography>
                  </Box>
                )}
              </Box>

              {order.status === 'INVOICED' && (
                <Alert severity='info' sx={{ mt: 2 }}>
                  {t('shop.invoiceNote')}
                </Alert>
              )}
              {order.status === 'PENDING' && (
                <Alert severity='warning' sx={{ mt: 2 }}>
                  {t('shop.pendingNote')}
                </Alert>
              )}
            </Paper>

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

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Box sx={{ width: 280 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    mb: 1,
                  }}
                >
                  <Typography>{t('shop.subtotal')}</Typography>
                  <Typography>€{itemsTotal.toFixed(2)}</Typography>
                </Box>
                {discountAmount > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      mb: 1,
                    }}
                  >
                    <Typography
                      sx={{
                        color: 'success.main',
                      }}
                    >
                      {t('shop.discount')}
                    </Typography>
                    <Typography
                      sx={{
                        color: 'success.main',
                      }}
                    >
                      -€{discountAmount.toFixed(2)}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant='h6'>{t('shop.total')}</Typography>
                  <Typography variant='h6'>€{order.totalAmount.toFixed(2)}</Typography>
                </Box>
              </Box>
            </Box>

            {order.notes && (
              <Paper sx={{ p: 2, mt: 3 }}>
                <Typography variant='subtitle2' gutterBottom>
                  {t('shop.notes')}
                </Typography>
                <Typography>{order.notes}</Typography>
              </Paper>
            )}
          </Box>
        )}
      </RemoteContent>
    </Box>
  )
}
