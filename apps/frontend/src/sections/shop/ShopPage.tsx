import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import type { Product, Category, Cart } from '@mik/contracts/shop'
import { Link } from 'react-router'
import useApi from '@mik/ui/hooks/useApi'
import { useSnackbar } from '@mik/ui/hooks/useSnackbar'
import { useLocalisedText } from '@mik/ui/utils/localisedText'
import { RemoteContent } from '@mik/ui/components/RemoteContent'

function formatPrice(price: number, vatPercent: number) {
  return `€${(price * (1 + vatPercent / 100)).toFixed(2)}`
}

export default function ShopPage() {
  const { t } = useTranslation()
  const { localise } = useLocalisedText()

  const { showSnackbar } = useSnackbar()
  const [categoryId, setCategoryId] = useState('')

  const { data: categories } = useApi<Category[]>({ url: 'v1/shop/categories' })
  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
  } = useApi<Product[]>({
    url: 'v1/shop/products',
    params: { categoryId: categoryId || undefined },
  })
  const { data: cart, mutation: cartMutation } = useApi<Cart>({
    url: 'v1/shop/cart',
  })

  const handleAddToCart = async (productId: string) => {
    const result = await cartMutation.trigger('POST', { productId, quantity: 1 }, 'items')
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      showSnackbar(t('shop.addedToCart'), { severity: 'success' })
    }
  }

  const cartItemCount = cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0

  const isMaxedOut = (product: Product): boolean => {
    if (product.maxOrderQuantity == null) return false
    const inCart = cart?.items.find((i) => i.productId === product.productId)?.quantity ?? 0
    return inCart >= product.maxOrderQuantity
  }

  return (
    <Box>
      <Title label={t('shop.title')} />
      {/* Filters + Cart Actions */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 3,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel>{t('shop.category')}</InputLabel>
          <Select
            value={categoryId}
            label={t('shop.category')}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            {categories?.map((c) => (
              <MenuItem key={c.categoryId} value={c.categoryId}>
                {localise(c.name)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Badge badgeContent={cartItemCount} color='primary' showZero={false}>
            <Button
              component={Link}
              to='/shop/cart'
              variant='outlined'
              startIcon={<Icon icon='mdi:cart-outline' />}
            >
              {t('shop.viewCart')}
            </Button>
          </Badge>
          {cartItemCount > 0 && (
            <Button
              component={Link}
              to='/shop/cart'
              variant='contained'
              color='primary'
              startIcon={<Icon icon='mdi:credit-card-check-outline' />}
            >
              {t('shop.checkout')}
            </Button>
          )}
        </Box>
      </Box>
      {/* Product grid */}
      <RemoteContent isLoading={productsLoading} error={productsError}>
        {!productsLoading && !products?.length ? (
          <Alert severity='info'>{t('shop.noProducts')}</Alert>
        ) : (
          <Grid container spacing={3}>
            {products?.map((product) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={product.productId}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Box sx={{ position: 'relative' }}>
                    {product.imageUrl ? (
                      <CardMedia
                        component='img'
                        height='180'
                        image={product.imageUrl}
                        alt={localise(product.name)}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: 180,
                          bgcolor: 'action.hover',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon
                          icon={
                            product.productType === 'FLIGHT_HOURS_PACKAGE'
                              ? 'mdi:clock-time-four'
                              : 'mdi:shopping'
                          }
                          width={48}
                        />
                      </Box>
                    )}

                    {product.stockQuantity <= 0 && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'rgba(0, 0, 0, 0.35)',
                        }}
                      >
                        <Typography
                          variant='h5'
                          sx={{
                            color: 'common.white',
                            fontWeight: 700,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                          }}
                        >
                          {t('shop.soldOut')}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography
                      variant='subtitle2'
                      gutterBottom
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {localise(categories?.find((c) => c.categoryId === product.categoryId)?.name)}
                    </Typography>

                    <Typography variant='h6' gutterBottom>
                      {localise(product.name)}
                    </Typography>

                    {product.description && (
                      <Typography
                        variant='body2'
                        sx={{
                          color: 'text.secondary',
                          mb: 1,
                        }}
                      >
                        {localise(product.description)}
                      </Typography>
                    )}

                    <Typography variant='h6' color='primary'>
                      {formatPrice(product.price, product.vatPercent)}
                    </Typography>

                    {product.stockQuantity <= 0 && (
                      <Chip
                        label={t('shop.outOfStock')}
                        size='small'
                        color='error'
                        sx={{ mt: 1 }}
                      />
                    )}
                    {product.stockQuantity > 0 &&
                      product.stockQuantity <= (product.lowStockThreshold ?? 5) && (
                        <Chip
                          label={t('shop.lowStock')}
                          size='small'
                          color='warning'
                          sx={{ mt: 1 }}
                        />
                      )}
                    {product.maxOrderQuantity && (
                      <Typography
                        variant='caption'
                        sx={{
                          display: 'block',
                          mt: 0.5,
                        }}
                      >
                        {t('shop.maxPerMemberQty', {
                          max: product.maxOrderQuantity,
                        })}
                      </Typography>
                    )}

                    {product.tags?.length > 0 && (
                      <Box
                        sx={{
                          mt: 1,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.5,
                        }}
                      >
                        {product.tags.map((tag) => (
                          <Chip key={tag} label={tag} size='small' variant='outlined' />
                        ))}
                      </Box>
                    )}
                  </CardContent>

                  <CardActions>
                    <Button
                      component={Link}
                      to={`/shop/products/${product.productId}`}
                      size='small'
                      variant='outlined'
                    >
                      {t('common.details')}
                    </Button>
                    <Button
                      size='small'
                      variant='contained'
                      disabled={
                        product.stockQuantity <= 0 || cartMutation.isMutating || isMaxedOut(product)
                      }
                      onClick={() => handleAddToCart(product.productId)}
                      startIcon={<Icon icon='mdi:cart-plus' />}
                    >
                      {t('shop.addToCart')}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </RemoteContent>
    </Box>
  )
}
