import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'

import {
  LiquidType,
  type ClaimableFuelSummary,
  type LiquidRecordListResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { absolute, endpoints } from '../../api/endpoints'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import {
  describeRecord,
  formatPricePerLitre,
  lockReasonKey,
  paidPricePerLitre,
} from './liquidHelpers'

/**
 * A member's own fuel and oil records.
 *
 * The interesting part is the lock: every row carries the server's verdict on
 * whether it may still be edited, and *why not* when it may not. Showing the
 * reason is the whole point — "this is more than a week old" and "this is on an
 * expense claim" are very different things to a member looking at a figure they
 * think is wrong.
 */

type Filter = 'ALL' | LiquidType

export default function MyLiquidRecords() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [pendingDelete, setPendingDelete] = useState<LiquidRecordWithLock>()

  const { data, error, isLoading, mutate, mutation } = useApi<LiquidRecordListResponse>({
    url: endpoints.liquid.records,
    params: filter === 'ALL' ? undefined : { liquidType: filter },
  })

  const claimable = useApi<ClaimableFuelSummary>({ url: endpoints.liquid.claimableFuel })

  const records = data?.records ?? []

  const handleDelete = async () => {
    if (!pendingDelete) return
    await mutation.trigger(
      'DELETE',
      undefined,
      absolute(endpoints.liquid.recordById(pendingDelete.recordId)),
    )
    setPendingDelete(undefined)
    await mutate()
    await claimable.mutate()
  }

  return (
    <Box>
      <Title label={t('liquid.myRecords.title')}>
        <Button
          component={Link}
          to='/liquid/new'
          variant='contained'
          startIcon={<Icon icon='mdi:plus' />}
        >
          {t('liquid.myRecords.report')}
        </Button>
      </Title>

      <Stack spacing={2}>
        {/* The dashboard prompt, repeated here: fuel the member paid for and has
            not claimed. EFNU fuelling is invoiced to the club, so it never
            appears. */}
        {(claimable.data?.count ?? 0) > 0 && (
          <Alert
            severity='info'
            action={
              <Button component={Link} to='/expenses/new' size='small' color='inherit'>
                {t('liquid.claimable.action')}
              </Button>
            }
          >
            {t('liquid.claimable.prompt', {
              count: claimable.data!.count,
              total: claimable.data!.totalCostEur.toFixed(2),
            })}
          </Alert>
        )}

        <ToggleButtonGroup
          exclusive
          size='small'
          value={filter}
          onChange={(_e, value: Filter | null) => value && setFilter(value)}
          aria-label={t('liquid.myRecords.filter')}
        >
          <ToggleButton value='ALL'>{t('liquid.myRecords.all')}</ToggleButton>
          <ToggleButton value={LiquidType.FUEL}>{t('liquid.type.fuel')}</ToggleButton>
          <ToggleButton value={LiquidType.OIL}>{t('liquid.type.oil')}</ToggleButton>
        </ToggleButtonGroup>

        <RemoteContent isLoading={isLoading} error={error}>
          {records.length === 0 ? (
            <Alert severity='info'>{t('liquid.myRecords.empty')}</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('liquid.myRecords.col.date')}</TableCell>
                    <TableCell>{t('liquid.myRecords.col.aircraft')}</TableCell>
                    <TableCell>{t('liquid.myRecords.col.details')}</TableCell>
                    <TableCell>{t('liquid.myRecords.col.pricePerLitre')}</TableCell>
                    <TableCell>{t('liquid.myRecords.col.links')}</TableCell>
                    <TableCell align='right' />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.recordId}>
                      <TableCell>{new Date(record.recordedAt).toLocaleString()}</TableCell>
                      <TableCell>{record.aircraftRegistration}</TableCell>
                      <TableCell>
                        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                          <Icon
                            icon={record.liquidType === LiquidType.FUEL ? 'mdi:fuel' : 'mdi:oil'}
                          />
                          <span>{describeRecord(record, t)}</span>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {formatPricePerLitre(paidPricePerLitre(record), record.ccy) ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {record.flightLogId && (
                            <Chip
                              size='small'
                              component={Link}
                              clickable
                              to={`/logs/flights/${record.flightLogId}`}
                              icon={<Icon icon='mdi:airplane' />}
                              label={record.flightLogId}
                            />
                          )}
                          {/* "Clearly show whether a fuel record is already
                              linked to a claim." */}
                          {record.expenseClaimId && (
                            <Chip
                              size='small'
                              color='primary'
                              component={Link}
                              clickable
                              to={`/expenses/${record.expenseClaimId}`}
                              icon={<Icon icon='mdi:receipt-text-outline' />}
                              label={t('liquid.myRecords.claimed')}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align='right'>
                        <RowActions record={record} onDelete={() => setPendingDelete(record)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </RemoteContent>
      </Stack>

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('liquid.myRecords.deleteTitle')}
        message={t('liquid.myRecords.deleteMessage')}
        confirmText={t('general.delete')}
        cancelText={t('general.cancel')}
        severity='error'
        onConfirm={() => void handleDelete()}
        onClose={() => setPendingDelete(undefined)}
      />
    </Box>
  )
}

/**
 * Edit and delete, or the reason neither is available.
 *
 * A disabled button with no explanation is the complaint this avoids: the
 * server already computed the reason, so it is shown in the tooltip rather than
 * left for the member to guess.
 */
function RowActions({ record, onDelete }: { record: LiquidRecordWithLock; onDelete: () => void }) {
  const { t } = useTranslation()

  if (!record.lock.canEdit) {
    return (
      <Tooltip title={record.lock.reason ? t(lockReasonKey(record.lock.reason)) : ''}>
        <Typography
          variant='caption'
          sx={{ color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
        >
          <Icon icon='mdi:lock-outline' />
          {t('liquid.myRecords.locked')}
        </Typography>
      </Tooltip>
    )
  }

  return (
    <Stack direction='row' spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
      <IconButton
        size='small'
        component={Link}
        to={`/liquid/${record.recordId}/edit`}
        aria-label={t('general.edit')}
      >
        <Icon icon='mdi:pencil-outline' />
      </IconButton>
      <IconButton size='small' color='error' onClick={onDelete} aria-label={t('general.delete')}>
        <Icon icon='mdi:delete-outline' />
      </IconButton>
    </Stack>
  )
}
