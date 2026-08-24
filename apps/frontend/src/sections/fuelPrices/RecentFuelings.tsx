import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
} from '@mui/material'
import type { FuelReportResponse } from '@mik/contracts/fuel-report'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'

const litresFormatter = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 })
const priceFormatter = new Intl.NumberFormat('fi-FI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

type SortKey = 'date' | 'airportIdent' | 'litres' | 'fuelType' | 'pricePerLitreEur'

export function RecentFuelings() {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>('pricePerLitreEur')
  const [sortAsc, setSortAsc] = useState(true)

  const { data, error, isLoading } = useApi<FuelReportResponse>({ url: 'v1/fuel-report' })
  const entries = data?.data ?? []

  const sorted = useMemo(() => {
    const withValue = entries.filter((e) => e[sortKey] != null)
    const withoutValue = entries.filter((e) => e[sortKey] == null)
    withValue.sort((a, b) => {
      const av = a[sortKey]!
      const bv = b[sortKey]!
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
    return [...withValue, ...withoutValue]
  }, [entries, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((asc) => !asc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'date', label: t('fuelPrices.recentFuelings.col.date') },
    { key: 'airportIdent', label: t('fuelPrices.recentFuelings.col.airport') },
    { key: 'litres', label: t('fuelPrices.recentFuelings.col.litres') },
    { key: 'fuelType', label: t('fuelPrices.recentFuelings.col.fuelType') },
    { key: 'pricePerLitreEur', label: t('fuelPrices.recentFuelings.col.pricePerLitre') },
  ]

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Title label={t('fuelPrices.recentFuelings.title')} subtitle />
      {entries.length === 0 ? (
        <Alert severity='info'>{t('fuelPrices.recentFuelings.empty')}</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <TableSortLabel
                      active={sortKey === col.key}
                      direction={sortAsc ? 'asc' : 'desc'}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((entry, idx) => (
                <TableRow key={`${entry.date}-${entry.airportIdent}-${entry.fuelType}-${idx}`}>
                  <TableCell>{entry.date}</TableCell>
                  <TableCell>
                    {entry.airportName
                      ? `${entry.airportIdent}: ${entry.airportName}`
                      : entry.airportIdent}
                  </TableCell>
                  <TableCell>{litresFormatter.format(entry.litres)}</TableCell>
                  <TableCell>{entry.fuelType ?? '—'}</TableCell>
                  <TableCell>
                    {entry.pricePerLitreEur != null
                      ? `${priceFormatter.format(entry.pricePerLitreEur)} €/l`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </RemoteContent>
  )
}
