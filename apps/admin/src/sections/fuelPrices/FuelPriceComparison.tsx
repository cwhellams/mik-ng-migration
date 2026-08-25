import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
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

import {
  HOME_BASE_ICAO,
  LIQUID_FUEL_TYPES,
  type FuelPriceComparisonResponse,
} from '@mik/contracts/liquid'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import { formatLitres, formatPricePerLitre } from '../liquid/liquidFormat'

/**
 * "A report for a selected date range that identifies fuelings whose litre price
 * exceeds the EFNU reference price entered at runtime."
 *
 * The reference prices are typed in here rather than stored anywhere, because the
 * question is "was this more expensive than buying it at home *today*" — and
 * today's home price is something the person running the report knows and the
 * database does not.
 *
 * This replaces the old "recent fuelings" table, which derived its rows from
 * expense line items and so could not see a fuelling nobody claimed.
 */

const today = () => new Date().toISOString().slice(0, 10)
const yearStart = () => `${new Date().getFullYear()}-01-01`

export function FuelPriceComparison() {
  const { t } = useTranslation()
  const [from, setFrom] = useState(yearStart)
  const [to, setTo] = useState(today)
  const [references, setReferences] = useState<Record<string, string>>({})
  // The report only runs when asked: reference prices are the point of it, and
  // fetching on mount would show a table where nothing is comparable.
  const [query, setQuery] = useState<Record<string, unknown>>()

  const { data, error, isLoading } = useApi<FuelPriceComparisonResponse>({
    url: 'v1/liquid/reports/fuel-price-comparison',
    params: query,
    skipFetch: !query,
  })

  const handleRun = () =>
    setQuery({
      from,
      to,
      // `reference=<fuel type>:<price>`, repeated — axios serialises an array as
      // repeated bare keys, which is what the server's schema parses.
      reference: Object.entries(references)
        .filter(([, price]) => price !== '' && Number(price) > 0)
        .map(([fuelType, price]) => `${fuelType}:${price}`),
    })

  const rows = data?.rows ?? []
  const summary = data?.summary

  return (
    <Box>
      <Title label={t('fuelPrices.comparison.title')} subtitle />

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant='body2' sx={{ color: 'text.secondary', mb: 2 }}>
            {t('fuelPrices.comparison.intro', { icao: HOME_BASE_ICAO })}
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              type='date'
              label={t('fuelPrices.comparison.from')}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type='date'
              label={t('fuelPrices.comparison.to')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          <Typography variant='subtitle2' sx={{ mb: 1 }}>
            {t('fuelPrices.comparison.referencePrices', { icao: HOME_BASE_ICAO })}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' },
              gap: 2,
              mb: 2,
            }}
          >
            {LIQUID_FUEL_TYPES.map((fuelType) => (
              <TextField
                key={fuelType}
                type='number'
                size='small'
                label={fuelType}
                value={references[fuelType] ?? ''}
                onChange={(e) =>
                  setReferences((current) => ({ ...current, [fuelType]: e.target.value }))
                }
                slotProps={{ htmlInput: { step: '0.01', min: '0' } }}
                placeholder='€/l'
              />
            ))}
          </Box>

          <Button
            variant='contained'
            startIcon={<Icon icon='mdi:magnify' />}
            onClick={handleRun}
            disabled={!from || !to}
          >
            {t('fuelPrices.comparison.run')}
          </Button>
        </Paper>

        {query && (
          <RemoteContent isLoading={isLoading} error={error}>
            {summary && (
              <Paper sx={{ p: 3 }}>
                <Stack direction='row' spacing={3} sx={{ flexWrap: 'wrap', gap: 2 }}>
                  <Stat label={t('fuelPrices.comparison.stat.total')} value={summary.total} />
                  <Stat
                    label={t('fuelPrices.comparison.stat.comparable')}
                    value={summary.comparable}
                  />
                  <Stat
                    label={t('fuelPrices.comparison.stat.exceeding')}
                    value={summary.exceeding}
                    highlight={summary.exceeding > 0}
                  />
                  <Stat
                    label={t('fuelPrices.comparison.stat.exceedingLitres')}
                    value={formatLitres(summary.exceedingLitres)}
                  />
                  <Stat
                    label={t('fuelPrices.comparison.stat.excessCost')}
                    value={`${summary.excessCostEur.toFixed(2)} €`}
                    highlight={summary.excessCostEur > 0}
                  />
                </Stack>
              </Paper>
            )}

            {rows.length === 0 ? (
              <Alert severity='info'>{t('fuelPrices.comparison.empty')}</Alert>
            ) : (
              <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('fuelPrices.comparison.col.date')}</TableCell>
                      <TableCell>{t('fuelPrices.comparison.col.aircraft')}</TableCell>
                      <TableCell>{t('fuelPrices.comparison.col.airport')}</TableCell>
                      <TableCell>{t('fuelPrices.comparison.col.fuelType')}</TableCell>
                      <TableCell>{t('fuelPrices.comparison.col.provider')}</TableCell>
                      <TableCell align='right'>{t('fuelPrices.comparison.col.litres')}</TableCell>
                      <TableCell align='right'>{t('fuelPrices.comparison.col.paid')}</TableCell>
                      <TableCell align='right'>
                        {t('fuelPrices.comparison.col.taxAdjusted')}
                      </TableCell>
                      <TableCell align='right'>
                        {t('fuelPrices.comparison.col.reference')}
                      </TableCell>
                      <TableCell align='right'>{t('fuelPrices.comparison.col.delta')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.recordId}
                        sx={
                          row.exceedsReference
                            ? { backgroundColor: 'warning.light', opacity: 0.9 }
                            : undefined
                        }
                      >
                        <TableCell>{new Date(row.recordedAt).toLocaleDateString()}</TableCell>
                        <TableCell>{row.aircraftRegistration}</TableCell>
                        <TableCell>
                          {row.airportName ? `${row.airport}: ${row.airportName}` : row.airport}
                        </TableCell>
                        <TableCell>
                          <Stack direction='row' spacing={0.5} sx={{ alignItems: 'center' }}>
                            <span>{row.fuelType}</span>
                            {/* Says why no Finnish fuel tax was added to this one. */}
                            {row.taxIncludedAbroad && (
                              <Tooltip title={t('fuelPrices.comparison.abroadTooltip')}>
                                <Chip
                                  size='small'
                                  variant='outlined'
                                  label={t('fuelPrices.comparison.abroad')}
                                />
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>{row.providerName ?? '—'}</TableCell>
                        <TableCell align='right'>{formatLitres(row.quantityLitres)}</TableCell>
                        <TableCell align='right'>
                          {row.paidPricePerLitre != null
                            ? `${row.paidPricePerLitre.toFixed(4)} ${row.ccy}/l`
                            : '—'}
                        </TableCell>
                        <TableCell align='right'>
                          {formatPricePerLitre(
                            row.storedTaxAdjustedPricePerLitre ?? row.taxAdjustedPricePerLitre,
                          ) ?? '—'}
                        </TableCell>
                        <TableCell align='right'>
                          {formatPricePerLitre(row.referencePrice) ?? '—'}
                        </TableCell>
                        <TableCell align='right'>
                          {!row.comparable ? (
                            // Listed but not compared — an EFNU fuelling with no
                            // cost, or a fuel type with no reference price. Shown
                            // rather than dropped, so an empty "exceeding" count
                            // cannot be mistaken for "everything was fine".
                            <Tooltip title={t('fuelPrices.comparison.notComparableTooltip')}>
                              <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                                {t('fuelPrices.comparison.notComparable')}
                              </Typography>
                            </Tooltip>
                          ) : row.exceedsReference ? (
                            <Typography variant='body2' sx={{ fontWeight: 600 }}>
                              {`+${row.deltaPerLitre!.toFixed(4)} €/l`}
                            </Typography>
                          ) : (
                            <Typography variant='body2' sx={{ color: 'success.main' }}>
                              {`${row.deltaPerLitre!.toFixed(4)} €/l`}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </RemoteContent>
        )}
      </Stack>
    </Box>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <Box>
      <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant='h6'
        sx={{ fontWeight: 600, color: highlight ? 'warning.main' : 'text.primary' }}
      >
        {value}
      </Typography>
    </Box>
  )
}
