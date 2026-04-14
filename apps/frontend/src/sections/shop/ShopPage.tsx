import {
  Alert,
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
  Snackbar,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '../../components/Title'
import type { Product, Category, Cart } from '@backend/routes/shop/models'
import { Link } from 'react-router-dom'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'

function formatPrice(price: number, vatPercent: number) {
  return `€${(price * (1 + vatPercent / 100)).toFixed(2)}`
}

function resolveLanguage(language: string): 'fi' | 'sv' | 'en' {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

export default function ShopPage() {
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)

  const [categoryId, setCategoryId] = useState('')
  const [snack, setSnack] = useState<{
    msg: string
    sev: 'success' | 'error'
  } | null>(null)

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
    const result = await cartMutation.trigger(
      'POST',
      { productId, quantity: 1 },
      'items'
    )
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      setSnack({ msg: t('shop.addedToCart'), sev: 'success' })
    }
  }

  const isMaxedOut = (product: Product): boolean => {
    if (product.maxOrderQuantity == null) return false
    const inCart =
      cart?.items.find((i) => i.productId === product.productId)?.quantity ?? 0
    return inCart >= product.maxOrderQuantity
  }

  const localName = (obj: Record<string, string>) =>
    obj?.[lang] ?? obj?.['en'] ?? ''

  return (
    <Box>
      <Title label={t('shop.title')} />

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
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
                {localName(c.name as Record<string, string>)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
                        alt={localName(product.name as Record<string, string>)}
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

                    {product.stockQuantity === 0 && (
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
                      color='text.secondary'
                      gutterBottom
                    >
                      {categories?.find(
                        (c) => c.categoryId === product.categoryId
                      )
                        ? localName(
                            categories.find(
                              (c) => c.categoryId === product.categoryId
                            )!.name as Record<string, string>
                          )
                        : ''}
                    </Typography>

                    <Typography variant='h6' gutterBottom>
                      {localName(product.name as Record<string, string>)}
                    </Typography>

                    {product.description && (
                      <Typography
                        variant='body2'
                        color='text.secondary'
                        sx={{ mb: 1 }}
                      >
                        {localName(
                          product.description as Record<string, string>
                        )}
                      </Typography>
                    )}

                    <Typography variant='h6' color='primary'>
                      {formatPrice(product.price, product.vatPercent)}
                    </Typography>

                    {product.stockQuantity === 0 && (
                      <Chip
                        label={t('shop.outOfStock')}
                        size='small'
                        color='error'
                        sx={{ mt: 1 }}
                      />
                    )}
                    {product.stockQuantity > 0 &&
                      product.stockQuantity <=
                        (product.lowStockThreshold ?? 5) && (
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
                        display='block'
                        sx={{ mt: 0.5 }}
                      >
                        {t('shop.maxOrderQty', {
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
                          <Chip
                            key={tag}
                            label={tag}
                            size='small'
                            variant='outlined'
                          />
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
                        product.stockQuantity === 0 ||
                        cartMutation.isMutating ||
                        isMaxedOut(product)
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

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snack?.sev ?? 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}
