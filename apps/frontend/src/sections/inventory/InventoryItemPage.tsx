import { Box, Chip, Divider, Paper, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import type { InventoryItem } from '@mik/contracts/inventory'
import { resolveLanguage, localName, conditionColor } from './localized'

export default function InventoryItemPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)
  // Sudo-gated: the audit log and low-stock cue are admin-only and only shown
  // once the admin has entered admin mode, consistent with the rest of the app.

  // The endpoint also returns `auditLog`; this page no longer reads it — the
  // trail is shown in the admin app instead (#1233).
  const { data, isLoading, error } = useApi<{ item: InventoryItem }>({
    url: `v1/inventory/items/${id}`,
  })

  const item = data?.item

  const name = item ? localName(item.name as Record<string, string>, lang) : ''
  const description = item
    ? localName(item.description as Record<string, string> | undefined, lang)
    : ''
  const categoryName = item?.category
    ? localName(item.category.name as Record<string, string>, lang)
    : ''
  const locationName = item?.location
    ? localName(item.location.name as Record<string, string>, lang)
    : ''

  return (
    <Box>
      <RemoteContent isLoading={isLoading} error={error}>
        {item && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography
                component={Link}
                to='/inventory'
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {t('inventory.title')}
              </Typography>
              <Icon icon='mdi:chevron-right' width={16} />
              <Typography
                variant='body2'
                sx={{
                  color: 'text.primary',
                }}
              >
                {name}
              </Typography>
            </Box>

            <Typography variant='h4' gutterBottom>
              {name}
            </Typography>

            {description && (
              <Typography
                variant='body1'
                gutterBottom
                sx={{
                  color: 'text.secondary',
                }}
              >
                {description}
              </Typography>
            )}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
              <Chip label={t(`inventory.type.${item.itemType}`)} size='small' variant='outlined' />
              {item.itemType === 'CONSUMABLE' ? (
                <Chip
                  label={`${t('inventory.qty')}: ${item.quantity}`}
                  size='small'
                  color={
                    // See InventoryPage: the low-stock warning moved to the
                    // admin app with the rest of the restocking workflow.
                    'default'
                  }
                />
              ) : (
                <Chip
                  label={t(`inventory.condition.${item.condition}`)}
                  size='small'
                  color={conditionColor(item.condition)}
                />
              )}
              {!item.isActive && <Chip label={t('common.inactive')} size='small' color='default' />}
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Box
              component={Paper}
              variant='outlined'
              sx={{ p: 2, mb: 3, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}
            >
              {categoryName && (
                <>
                  <Typography
                    variant='body2'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('inventory.category')}
                  </Typography>
                  <Typography variant='body2'>{categoryName}</Typography>
                </>
              )}
              {locationName && (
                <>
                  <Typography
                    variant='body2'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('inventory.location')}
                  </Typography>
                  <Typography variant='body2'>{locationName}</Typography>
                </>
              )}
              {item.serialNumber && (
                <>
                  <Typography
                    variant='body2'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('inventory.serialNumber')}
                  </Typography>
                  <Typography variant='body2'>{item.serialNumber}</Typography>
                </>
              )}
              {item.notes && (
                <>
                  <Typography
                    variant='body2'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('inventory.notes')}
                  </Typography>
                  <Typography variant='body2'>{item.notes}</Typography>
                </>
              )}
              {item.tags.length > 0 && (
                <>
                  <Typography
                    variant='body2'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('inventory.tags')}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {item.tags.map((tag) => (
                      <Chip key={tag} label={tag} size='small' />
                    ))}
                  </Box>
                </>
              )}
            </Box>
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
