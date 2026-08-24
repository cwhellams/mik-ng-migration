import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import type { Order, OrderStatus } from '@mik/contracts/shop'
import { Link } from 'react-router'
import { ORDER_STATUS_COLOR } from '@mik/ui/utils/orderStatusColor'

const ALL_STATUSES: OrderStatus[] = [
  'PENDING',
  'PROCESSING',
  'INVOICED',
  'INVOICE_PAID',
  'CANCELLED',
  'REFUNDED',
]
type DateRange = '7d' | '1m' | '3m' | '6m' | '1y'

const DATE_RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '1m', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
]

function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 10)
}

function formatMemberDisplay(order: Order): string {
  const fullName = order.member
    ? `${order.member.firstName} ${order.member.lastName}`
    : order.memberId
  const email = order.member?.email ?? 'n/a'
  const phone = order.member?.phoneNumber ?? 'n/a'
  return `${fullName} | ${email} | ${phone}`
}

export default function OrdersAdmin() {
  const { t } = useTranslation()

  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDateRange, setFilterDateRange] = useState<DateRange>('7d')

  const {
    data: orders,
    isLoading,
    error,
  } = useApi<Order[]>({
    url: 'v1/shop/orders',
    params: {
      status: filterStatus || undefined,
      dateRange: filterDateRange,
    },
  })

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Title label={t('shop.admin.orders')} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size='small' sx={{ width: 200 }}>
            <InputLabel>{t('shop.status')}</InputLabel>
            <Select
              value={filterStatus}
              label={t('shop.status')}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value=''>{t('common.all')}</MenuItem>
              {ALL_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size='small' sx={{ width: 200 }}>
            <InputLabel>{t('common.date')}</InputLabel>
            <Select
              value={filterDateRange}
              label={t('common.date')}
              onChange={(e) => setFilterDateRange(e.target.value as DateRange)}
            >
              {DATE_RANGE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>
      <RemoteContent isLoading={isLoading} error={error}>
        {!isLoading && (!orders || orders.length === 0) ? (
          <Typography
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('shop.noOrders')}
          </Typography>
        ) : (
          <TableContainer component={Paper}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('shop.orderId')}</TableCell>
                  <TableCell>{t('shop.member')}</TableCell>
                  <TableCell>{t('shop.orderDate')}</TableCell>
                  <TableCell>{t('shop.invoiceId')}</TableCell>
                  <TableCell align='right'>{t('shop.total')}</TableCell>
                  <TableCell>{t('shop.status')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {orders?.map((order) => (
                  <TableRow key={order.orderId} hover>
                    <TableCell>#{order.orderId}</TableCell>
                    <TableCell>{formatMemberDisplay(order)}</TableCell>
                    <TableCell>{formatIsoDate(order.createdAt)}</TableCell>
                    <TableCell>{order.invoiceId ?? 'n/a'}</TableCell>
                    <TableCell align='right'>€{order.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={order.status}
                        color={ORDER_STATUS_COLOR[order.status] ?? 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size='small'
                        component={Link}
                        to={`/admin/shop/orders/${order.orderId}`}
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
        )}
      </RemoteContent>
    </Box>
  )
}
