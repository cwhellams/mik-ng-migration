import React, { useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  useTheme,
  Tooltip,
  TableSortLabel,
  Switch,
  FormControlLabel,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import type { Item, ItemListResponse } from '@mik/contracts/invoicing'
import useApi from '@mik/ui/hooks/useApi'
import { eurFormatter } from '@mik/ui/utils/format'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { t } from 'i18next'
import { Title } from '@mik/ui/components/Title'
import { ResponsiveTable } from '@mik/ui/components/ResponsiveTable'
import Grid from '@mui/system/Grid'

type SortKey =
  | 'id'
  | 'code'
  | 'name'
  | 'markup_value'
  | 'markup_type'
  | 'unit'
  | 'expense_claim_item'
  | 'is_fuel_item'
  | 'is_km_item'
  | 'is_other_item'
type SortDir = 'asc' | 'desc'

function sortItems(items: Item[], key: SortKey, dir: SortDir): Item[] {
  return [...items].sort((a, b) => {
    const av = a[key] ?? ''
    const bv = b[key] ?? ''
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
    return dir === 'asc' ? cmp : -cmp
  })
}

export const InvoiceItemsPage: React.FC = () => {
  const theme = useTheme()
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const { data, isLoading, error, mutate, mutation } = useApi<ItemListResponse>(
    { url: 'v1/invoices/items' },
    { keepPreviousData: true },
  )

  const handleRefresh = async () => {
    const res = await mutation.trigger('PATCH', {}, 'refresh')
    if (res.data) mutate()
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleExpenseClaimItemToggle = async (itemId: number, checked: boolean) => {
    const res = await mutation.trigger(
      'PATCH',
      { expenseClaimItem: checked },
      `${itemId}/expense-claim-item`,
    )
    if (res.data) mutate()
  }

  const handleIsFuelItemToggle = async (itemId: number, checked: boolean) => {
    const res = await mutation.trigger('PATCH', { isFuelItem: checked }, `${itemId}/is-fuel-item`)
    if (res.data) mutate()
  }

  const handleIsKmItemToggle = async (itemId: number, checked: boolean) => {
    const res = await mutation.trigger('PATCH', { isKmItem: checked }, `${itemId}/is-km-item`)
    if (res.data) mutate()
  }

  const handleIsOtherItemToggle = async (itemId: number, checked: boolean) => {
    const res = await mutation.trigger('PATCH', { isOtherItem: checked }, `${itemId}/is-other-item`)
    if (res.data) mutate()
  }

  const sortedItems = useMemo(
    () => (data?.items ? sortItems(data.items, sortKey, sortDir) : undefined),
    [data?.items, sortKey, sortDir],
  )

  const col = (key: SortKey, label: string) => (
    <TableSortLabel
      active={sortKey === key}
      direction={sortKey === key ? sortDir : 'asc'}
      onClick={() => handleSort(key)}
      sx={{
        fontWeight: 'inherit',
        fontSize: 'inherit',
        whiteSpace: 'normal',
        textAlign: 'inherit',
      }}
    >
      {label}
    </TableSortLabel>
  )

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      {/* Info Box */}
      <Box
        sx={{
          mb: 2,
          p: 2,
          borderRadius: 2,
          backgroundColor: theme.palette.info.light,
          color: theme.palette.info.contrastText,
        }}
      >
        <Typography variant='body1'>{t('invoiceItems.infoText')}</Typography>
      </Box>

      <Title label={t('invoiceItems.title')}>
        <Tooltip title={t('invoiceItems.reloadFromSimplbooksTooltip')}>
          <span>
            {' '}
            {/* Needed to avoid Tooltip warning when button is disabled */}
            <Button
              variant='outlined'
              loading={mutation.isMutating}
              loadingPosition='start'
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
            >
              {t('invoiceItems.reloadFromSimplbooks')}
            </Button>
          </span>
        </Tooltip>
      </Title>

      <ResponsiveTable
        notFoundMsg={t('invoiceItems.noItemsFound')}
        header={
          <>
            <Grid size={{ xs: 3, md: 1 }}>{col('id', t('invoiceItems.id'))}</Grid>
            <Grid size={{ xs: 9, md: 2 }}>{col('code', t('invoiceItems.code'))}</Grid>
            <Grid size={{ xs: 12, md: 2 }}>{col('name', t('invoiceItems.name'))}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{col('markup_value', t('invoiceItems.markup'))}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{col('markup_type', t('invoiceItems.type'))}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{col('unit', t('invoiceItems.unit'))}</Grid>
            <Grid size={{ xs: 12, md: 1 }} sx={{ textAlign: 'right' }}>
              {col('expense_claim_item', t('invoiceItems.expenseClaimItem'))}
            </Grid>
            <Grid size={{ xs: 4, md: 1 }} sx={{ textAlign: 'right' }}>
              {col('is_fuel_item', t('invoiceItems.isFuelItem'))}
            </Grid>
            <Grid size={{ xs: 4, md: 1 }} sx={{ textAlign: 'right' }}>
              {col('is_km_item', t('invoiceItems.isKmItem'))}
            </Grid>
            <Grid size={{ xs: 4, md: 1 }} sx={{ textAlign: 'right' }}>
              {col('is_other_item', t('invoiceItems.isOtherItem'))}
            </Grid>
          </>
        }
        rows={sortedItems}
        row={(item) => (
          <>
            <Grid size={{ xs: 3, md: 1 }}>{item.id}</Grid>
            <Grid size={{ xs: 9, md: 2 }}>{item.code}</Grid>
            <Grid
              size={{ xs: 12, md: 2 }}
              sx={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}
            >
              {item.name}
            </Grid>
            <Grid size={{ xs: 4, md: 1 }}>{eurFormatter.format(item.markup_value ?? 0)}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{item.markup_type ?? 'N/A'}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{item.unit ?? 'N/A'}</Grid>
            <Grid size={{ xs: 12, md: 1 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <FormControlLabel
                sx={{ ml: 0, mr: 0 }}
                labelPlacement='start'
                control={
                  <Switch
                    checked={Boolean(item.expense_claim_item)}
                    onChange={(e) =>
                      void handleExpenseClaimItemToggle(item.id, e.currentTarget.checked)
                    }
                  />
                }
                label=''
              />
            </Grid>
            <Grid size={{ xs: 4, md: 1 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <FormControlLabel
                sx={{ ml: 0, mr: 0 }}
                labelPlacement='start'
                control={
                  <Switch
                    checked={Boolean(item.is_fuel_item)}
                    onChange={(e) => void handleIsFuelItemToggle(item.id, e.currentTarget.checked)}
                  />
                }
                label=''
              />
            </Grid>
            <Grid size={{ xs: 4, md: 1 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <FormControlLabel
                sx={{ ml: 0, mr: 0 }}
                labelPlacement='start'
                control={
                  <Switch
                    checked={Boolean(item.is_km_item)}
                    onChange={(e) => void handleIsKmItemToggle(item.id, e.currentTarget.checked)}
                  />
                }
                label=''
              />
            </Grid>
            <Grid size={{ xs: 4, md: 1 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <FormControlLabel
                sx={{ ml: 0, mr: 0 }}
                labelPlacement='start'
                control={
                  <Switch
                    checked={Boolean(item.is_other_item)}
                    onChange={(e) => void handleIsOtherItemToggle(item.id, e.currentTarget.checked)}
                  />
                }
                label=''
              />
            </Grid>
          </>
        )}
      />
    </RemoteContent>
  )
}
