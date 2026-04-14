import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '../../components/Title'
import type {
  Category,
  Order,
  OrderListResponse,
} from '@backend/routes/shop/models'
import { Link } from 'react-router-dom'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { ORDER_STATUS_COLOR } from './orderStatusColor'

type DateRange = '7d' | '1m' | '3m' | '6m' | '1y'

function resolveLanguage(language: string): 'fi' | 'sv' | 'en' {
  if (language.startsWith('fi')) return 'fi'
  if (language.startsWith('sv')) return 'sv'
  return 'en'
}

function parseDateRange(value: string): DateRange {
  if (value === '1m' || value === '3m' || value === '6m' || value === '1y')
    return value
  return '7d'
}

function mergeUniqueOrders(
  previousOrders: Order[],
  nextOrders: Order[]
): Order[] {
  const seen = new Set(previousOrders.map((order) => order.orderId))
  const uniqueNew = nextOrders.filter((order) => !seen.has(order.orderId))
  return [...previousOrders, ...uniqueNew]
}

export default function OrdersPage() {
  const { t, i18n } = useTranslation()

  const [categoryId, setCategoryId] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [page, setPage] = useState(1)
  const [visibleOrders, setVisibleOrders] = useState<Order[]>([])

  const pageSize = 5
  const lang = resolveLanguage(i18n.language)

  const { data: categories } = useApi<Category[]>({ url: 'v1/shop/categories' })

  const {
    data: response,
    isLoading,
    error,
    isValidating,
  } = useApi<OrderListResponse>({
    url: 'v1/shop/orders',
    params: {
      page,
      pageSize,
      categoryId: categoryId || undefined,
      dateRange,
    },
  })

  useEffect(() => {
    if (!response) return
    setVisibleOrders((prev) =>
      page === 1 ? response.items : mergeUniqueOrders(prev, response.items)
    )
  }, [response, page])

  const hasMore = response?.hasMore ?? false

  const categoryLabel = useMemo(
    () => (c: Category) => c.name?.[lang] ?? c.name?.en ?? c.categoryId,
    [lang]
  )

  const handleCategoryChange = (value: string) => {
    setCategoryId(value)
    setPage(1)
    setVisibleOrders([])
  }

  const handleDateRangeChange = (value: DateRange) => {
    setDateRange(value)
    setPage(1)
    setVisibleOrders([])
  }

  return (
    <Box>
      <Title label={t('shop.myOrders')} />

      <Button
        component={Link}
        to='/shop'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('shop.continueShopping')}
      </Button>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl size='small' sx={{ minWidth: 220 }}>
          <InputLabel>{t('shop.category')}</InputLabel>
          <Select
            value={categoryId}
            label={t('shop.category')}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            {(categories ?? []).map((category) => (
              <MenuItem key={category.categoryId} value={category.categoryId}>
                {categoryLabel(category)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size='small' sx={{ minWidth: 220 }}>
          <InputLabel>{t('common.date')}</InputLabel>
          <Select
            value={dateRange}
            label={t('common.date')}
            onChange={(e) =>
              handleDateRangeChange(parseDateRange(e.target.value))
            }
          >
            <MenuItem value='7d'>Last 7 days</MenuItem>
            <MenuItem value='1m'>Last month</MenuItem>
            <MenuItem value='3m'>Last 3 months</MenuItem>
            <MenuItem value='6m'>Last 6 months</MenuItem>
            <MenuItem value='1y'>Last year</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <RemoteContent isLoading={isLoading} error={error}>
        {!isLoading && visibleOrders.length === 0 && (
          <Typography color='text.secondary'>{t('shop.noOrders')}</Typography>
        )}

        {visibleOrders.length > 0 && (
          <>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('shop.orderId')}</TableCell>
                    <TableCell>{t('shop.orderDate')}</TableCell>
                    <TableCell>{t('shop.status')}</TableCell>
                    <TableCell align='right'>{t('shop.total')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleOrders.map((order) => (
                    <TableRow key={order.orderId} hover>
                      <TableCell>#{order.orderId}</TableCell>
                      <TableCell>
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size='small'
                          label={order.status}
                          color={ORDER_STATUS_COLOR[order.status] ?? 'default'}
                        />
                      </TableCell>
                      <TableCell align='right'>
                        €{(order.totalAmount ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size='small'
                          component={Link}
                          to={`/shop/orders/${order.orderId}`}
                          startIcon={<Icon icon='mdi:eye' />}
                        >
                          {t('common.view')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {hasMore && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant='outlined'
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={isValidating}
                >
                  {isValidating ? t('common.loading') : t('shop.loadMore')}
                </Button>
              </Box>
            )}
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
