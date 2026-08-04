import {
  Alert,
  Box,
  Card,
  CardContent,
  CardMedia,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import type {
  InventoryItem,
  InventoryCategory,
  InventoryLocation,
} from '@backend/routes/inventory/models'
import { resolveLanguage, localName, conditionColor } from './localized'

export default function InventoryPage() {
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)
  // Sudo-gated: admin-only cues (low-stock highlight) stay hidden until the
  // admin explicitly enters admin mode, consistent with the rest of the app.
  const { isInventoryAdmin: isAdmin } = useRoles()

  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [itemType, setItemType] = useState('')
  const [search, setSearch] = useState('')

  const { data: categories } = useApi<InventoryCategory[]>({ url: 'v1/inventory/categories' })
  const { data: locations } = useApi<InventoryLocation[]>({ url: 'v1/inventory/locations' })
  const {
    data: items,
    isLoading,
    error,
  } = useApi<InventoryItem[]>({
    url: 'v1/inventory/items',
    params: {
      categoryId: categoryId || undefined,
      locationId: locationId || undefined,
      itemType: itemType || undefined,
      search: search || undefined,
    },
  })

  return (
    <Box>
      <Title label={t('inventory.title')} />
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          label={t('common.search')}
          size='small'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 200 }}
          slotProps={{
            input: { startAdornment: <Icon icon='mdi:magnify' style={{ marginRight: 4 }} /> },
          }}
        />
        <FormControl size='small' sx={{ minWidth: 160 }}>
          <InputLabel>{t('inventory.category')}</InputLabel>
          <Select
            value={categoryId}
            label={t('inventory.category')}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            {categories?.map((c) => (
              <MenuItem key={c.categoryId} value={c.categoryId}>
                {localName(c.name as Record<string, string>, lang)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size='small' sx={{ minWidth: 160 }}>
          <InputLabel>{t('inventory.location')}</InputLabel>
          <Select
            value={locationId}
            label={t('inventory.location')}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            {locations?.map((l) => (
              <MenuItem key={l.locationId} value={l.locationId}>
                {localName(l.name as Record<string, string>, lang)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size='small' sx={{ minWidth: 160 }}>
          <InputLabel>{t('inventory.itemType')}</InputLabel>
          <Select
            value={itemType}
            label={t('inventory.itemType')}
            onChange={(e) => setItemType(e.target.value)}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            <MenuItem value='ASSET'>{t('inventory.asset')}</MenuItem>
            <MenuItem value='CONSUMABLE'>{t('inventory.consumable')}</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <RemoteContent isLoading={isLoading} error={error}>
        {items?.length === 0 ? (
          <Alert severity='info'>{t('inventory.noItems')}</Alert>
        ) : (
          <Grid container spacing={2}>
            {items?.map((item) => {
              const name = localName(item.name as Record<string, string>, lang)
              const categoryName = item.category
                ? localName(item.category.name as Record<string, string>, lang)
                : ''
              const locationName = item.location
                ? localName(item.location.name as Record<string, string>, lang)
                : ''
              const isLowStock =
                isAdmin &&
                item.itemType === 'CONSUMABLE' &&
                item.lowStockThreshold != null &&
                item.quantity <= item.lowStockThreshold

              return (
                <Grid key={item.itemId} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Card
                    component={Link}
                    to={`/inventory/${item.itemId}`}
                    sx={{
                      textDecoration: 'none',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {item.imageUrl && (
                      <CardMedia
                        component='img'
                        height='160'
                        image={item.imageUrl}
                        alt={name}
                        sx={{ objectFit: 'cover' }}
                      />
                    )}
                    {!item.imageUrl && (
                      <Box
                        sx={{
                          height: 80,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'action.hover',
                        }}
                      >
                        <Icon
                          icon={
                            item.itemType === 'ASSET'
                              ? 'mdi:package-variant'
                              : 'mdi:package-variant-closed'
                          }
                          width={40}
                          style={{ opacity: 0.4 }}
                        />
                      </Box>
                    )}
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography
                        variant='subtitle1'
                        gutterBottom
                        noWrap
                        sx={{
                          fontWeight: 'bold',
                        }}
                      >
                        {name}
                      </Typography>
                      {categoryName && (
                        <Typography
                          variant='caption'
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                          }}
                        >
                          {categoryName}
                        </Typography>
                      )}
                      {locationName && (
                        <Typography
                          variant='caption'
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                          }}
                        >
                          <Icon icon='mdi:map-marker' width={12} style={{ marginRight: 2 }} />
                          {locationName}
                        </Typography>
                      )}
                      <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {item.itemType === 'CONSUMABLE' ? (
                          <>
                            <Chip
                              label={`${t('inventory.qty')}: ${item.quantity}`}
                              size='small'
                              color={isLowStock ? 'warning' : 'default'}
                            />
                            {isLowStock && (
                              <Chip
                                label={t('inventory.lowStock')}
                                size='small'
                                color='warning'
                                icon={<Icon icon='mdi:alert' />}
                              />
                            )}
                          </>
                        ) : (
                          <Chip
                            label={t(`inventory.condition.${item.condition}`)}
                            size='small'
                            color={conditionColor(item.condition)}
                          />
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        )}
      </RemoteContent>
    </Box>
  )
}
