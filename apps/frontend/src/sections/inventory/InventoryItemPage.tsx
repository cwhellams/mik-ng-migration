import {
  Alert,
  Box,
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
import { useParams, Link } from 'react-router-dom'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import type { InventoryItem, InventoryAuditLogEntry } from '@backend/routes/inventory/models'
import { resolveLanguage, localName, conditionColor } from './localized'

export default function InventoryItemPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)
  // Sudo-gated: the audit log and low-stock cue are admin-only and only shown
  // once the admin has entered admin mode, consistent with the rest of the app.
  const { isInventoryAdmin: isAdmin } = useRoles()

  const { data, isLoading, error } = useApi<{
    item: InventoryItem
    auditLog?: InventoryAuditLogEntry[]
  }>({ url: `v1/inventory/items/${id}` })

  const item = data?.item
  const auditLog = data?.auditLog

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
                color='text.secondary'
                sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                {t('inventory.title')}
              </Typography>
              <Icon icon='mdi:chevron-right' width={16} />
              <Typography variant='body2' color='text.primary'>
                {name}
              </Typography>
            </Box>

            <Typography variant='h4' gutterBottom>
              {name}
            </Typography>

            {description && (
              <Typography variant='body1' color='text.secondary' gutterBottom>
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
                    isAdmin &&
                    item.lowStockThreshold != null &&
                    item.quantity <= item.lowStockThreshold
                      ? 'warning'
                      : 'default'
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
                  <Typography variant='body2' color='text.secondary'>
                    {t('inventory.category')}
                  </Typography>
                  <Typography variant='body2'>{categoryName}</Typography>
                </>
              )}
              {locationName && (
                <>
                  <Typography variant='body2' color='text.secondary'>
                    {t('inventory.location')}
                  </Typography>
                  <Typography variant='body2'>{locationName}</Typography>
                </>
              )}
              {item.serialNumber && (
                <>
                  <Typography variant='body2' color='text.secondary'>
                    {t('inventory.serialNumber')}
                  </Typography>
                  <Typography variant='body2'>{item.serialNumber}</Typography>
                </>
              )}
              {item.notes && (
                <>
                  <Typography variant='body2' color='text.secondary'>
                    {t('inventory.notes')}
                  </Typography>
                  <Typography variant='body2'>{item.notes}</Typography>
                </>
              )}
              {item.tags.length > 0 && (
                <>
                  <Typography variant='body2' color='text.secondary'>
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

            {isAdmin && auditLog && auditLog.length > 0 && (
              <>
                <Typography variant='h6' gutterBottom>
                  {t('inventory.auditLog')}
                </Typography>
                <TableContainer component={Paper} variant='outlined'>
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('common.date')}</TableCell>
                        <TableCell>{t('inventory.changeType')}</TableCell>
                        <TableCell>{t('inventory.changedBy')}</TableCell>
                        <TableCell>{t('inventory.notes')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {auditLog.map((entry) => (
                        <TableRow key={entry.logId}>
                          <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Chip
                              label={t(`inventory.changeTypes.${entry.changeType}`, {
                                defaultValue: entry.changeType,
                              })}
                              size='small'
                            />
                          </TableCell>
                          <TableCell>{entry.memberId}</TableCell>
                          <TableCell>
                            {entry.newValue &&
                            typeof entry.newValue === 'object' &&
                            'notes' in entry.newValue
                              ? String(entry.newValue.notes ?? '')
                              : (entry.notes ?? '')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {isAdmin && auditLog?.length === 0 && (
              <Alert severity='info'>{t('inventory.noAuditLog')}</Alert>
            )}
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
