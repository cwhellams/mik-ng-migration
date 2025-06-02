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
  CircularProgress,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { ItemListResponse } from '@backend/routes/invoicing/models'
import useApi from '../../hooks/useApi'
import { eurFormatter } from '../../utils/format'

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
    <Box
      sx={{
        p: 3,
        maxWidth: 1000,

        justifyContent: 'left',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant={isXs ? 'h6' : 'h4'} fontWeight='bold'>
          Invoice Items
        </Typography>

        <Button
          variant='outlined'
          startIcon={
            refreshMutation.isMutating ? (
              <CircularProgress size={16} color='inherit' />
            ) : (
              <RefreshIcon />
            )
          }
          onClick={handleRefresh}
          disabled={refreshMutation.isMutating}
        >
          Refresh
        </Button>
      </Box>

      {isLoading ? (
        <Box display='flex' justifyContent='center' my={3}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color='error' align='center'>
          Failed to load items.
        </Typography>
      ) : data && data.items.length === 0 ? (
        <Typography align='center'>No items found.</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table size={isXs ? 'small' : 'medium'}>
            <TableHead sx={{ backgroundColor: theme.palette.grey[200] }}>
              <TableRow>
                <TableCell>
                  <strong>ID</strong>
                </TableCell>
                <TableCell>
                  <strong>Code</strong>
                </TableCell>
                <TableCell>
                  <strong>Name</strong>
                </TableCell>
                <TableCell align='right'>
                  <strong>Markup</strong>
                </TableCell>
                <TableCell align='center'>
                  <strong>Type</strong>
                </TableCell>
                <TableCell align='center'>
                  <strong>Unit</strong>
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
  )
}
