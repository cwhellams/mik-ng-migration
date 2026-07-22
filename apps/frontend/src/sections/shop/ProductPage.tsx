import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Snackbar,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Product, Cart, Category } from '@backend/routes/shop/models'
import type { MemberPackage, PrepaidPackage } from '@backend/routes/prepaid-hours/models'
import { useParams, Link } from 'react-router-dom'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'

function resolveLanguage(language: string): 'fi' | 'sv' | 'en' {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)

  const [quantity, setQuantity] = useState(1)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({})
  const [snack, setSnack] = useState<{
    msg: string
    sev: 'success' | 'error'
  } | null>(null)

  const {
    data: product,
    isLoading,
    error,
  } = useApi<Product>({
    url: id ? `v1/shop/products/${id}` : 'v1/shop/products/undefined',
    skipFetch: !id,
  })
  const { data: categories } = useApi<Category[]>({ url: 'v1/shop/categories' })
  const { data: cart, mutation: cartMutation } = useApi<Cart>({
    url: 'v1/shop/cart',
  })

  // Quantity of this product already sitting in the cart
  const inCart = cart?.items.find((i) => i.productId === id)?.quantity ?? 0

  // For flight hour packages, fetch the member's existing owned packages to enforce per-member limit
  const isFlightPackage = product?.productType === 'FLIGHT_HOURS_PACKAGE'
  const { data: memberPackages } = useApi<MemberPackage[]>({
    url: 'v1/prepaid-hours/member-packages',
    skipFetch: !isFlightPackage || !id,
  })
  const { data: prepaidPackages } = useApi<PrepaidPackage[]>({
    url: 'v1/prepaid-hours/packages',
    skipFetch: !isFlightPackage || !id,
  })
  const selectedFlightPackage = isFlightPackage
    ? (prepaidPackages ?? []).find((pkg) => pkg.productId === id)
    : undefined
  const alreadyOwned = isFlightPackage
    ? (memberPackages?.filter((mp) => mp.productId === id).length ?? 0)
    : 0
  // Subtract both cart qty and already owned packages from the member limit.
  const maxAllowed =
    product?.maxOrderQuantity == null
      ? null
      : Math.max(0, product.maxOrderQuantity - alreadyOwned - inCart)

  const localName = (obj?: Record<string, string> | null) => obj?.[lang] ?? obj?.['en'] ?? ''

  const selectedOptionStockCaps = (product?.properties ?? [])
    .flatMap((property) =>
      Object.entries(selectedOptions)
        .filter(([propertyId]) => Number(propertyId) === property.propertyId)
        .map(
          ([, optionId]) =>
            property.options?.find((option) => option.optionId === optionId)?.stockQuantity ?? null,
        ),
    )
    .filter((qty): qty is number => qty != null)
  const selectedOptionStockCap = selectedOptionStockCaps.length
    ? Math.min(...selectedOptionStockCaps)
    : null

  const category = categories?.find((c) => c.categoryId === product?.categoryId)

  const handleAddToCart = async () => {
    const result = await cartMutation.trigger(
      'POST',
      { productId: id!, quantity, selectedOptions },
      'items',
    )
    if (result.error) {
      setSnack({ msg: t('common.error'), sev: 'error' })
    } else {
      setSnack({ msg: t('shop.addedToCart'), sev: 'success' })
    }
  }

  const effectiveMax = maxAllowed ?? product?.maxOrderQuantity ?? null
  const effectiveProductStock = product?.stockQuantity ?? 0
  const quantityCapCandidates = [
    effectiveMax,
    effectiveProductStock,
    selectedOptionStockCap,
  ].filter((value): value is number => value != null)
  const quantityCap = quantityCapCandidates.length
    ? Math.max(0, Math.min(...quantityCapCandidates))
    : 10

  const canAdd =
    product &&
    product.stockQuantity > 0 &&
    quantityCap > 0 &&
    quantity <= quantityCap &&
    (product.properties?.filter((p) => p.isRequired) ?? []).every(
      (p) => selectedOptions[p.propertyId] !== undefined,
    )

  return (
    <Box>
      <Button component={Link} to='/shop' startIcon={<Icon icon='mdi:arrow-left' />} sx={{ mb: 2 }}>
        {t('shop.backToShop')}
      </Button>
      <RemoteContent isLoading={isLoading} error={error}>
        {!isLoading && !error && !product && <Alert severity='error'>{t('common.notFound')}</Alert>}
        {product && (
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {/* Product image */}
            <Box sx={{ width: { xs: '100%', md: 350 }, flexShrink: 0 }}>
              <Box sx={{ position: 'relative' }}>
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={localName(product.name as Record<string, string>)}
                    style={{ width: '100%', borderRadius: 8 }}
                  />
                ) : (
                  <Paper
                    variant='outlined'
                    sx={{
                      width: '100%',
                      height: 300,
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
                      width={80}
                    />
                  </Paper>
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
                      borderRadius: product.imageUrl ? 2 : 1,
                    }}
                  >
                    <Typography
                      variant='h4'
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
            </Box>

            {/* Product details */}
            <Box sx={{ flexGrow: 1, minWidth: 280 }}>
              {category && (
                <Typography
                  variant='subtitle2'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {localName(category.name as Record<string, string>)}
                </Typography>
              )}

              <Typography variant='h4' gutterBottom>
                {localName(product.name as Record<string, string>)}
              </Typography>

              <Typography variant='h5' color='primary' sx={{ mb: 2 }}>
                €{(product.price * (1 + product.vatPercent / 100)).toFixed(2)}
                <Typography
                  component='span'
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                    ml: 1,
                  }}
                >
                  ({t('shop.vatIncluded', { pct: product.vatPercent })})
                </Typography>
              </Typography>

              {product.description && (
                <Typography variant='body1' sx={{ mb: 2 }}>
                  {localName(product.description as Record<string, string>)}
                </Typography>
              )}

              {product.productType === 'FLIGHT_HOURS_PACKAGE' && selectedFlightPackage && (
                <Typography variant='body1' sx={{ mb: 2 }}>
                  Includes {selectedFlightPackage.minutesPerPackage} flight minutes at €
                  {selectedFlightPackage.perMinRate}/min.
                </Typography>
              )}

              {product.productType === 'FLIGHT_HOURS_PACKAGE' && (
                <Alert severity='info' sx={{ mb: 2 }}>
                  {t('shop.flightHoursPackageInfo')}
                </Alert>
              )}

              {product.productType === 'FLIGHT_HOURS_PACKAGE' &&
                selectedFlightPackage?.expiresAt && (
                  <Typography
                    variant='h6'
                    sx={{
                      color: 'text.secondary',
                      mb: 2,
                      fontWeight: 600,
                    }}
                  >
                    {t('shop.admin.expiresAt')}:{' '}
                    {new Date(selectedFlightPackage.expiresAt).toLocaleDateString()}
                  </Typography>
                )}

              {product.stockQuantity <= 0 ? (
                <Chip label={t('shop.outOfStock')} color='error' sx={{ mb: 2 }} />
              ) : (
                (() => {
                  if (product.stockQuantity <= (product.lowStockThreshold ?? 5)) {
                    return (
                      <Chip
                        label={t('shop.lowStockLeft', {
                          qty: product.stockQuantity,
                        })}
                        color='warning'
                        sx={{ mb: 2 }}
                      />
                    )
                  }
                  return null
                })()
              )}

              {/* Product properties */}
              {product.properties?.map((prop) => (
                <Box key={prop.propertyId} sx={{ mb: 2 }}>
                  <Typography variant='subtitle2' sx={{ mb: 0.5 }}>
                    {localName(prop.name as Record<string, string>)}
                    {prop.isRequired && <span style={{ color: 'red' }}> *</span>}
                  </Typography>
                  <RadioGroup
                    row
                    value={selectedOptions[prop.propertyId] ?? ''}
                    onChange={(e) =>
                      setSelectedOptions((prev) => ({
                        ...prev,
                        [prop.propertyId]: Number(e.target.value),
                      }))
                    }
                  >
                    {prop.options
                      ?.filter((o) => o.isActive)
                      .map((opt) => (
                        <FormControlLabel
                          key={opt.optionId}
                          value={opt.optionId}
                          control={<Radio size='small' />}
                          label={
                            opt.stockQuantity == null
                              ? localName(opt.value as Record<string, string>)
                              : `${localName(opt.value as Record<string, string>)} (${opt.stockQuantity})`
                          }
                          disabled={opt.stockQuantity != null && opt.stockQuantity <= 0}
                        />
                      ))}
                  </RadioGroup>
                </Box>
              ))}

              {/* Per-member ownership info for flight packages */}
              {isFlightPackage && alreadyOwned > 0 && (
                <Chip
                  icon={<Icon icon='mdi:clock-check' />}
                  label={t('shop.alreadyOwned', { count: alreadyOwned })}
                  color='info'
                  variant='outlined'
                  sx={{ mb: 2 }}
                />
              )}
              {isFlightPackage && effectiveMax != null && effectiveMax <= 0 && (
                <Alert severity='warning' sx={{ mb: 2 }}>
                  {t('shop.maxPerMemberReached', {
                    max: product.maxOrderQuantity,
                  })}
                </Alert>
              )}

              {/* Quantity */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <FormControl
                  size='small'
                  sx={{ width: 100 }}
                  disabled={effectiveMax != null && effectiveMax <= 0}
                >
                  <InputLabel>{t('shop.quantity')}</InputLabel>
                  <Select
                    value={quantity}
                    label={t('shop.quantity')}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  >
                    {Array.from({ length: Math.min(quantityCap, 10) }).map((_, i) => (
                      <MenuItem key={i + 1} value={i + 1}>
                        {i + 1}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {effectiveMax != null && effectiveMax > 0 && (
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {isFlightPackage && alreadyOwned > 0
                      ? t('shop.maxRemainingQty', { max: effectiveMax })
                      : t('shop.maxPerMemberQty', { max: effectiveMax })}
                  </Typography>
                )}
              </Box>

              <Button
                variant='contained'
                size='large'
                disabled={!canAdd || cartMutation.isMutating}
                onClick={handleAddToCart}
                startIcon={<Icon icon='mdi:cart-plus' />}
              >
                {t('shop.addToCart')}
              </Button>

              <Divider sx={{ my: 3 }} />

              {/* Tags */}
              {product.tags?.length > 0 && (
                <Box>
                  <Typography variant='subtitle2' gutterBottom>
                    {t('shop.tags')}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {product.tags.map((tag) => (
                      <Chip key={tag} label={tag} size='small' variant='outlined' />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
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
