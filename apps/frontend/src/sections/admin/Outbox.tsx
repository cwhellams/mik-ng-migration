import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
  Tooltip,
  Alert,
  Snackbar,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import useApi from '../../hooks/useApi'
import type {
  OutboxListResponse,
  OutboxItem,
  OutboxStatus,
} from '@backend/routes/outbox/models'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'

const STATUS_OPTIONS: OutboxStatus[] = [
  'PENDING',
  'PROCESSING',
  'SYNCED',
  'FAILED',
  'SKIPPED',
]

const EVENT_TYPE_OPTIONS = [
  'addMember',
  'membershipFee',
  'newMemberFees',
  'equipmentInvoice',
  'flightInvoice',
  'reimbursement',
  'sendInvoicePdf',
  'creditNote',
]

const STATUS_COLORS: Record<
  OutboxStatus,
  'info' | 'warning' | 'success' | 'error' | 'default'
> = {
  PENDING: 'info',
  PROCESSING: 'warning',
  SYNCED: 'success',
  FAILED: 'error',
  SKIPPED: 'default',
}

type Filters = {
  status: string
  event_type: string
  created_from: Dayjs | null
  created_to: Dayjs | null
  processed_from: Dayjs | null
  processed_to: Dayjs | null
}

const DATE_PRESETS = [
  { key: 'last5min', minutes: 5 },
  { key: 'last15min', minutes: 15 },
  { key: 'last1hr', minutes: 60 },
  { key: 'last1day', minutes: 1440 },
  { key: 'last1week', minutes: 10080 },
]

export default function Outbox() {
  const { t } = useTranslation()

  const [filters, setFilters] = useState<Filters>({
    status: '',
    event_type: '',
    created_from: null,
    created_to: null,
    processed_from: null,
    processed_to: null,
  })

  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // Build query params for the API call, omitting empty values
  const apiParams: Record<string, string> = {}
  if (filters.status) apiParams.status = filters.status
  if (filters.event_type) apiParams.event_type = filters.event_type
  if (filters.created_from)
    apiParams.created_from = filters.created_from.toISOString()
  if (filters.created_to)
    apiParams.created_to = filters.created_to.toISOString()
  if (filters.processed_from)
    apiParams.processed_from = filters.processed_from.toISOString()
  if (filters.processed_to)
    apiParams.processed_to = filters.processed_to.toISOString()

  const { data, isLoading, error, mutate } = useApi<OutboxListResponse>({
    url: 'v1/outbox',
    params: apiParams,
  })

  const { mutation: retryMutation } = useApi<{ message: string }>({
    url: 'v1/outbox',
    skipFetch: true,
  })

  const handleRetry = async (item: OutboxItem) => {
    const result = await retryMutation.trigger('PATCH', {}, `${item.id}/retry`)
    if (result.error) {
      setSnackbar({
        open: true,
        message: t('outbox.retryError'),
        severity: 'error',
      })
    } else {
      setSnackbar({
        open: true,
        message: t('outbox.retrySuccess'),
        severity: 'success',
      })
      mutate()
    }
  }

  const applyPreset = (minutes: number) => {
    setFilters((f) => ({
      ...f,
      created_from: dayjs().subtract(minutes, 'minute'),
      created_to: null,
    }))
  }

  const clearFilters = () => {
    setFilters({
      status: '',
      event_type: '',
      created_from: null,
      created_to: null,
      processed_from: null,
      processed_to: null,
    })
  }

  const items = data?.items ?? []

  return (
    <Box>
      <Title label={t('outbox.title')} />

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems='flex-start'>
          {/* Status filter */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size='small'>
              <InputLabel>{t('outbox.filter.status')}</InputLabel>
              <Select
                value={filters.status}
                label={t('outbox.filter.status')}
                onChange={({ target }) =>
                  setFilters((f) => ({ ...f, status: target.value }))
                }
              >
                <MenuItem value=''>{t('outbox.filter.allStatuses')}</MenuItem>
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Event type filter */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size='small'>
              <InputLabel>{t('outbox.filter.eventType')}</InputLabel>
              <Select
                value={filters.event_type}
                label={t('outbox.filter.eventType')}
                onChange={({ target }) =>
                  setFilters((f) => ({ ...f, event_type: target.value }))
                }
              >
                <MenuItem value=''>{t('outbox.filter.allEventTypes')}</MenuItem>
                {EVENT_TYPE_OPTIONS.map((e) => (
                  <MenuItem key={e} value={e}>
                    {e}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Created date range */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <DateTimePicker
              label={t('outbox.filter.createdFrom')}
              value={filters.created_from}
              onChange={(v) => setFilters((f) => ({ ...f, created_from: v }))}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <DateTimePicker
              label={t('outbox.filter.createdTo')}
              value={filters.created_to}
              onChange={(v) => setFilters((f) => ({ ...f, created_to: v }))}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />
          </Grid>

          {/* Processed date range */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <DateTimePicker
              label={t('outbox.filter.processedFrom')}
              value={filters.processed_from}
              onChange={(v) => setFilters((f) => ({ ...f, processed_from: v }))}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <DateTimePicker
              label={t('outbox.filter.processedTo')}
              value={filters.processed_to}
              onChange={(v) => setFilters((f) => ({ ...f, processed_to: v }))}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
            />
          </Grid>

          {/* Preset buttons + clear */}
          <Grid size={12}>
            <Stack
              direction='row'
              spacing={1}
              flexWrap='wrap'
              gap={1}
              alignItems='center'
            >
              <Typography variant='body2' color='text.secondary'>
                {t('outbox.filter.presets')}:
              </Typography>
              <ButtonGroup size='small' variant='outlined'>
                {DATE_PRESETS.map(({ key, minutes }) => (
                  <Button key={key} onClick={() => applyPreset(minutes)}>
                    {t(`outbox.filter.${key}`)}
                  </Button>
                ))}
              </ButtonGroup>
              <Button
                size='small'
                variant='text'
                color='inherit'
                onClick={clearFilters}
              >
                {t('outbox.filter.clearFilters')}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Results */}
      <RemoteContent isLoading={isLoading} error={error}>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
          {t('outbox.showing', { count: items.length })}
        </Typography>
        <TableContainer component={Paper}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('outbox.columns.id')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('outbox.columns.eventType')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('outbox.columns.status')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('outbox.columns.createdAt')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('outbox.columns.processedAt')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('outbox.columns.errorMessage')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('outbox.columns.actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align='center' sx={{ py: 4 }}>
                    <Typography color='text.secondary'>
                      {t('outbox.noResults')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Tooltip title={item.id}>
                        <Typography
                          variant='body2'
                          sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                        >
                          {item.id.slice(0, 8)}…
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant='body2'
                        sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                      >
                        {item.event_type}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={item.status}
                        size='small'
                        color={STATUS_COLORS[item.status] ?? 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' noWrap>
                        {item.created_at_utc
                          ? dayjs(item.created_at_utc).format(
                              'DD.MM.YYYY HH:mm:ss'
                            )
                          : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' noWrap>
                        {item.processed_at
                          ? dayjs(item.processed_at).format(
                              'DD.MM.YYYY HH:mm:ss'
                            )
                          : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      {item.error_message ? (
                        <Tooltip title={item.error_message}>
                          <Typography
                            variant='body2'
                            color='error'
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 280,
                              fontSize: '0.75rem',
                            }}
                          >
                            {item.error_message}
                          </Typography>
                        </Tooltip>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === 'FAILED' && (
                        <Button
                          size='small'
                          variant='outlined'
                          color='warning'
                          disabled={retryMutation.isMutating}
                          onClick={() => handleRetry(item)}
                        >
                          {t('outbox.retry')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
