import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'

import {
  LiquidType,
  type FuelTax,
  type LiquidRecordListResponse,
  type LiquidRecordWithLock,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { endpoints } from '../../api/endpoints'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import {
  formatCost,
  formatLitres,
  formatPricePerLitre,
  paidPricePerLitre,
} from '../liquid/liquidHelpers'

/**
 * Picking the fuel records a claim is made of, instead of retyping the fuelling.
 *
 * "Members select an existing fuel record instead of re-entering fuel details.
 * The selected record supplies fuel, quantity, airport, provider, cost, and
 * tax-status information." Which means this component has no cost fields at all:
 * the server derives every line item from the records, so anything typed here
 * would be discarded.
 *
 * Records already on another claim are shown rather than hidden — "clearly show
 * whether a fuel record is already linked to a claim" — because a member looking
 * for a fuelling they know they reported needs to see that it is already claimed,
 * not find an empty list.
 */

interface Props {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  /** The claim being edited, whose own records are selectable rather than locked. */
  claimId?: string
}

export function FuelRecordPicker({ selectedIds, onChange, claimId }: Props) {
  const { t } = useTranslation()

  const { data, error, isLoading } = useApi<LiquidRecordListResponse>({
    url: endpoints.liquid.records,
    params: { liquidType: LiquidType.FUEL, limit: 100 },
  })

  // Shown so the member can see what will be added on top of an untaxed Finnish
  // purchase, rather than being surprised by the figure on the approved claim.
  const fuelTaxApi = useApi<FuelTax[]>({ url: endpoints.liquid.fuelTax })

  // Only fuel the member actually paid for is claimable: an EFNU fuelling is
  // invoiced to the club and carries no cost, so there is nothing to reimburse.
  const records = (data?.records ?? []).filter((r) => r.totalCost != null)
  const claimable = (record: LiquidRecordWithLock) =>
    !record.expenseClaimId || record.expenseClaimId === claimId

  const toggle = (recordId: string) =>
    onChange(
      selectedIds.includes(recordId)
        ? selectedIds.filter((id) => id !== recordId)
        : [...selectedIds, recordId],
    )

  const selectedTotal = records
    .filter((r) => selectedIds.includes(r.recordId))
    .reduce((sum, r) => sum + (r.totalCost ?? 0) * (r.fxRate ?? 1), 0)

  const taxFor = (record: LiquidRecordWithLock): number | null => {
    if (record.taxIncludedAbroad) return null
    const year = new Date(record.recordedAt).getUTCFullYear()
    return (
      (fuelTaxApi.data ?? []).find((r) => r.taxYear === year && r.fuelType === record.fuelType)
        ?.rateEurPerLitre ?? null
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant='body1'>{t('expenses.fuelRecords.intro')}</Typography>

      <RemoteContent isLoading={isLoading} error={error}>
        {records.length === 0 ? (
          <Alert
            severity='info'
            action={
              <Button component={Link} to='/liquid/new' size='small' color='inherit'>
                {t('expenses.fuelRecords.reportFirst')}
              </Button>
            }
          >
            {t('expenses.fuelRecords.none')}
          </Alert>
        ) : (
          <Paper variant='outlined'>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell padding='checkbox' />
                  <TableCell>{t('expenses.fuelRecords.col.date')}</TableCell>
                  <TableCell>{t('expenses.fuelRecords.col.aircraft')}</TableCell>
                  <TableCell>{t('expenses.fuelRecords.col.airport')}</TableCell>
                  <TableCell>{t('expenses.fuelRecords.col.fuelType')}</TableCell>
                  <TableCell align='right'>{t('expenses.fuelRecords.col.litres')}</TableCell>
                  <TableCell align='right'>{t('expenses.fuelRecords.col.cost')}</TableCell>
                  <TableCell align='right'>{t('expenses.fuelRecords.col.perLitre')}</TableCell>
                  <TableCell padding='checkbox' />
                  <TableCell>{t('expenses.fuelRecords.col.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((record) => {
                  const selectable = claimable(record)
                  const tax = taxFor(record)
                  return (
                    <TableRow
                      key={record.recordId}
                      hover={selectable}
                      selected={selectedIds.includes(record.recordId)}
                      sx={selectable ? undefined : { opacity: 0.5 }}
                    >
                      <TableCell padding='checkbox'>
                        <Checkbox
                          checked={selectedIds.includes(record.recordId)}
                          disabled={!selectable}
                          onChange={() => toggle(record.recordId)}
                          slotProps={{
                            input: {
                              'aria-label': `${record.recordedAt} ${record.airport ?? ''}`,
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>{new Date(record.recordedAt).toLocaleDateString()}</TableCell>
                      <TableCell>{record.aircraftRegistration}</TableCell>
                      <TableCell>{record.airport}</TableCell>
                      <TableCell>{record.fuelType}</TableCell>
                      <TableCell align='right'>{formatLitres(record.quantityLitres)}</TableCell>
                      <TableCell align='right'>
                        {formatCost(record.totalCost, record.ccy)}
                      </TableCell>
                      <TableCell align='right'>
                        <Stack>
                          <span>{formatPricePerLitre(paidPricePerLitre(record))}</span>
                          {/* What the club will add before comparing against the
                              EFNU cap — visible here so the approved figure is
                              not a surprise. */}
                          {tax != null && tax > 0 && (
                            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                              {t('expenses.fuelRecords.plusFuelTax', { rate: tax.toFixed(4) })}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell padding='checkbox'>
                        {record.attachmentCount > 0 && (
                          <Tooltip title={t('expenses.fuelRecords.receiptAttachedHint')}>
                            <span
                              role='img'
                              aria-label={t('expenses.fuelRecords.receiptAttachedHint')}
                            >
                              <Icon icon='mdi:paperclip' />
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.expenseClaimId && record.expenseClaimId !== claimId ? (
                          <Chip
                            size='small'
                            component={Link}
                            clickable
                            to={`/expenses/${record.expenseClaimId}`}
                            icon={<Icon icon='mdi:lock-outline' />}
                            label={t('expenses.fuelRecords.alreadyClaimed')}
                          />
                        ) : record.taxIncludedAbroad ? (
                          <Chip
                            size='small'
                            variant='outlined'
                            label={t('expenses.fuelRecords.taxIncluded')}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </RemoteContent>

      {selectedIds.length > 0 && (
        <Alert severity='success' icon={<Icon icon='mdi:check' />}>
          {t('expenses.fuelRecords.selected', {
            count: selectedIds.length,
            total: selectedTotal.toFixed(2),
          })}
        </Alert>
      )}
    </Stack>
  )
}
