import React from 'react'
import { Box, Typography, Button, useTheme, Tooltip } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { ItemListResponse } from '@backend/routes/invoicing/models'
import useApi from '../../hooks/useApi'
import { eurFormatter } from '../../utils/format'
import { RemoteContent } from '../../components/RemoteContent'
import { t } from 'i18next'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import Grid from '@mui/system/Grid'

export const InvoiceItemsPage: React.FC = () => {
  const theme = useTheme()

  const { data, isLoading, error, mutate, mutation } = useApi<ItemListResponse>(
    { url: 'v1/invoices/items' },
    { keepPreviousData: true },
  )

  const handleRefresh = async () => {
    const res = await mutation.trigger('PATCH', {}, 'refresh')
    if (res.data) mutate()
  }

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
            <Grid size={{ xs: 3, md: 1 }}>{t('invoiceItems.id')}</Grid>
            <Grid size={{ xs: 9, md: 3 }}>{t('invoiceItems.code')}</Grid>
            <Grid size={{ xs: 12, md: 4 }}>{t('invoiceItems.name')}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{t('invoiceItems.markup')}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{t('invoiceItems.type')}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{t('invoiceItems.unit')}</Grid>
          </>
        }
        rows={data?.items}
        row={(item) => (
          <>
            <Grid size={{ xs: 3, md: 1 }}>{item.id}</Grid>
            <Grid size={{ xs: 9, md: 3 }}>{item.code}</Grid>
            <Grid
              size={{ xs: 12, md: 4 }}
              sx={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}
            >
              {item.name}
            </Grid>
            <Grid size={{ xs: 4, md: 1 }}>{eurFormatter.format(item.markup_value ?? 0)}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{item.markup_type ?? 'N/A'}</Grid>
            <Grid size={{ xs: 4, md: 1 }}>{item.unit ?? 'N/A'}</Grid>
          </>
        )}
      />
    </RemoteContent>
  )
}
