import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'

import type { AircraftListResponse } from '@mik/contracts/aircrafts'
import {
  LiquidType,
  type LiquidRecordListResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { absolute } from '../../api/endpoints'
import { MemberAppLink } from '../../components/MemberAppLink'
import { describeRecord, formatCost, formatLitres } from './liquidFormat'

/**
 * Every member's liquid records, for a liquid admin.
 *
 * The admin's extra powers are narrow and both visible here: they can see and
 * edit records past the member's one-week window, and they can see soft-deleted
 * ones. What they cannot do is touch a record attached to an expense claim —
 * that lock has no admin escape hatch, which is why the delete control is absent
 * on those rows rather than merely failing.
 */
export default function LiquidRecordsAdmin() {
  const { t } = useTranslation()
  const [liquidType, setLiquidType] = useState('')
  const [aircraftRegistration, setAircraftRegistration] = useState('')
  const [memberId, setMemberId] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)

  const aircraftApi = useApi<AircraftListResponse>({ url: 'v1/aircrafts' })
  const { data, error, isLoading, mutate, mutation } = useApi<LiquidRecordListResponse>({
    url: 'v1/liquid/records',
    params: {
      ...(liquidType ? { liquidType } : {}),
      ...(aircraftRegistration ? { aircraftRegistration } : {}),
      ...(memberId ? { memberId } : {}),
      includeDeleted: String(includeDeleted),
      limit: 200,
    },
    alwaysSudo: true,
  })

  const records = data?.records ?? []

  const handleDelete = async (record: LiquidRecordWithLock) => {
    if (!globalThis.confirm(t('liquid.admin.records.deleteMessage'))) return
    await mutation.trigger('DELETE', undefined, absolute(`v1/liquid/records/${record.recordId}`))
    await mutate()
  }

  return (
    <Box>
      <Title label={t('liquid.admin.records.title')} />

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap', gap: 2 }}
          >
            <TextField
              select
              size='small'
              label={t('liquid.form.liquidType')}
              value={liquidType}
              onChange={(e) => setLiquidType(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value=''>{t('liquid.myRecords.all')}</MenuItem>
              <MenuItem value={LiquidType.FUEL}>{t('liquid.type.fuel')}</MenuItem>
              <MenuItem value={LiquidType.OIL}>{t('liquid.type.oil')}</MenuItem>
            </TextField>

            <TextField
              select
              size='small'
              label={t('liquid.form.aircraft')}
              value={aircraftRegistration}
              onChange={(e) => setAircraftRegistration(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value=''>{t('liquid.myRecords.all')}</MenuItem>
              {(aircraftApi.data?.aircrafts ?? []).map((a) => (
                <MenuItem key={a.registration} value={a.registration}>
                  {a.registration}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              size='small'
              label={t('liquid.admin.records.memberId')}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              sx={{ minWidth: 160 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                />
              }
              label={t('liquid.admin.records.includeDeleted')}
            />

            <Typography variant='body2' sx={{ color: 'text.secondary', ml: 'auto' }}>
              {t('liquid.admin.records.total', { count: data?.total ?? 0 })}
            </Typography>
          </Stack>
        </Paper>

        <RemoteContent isLoading={isLoading} error={error}>
          {records.length === 0 ? (
            <Alert severity='info'>{t('liquid.admin.records.empty')}</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('liquid.myRecords.col.date')}</TableCell>
                    <TableCell>{t('liquid.admin.records.memberId')}</TableCell>
                    <TableCell>{t('liquid.myRecords.col.aircraft')}</TableCell>
                    <TableCell>{t('liquid.myRecords.col.details')}</TableCell>
                    <TableCell>{t('liquid.admin.records.quantity')}</TableCell>
                    <TableCell>{t('liquid.form.totalCost')}</TableCell>
                    <TableCell>{t('liquid.myRecords.col.links')}</TableCell>
                    <TableCell align='right' />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow
                      key={record.recordId}
                      // A deleted record is history, not a row to act on.
                      sx={record.deletedAt ? { opacity: 0.55 } : undefined}
                    >
                      <TableCell>{new Date(record.recordedAt).toLocaleString()}</TableCell>
                      <TableCell>{record.memberId}</TableCell>
                      <TableCell>{record.aircraftRegistration}</TableCell>
                      <TableCell>{describeRecord(record, t)}</TableCell>
                      <TableCell>{formatLitres(record.quantityLitres)}</TableCell>
                      <TableCell>{formatCost(record.totalCost, record.ccy) ?? '—'}</TableCell>
                      <TableCell>
                        <Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {record.flightLogId && (
                            <Chip
                              size='small'
                              component={MemberAppLink}
                              clickable
                              to={`/logs/flights/${record.flightLogId}`}
                              label={record.flightLogId}
                            />
                          )}
                          {record.expenseClaimId && (
                            <Tooltip title={t('liquid.lock.claimLinked')}>
                              <Chip
                                size='small'
                                color='primary'
                                icon={<Icon icon='mdi:lock-outline' />}
                                label={t('liquid.myRecords.claimed')}
                              />
                            </Tooltip>
                          )}
                          {record.deletedAt && (
                            <Chip
                              size='small'
                              color='default'
                              label={t('liquid.admin.records.deleted', {
                                by: record.deletedBy ?? '',
                              })}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align='right'>
                        {record.lock.canEdit && (
                          <IconButton
                            size='small'
                            component={MemberAppLink}
                            to={`/liquid/${record.recordId}/edit`}
                            aria-label={t('general.edit')}
                          >
                            <Icon icon='mdi:pencil-outline' />
                          </IconButton>
                        )}
                        {record.lock.canDelete && (
                          <IconButton
                            size='small'
                            color='error'
                            onClick={() => void handleDelete(record)}
                            aria-label={t('general.delete')}
                          >
                            <Icon icon='mdi:delete-outline' />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </RemoteContent>
      </Stack>
    </Box>
  )
}
