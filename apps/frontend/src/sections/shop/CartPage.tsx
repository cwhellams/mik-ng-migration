import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import useApi from '../../hooks/useApi'
import { useSnackbar } from '../../hooks/useSnackbar'
import { useLocalisedText } from '@mik/ui/utils/localisedText'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import type { Cart, Order } from '@mik/contracts/shop'
import { Link, useNavigate } from 'react-router'

export default function CartPage() {
  const { t } = useTranslation()
  const { localise } = useLocalisedText()
  const navigate = useNavigate()
  const { showSnackbar } = useSnackbar()

  const [couponInput, setCouponInput] = useState('')
  const [notes, setNotes] = useState('')

  const {
    data: cart,
    mutate,
    isLoading,
    error,
    mutation: cartMutation,
  } = useApi<Cart>({ url: 'v1/shop/cart' })
  const { mutation: orderMutation } = useApi<Order>({
    url: 'v1/shop/orders',
    skipFetch: true,
  })

  const handleQtyChange = async (itemId: number, qty: number) => {
    await cartMutation.trigger('PUT', { quantity: qty }, `items/${itemId}`)
    await mutate()
  }

  const handleRemove = async (itemId: number) => {
    await cartMutation.trigger('DELETE', {}, `items/${itemId}`)
    await mutate()
  }

  const handleClear = async () => {
    await cartMutation.trigger('DELETE', {})
    await mutate()
  }

  const handleApplyDiscount = async () => {
    const result = await cartMutation.trigger('POST', { code: couponInput || null }, 'discount')
    if (result.error) {
      showSnackbar(t('shop.discountInvalid'), { severity: 'error', autoHideDuration: 4000 })
    } else {
      await mutate()
      showSnackbar(t('shop.discountApplied'), { severity: 'success', autoHideDuration: 4000 })
    }
  }

  const handlePlaceOrder = async () => {
    const result = await orderMutation.trigger('POST', {
      notes: notes || undefined,
    })
    if (result.error || !result.data) {
      showSnackbar(result.error?.detail ?? t('common.error'), {
        severity: 'error',
        autoHideDuration: 4000,
      })
    } else {
      showSnackbar(t('shop.orderPlaced'), { severity: 'success', autoHideDuration: 4000 })
      mutate(undefined, true)
      navigate(`/shop/orders/${result.data.orderId}`)
    }
  }

  const items = cart?.items ?? []
  const subtotal = items.reduce((s, i) => s + (i.product?.price ?? 0) * i.quantity, 0)

  return (
    <Box>
      <Title label={t('shop.cart')} />
      <RemoteContent isLoading={isLoading} error={error}>
        {!isLoading && items.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Icon icon='mdi:cart-off' width={64} style={{ opacity: 0.3 }} />
            <Typography variant='h6' sx={{ mt: 2, mb: 2 }}>
              {t('shop.cartEmpty')}
            </Typography>
            <Button variant='contained' component={Link} to='/shop'>
              {t('shop.continueShopping')}
            </Button>
          </Box>
        ) : (
          <Stack
            spacing={3}
            direction={{ xs: 'column', md: 'row' }}
            sx={{
              alignItems: 'flex-start',
            }}
          >
            {/* Cart items table */}
            <Box sx={{ flexGrow: 1 }}>
              <TableContainer component={Paper} variant='outlined'>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('shop.product')}</TableCell>
                      <TableCell align='right'>{t('shop.unitPrice')}</TableCell>
                      <TableCell align='center'>{t('shop.quantity')}</TableCell>
                      <TableCell align='right'>{t('shop.total')}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.cartItemId}>
                        <TableCell>
                          <Typography
                            variant='body2'
                            sx={{
                              fontWeight: 600,
                            }}
                          >
                            {item.product ? localise(item.product.name) : item.productId}
                          </Typography>
                          {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                            <Box>
                              {Object.entries(item.selectedOptions).map(([k, v]) => (
                                <Chip key={k} label={`${k}: ${v}`} size='small' sx={{ mr: 0.5 }} />
                              ))}
                            </Box>
                          )}
                          {item.product?.maxOrderQuantity && (
                            <Typography
                              variant='caption'
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {t('shop.maxPerMemberQty', {
                                max: item.product.maxOrderQuantity,
                              })}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align='right'>€{item.product?.price.toFixed(2)}</TableCell>
                        <TableCell align='center'>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 1,
                            }}
                          >
                            <IconButton
                              size='small'
                              onClick={() => handleQtyChange(item.cartItemId, item.quantity - 1)}
                            >
                              <Icon icon='mdi:minus' />
                            </IconButton>
                            <Typography>{item.quantity}</Typography>
                            <IconButton
                              size='small'
                              disabled={
                                !!(
                                  item.product?.maxOrderQuantity &&
                                  item.quantity >= item.product.maxOrderQuantity
                                )
                              }
                              onClick={() => handleQtyChange(item.cartItemId, item.quantity + 1)}
                            >
                              <Icon icon='mdi:plus' />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell align='right'>
                          €{((item.product?.price ?? 0) * item.quantity).toFixed(2)}
                        </TableCell>
                        <TableCell align='right'>
                          <IconButton size='small' onClick={() => handleRemove(item.cartItemId)}>
                            <Icon icon='mdi:trash-can-outline' />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ mt: 1 }}>
                <Button
                  size='small'
                  color='error'
                  onClick={handleClear}
                  startIcon={<Icon icon='mdi:trash-can-outline' />}
                >
                  {t('shop.clearCart')}
                </Button>
              </Box>
            </Box>

            {/* Order summary */}
            <Paper variant='outlined' sx={{ p: 3, minWidth: 300 }}>
              <Typography variant='h6' gutterBottom>
                {t('shop.orderSummary')}
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={1} sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>{t('shop.subtotal')}</Typography>
                  <Typography>€{subtotal.toFixed(2)}</Typography>
                </Box>
                {cart?.discountCodeId && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography
                      sx={{
                        color: 'success.main',
                      }}
                    >
                      {t('shop.discount')}
                    </Typography>
                    <Chip label={t('shop.discountApplied')} size='small' color='success' />
                  </Box>
                )}
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {t('shop.total')}
                  </Typography>
                  <Typography
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    €{subtotal.toFixed(2)}
                  </Typography>
                </Box>
              </Stack>

              {/* Discount code */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label={t('shop.discountCode')}
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  size='small'
                  fullWidth
                />
                <Button variant='outlined' onClick={handleApplyDiscount}>
                  {t('common.apply')}
                </Button>
              </Box>

              {/* Notes */}
              <TextField
                label={t('shop.notes')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                size='small'
                fullWidth
                multiline
                rows={2}
                sx={{ mb: 2 }}
              />

              <Button
                variant='contained'
                fullWidth
                size='large'
                loading={orderMutation.isMutating}
                onClick={handlePlaceOrder}
                startIcon={<Icon icon='mdi:check-circle' />}
              >
                {t('shop.placeOrder')}
              </Button>

              <Typography
                variant='caption'
                sx={{
                  color: 'text.secondary',
                  mt: 1,
                  display: 'block',
                }}
              >
                {t('shop.invoiceNote')}
              </Typography>

              <Button component={Link} to='/shop' fullWidth sx={{ mt: 1 }}>
                {t('shop.continueShopping')}
              </Button>
            </Paper>
          </Stack>
        )}
      </RemoteContent>
    </Box>
  )
}
