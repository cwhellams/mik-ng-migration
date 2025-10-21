import React from 'react'
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  Button,
  useMediaQuery,
  useTheme,
  Tooltip,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { ItemListResponse } from '@backend/routes/invoicing/models'
import useApi from '../../hooks/useApi'
import { eurFormatter } from '../../utils/format'
import { RemoteContent } from '../../components/RemoteContent'
import { t } from 'i18next'

export const InvoiceItemsPage: React.FC = () => {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const { data, isLoading, error, mutate } = useApi<ItemListResponse>(
    { url: 'v1/invoices/items' },
    { keepPreviousData: true }
  )
  const { mutation: refreshMutation } = useApi<ItemListResponse>({
    url: 'v1/invoices/items/refresh',
    skipFetch: true,
  })

  const handleRefresh = async () => {
    const res = await refreshMutation.trigger('PATCH', {})
    if (res.data) mutate()
  }

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Box
        sx={{
          p: 3,
          maxWidth: 1000,
          justifyContent: 'left',
        }}
      >
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
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 3,
          }}
        >
          <Typography variant={isXs ? 'h6' : 'h4'} fontWeight='bold'>
            {t('invoiceItems.title')}
          </Typography>

          <Tooltip title={t('invoiceItems.reloadFromSimplbooksTooltip')}>
            <span>
              {' '}
              {/* Needed to avoid Tooltip warning when button is disabled */}
              <Button
                variant='outlined'
                loading={refreshMutation.isMutating}
                loadingPosition='start'
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
              >
                {t('invoiceItems.reloadFromSimplbooks')}
              </Button>
            </span>
          </Tooltip>
        </Box>

        {data && data.items.length === 0 ? (
          <Typography align='center'>
            {t('invoiceItems.noItemsFound')}
          </Typography>
        ) : (
          <TableContainer
            component={Paper}
            sx={{
              maxHeight: 500, // or any height that makes sense for your layout
              overflowY: 'auto',
            }}
          >
            <Table size={isXs ? 'small' : 'medium'}>
              <TableHead sx={{ backgroundColor: theme.palette.grey[200] }}>
                <TableRow>
                  <TableCell>
                    <strong>{t('invoiceItems.id')}</strong>
                  </TableCell>
                  <TableCell>
                    <strong>{t('invoiceItems.code')}</strong>
                  </TableCell>
                  <TableCell>
                    <strong>{t('invoiceItems.name')}</strong>
                  </TableCell>
                  <TableCell align='right'>
                    <strong>{t('invoiceItems.markup')}</strong>
                  </TableCell>
                  <TableCell align='center'>
                    <strong>{t('invoiceItems.type')}</strong>
                  </TableCell>
                  <TableCell align='center'>
                    <strong>{t('invoiceItems.unit')}</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.items ?? []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell align='right'>
                      {eurFormatter.format(item.markup_value ?? 0)}
                    </TableCell>
                    <TableCell align='center'>
                      {item.markup_type ?? 'N/A'}
                    </TableCell>
                    <TableCell align='center'>{item.unit ?? 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </RemoteContent>
  )
}
