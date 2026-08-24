import { useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material'
import { ResponsiveBar } from '@nivo/bar'
import useApi from '../../../hooks/useApi'
import { useNivoTheme } from '../useNivoTheme'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import type { OccurrencesPerHundredHrsByAcYr } from '@mik/contracts/stats'

const STATS_YEAR_RANGE = Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

export const SafetyStatistics = () => {
  const currentYear = new Date().getFullYear()
  const yrFrom = currentYear - (STATS_YEAR_RANGE - 1)

  const { data, error, isLoading } = useApi<OccurrencesPerHundredHrsByAcYr[]>(
    {
      url: 'v1/stats/safety/occurrences-per-100h/aircraft/year',
      params: { yrFrom: yrFrom, yrTo: currentYear },
    },
    { refreshInterval: 0 },
  )

  // Derived from the safety stats themselves (not a separate aircraft-list call) — the
  // aircraft list endpoint requires aircraft.user/admin permission, which not every
  // member has, while this endpoint is open to any member.
  const aircraftRegistrations = useMemo(() => {
    const registrations = new Set<string>()
    ;(data ?? []).forEach((d) => {
      if (d.aircraftRegistration) registrations.add(d.aircraftRegistration)
    })
    return Array.from(registrations).sort((a, b) => a.localeCompare(b))
  }, [data])

  const years = useMemo(
    () => Array.from({ length: currentYear - yrFrom + 1 }, (_, i) => yrFrom + i),
    [yrFrom, currentYear],
  )

  const nivoTheme = useNivoTheme()

  // One bar-chart row per year, one key per aircraft — occurrences per 100 flight hours.
  const barData = useMemo(() => {
    if (!data) return []

    const byYear = new Map<number, Record<string, number>>()
    data.forEach((d) => {
      if (d.yr == null || d.aircraftRegistration == null || d.occurrencesPer100h == null) return
      const row = byYear.get(d.yr) ?? {}
      row[d.aircraftRegistration] = d.occurrencesPer100h
      byYear.set(d.yr, row)
    })

    return years.map((yr) => ({ year: String(yr), ...(byYear.get(yr) ?? {}) }))
  }, [data, years])

  // Raw counts per (aircraft, year), used for the chart tooltip and the summary table.
  const detailsByAircraftYear = useMemo(() => {
    const map = new Map<
      string,
      { occurrenceCount: number; totalFlightMins: number; occurrencesPer100h: number | null }
    >()
    ;(data ?? []).forEach((d) => {
      if (d.yr == null || d.aircraftRegistration == null) return
      map.set(`${d.aircraftRegistration}|${d.yr}`, {
        occurrenceCount: d.occurrenceCount ?? 0,
        totalFlightMins: d.totalFlightMins ?? 0,
        occurrencesPer100h: d.occurrencesPer100h,
      })
    })
    return map
  }, [data])

  return (
    <Box>
      <RemoteContent isLoading={isLoading} error={error}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              Occurrences per 100 Flight Hours
            </Typography>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mb: 2,
              }}
            >
              Per aircraft, per year — sourced from occurrence reports
            </Typography>
            <Box sx={{ height: 400 }}>
              {barData.length > 0 && aircraftRegistrations.length > 0 ? (
                <ResponsiveBar
                  data={barData}
                  keys={aircraftRegistrations}
                  indexBy='year'
                  margin={{ top: 20, right: 130, bottom: 50, left: 60 }}
                  padding={0.3}
                  valueScale={{ type: 'linear', min: 0 }}
                  groupMode='grouped'
                  colors={{ scheme: 'nivo' }}
                  axisBottom={{
                    legend: 'Year',
                    legendPosition: 'middle',
                    legendOffset: 40,
                  }}
                  axisLeft={{
                    legend: 'Occurrences / 100h',
                    legendPosition: 'middle',
                    legendOffset: -50,
                  }}
                  tooltip={({ id, value, indexValue }) => {
                    const details = detailsByAircraftYear.get(`${id}|${indexValue}`)
                    return (
                      <Box
                        sx={(theme) => ({
                          background: theme.palette.background.paper,
                          color: theme.palette.text.primary,
                          padding: '9px 12px',
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 1,
                        })}
                      >
                        <strong>{id}</strong> — {indexValue}: {value} / 100h
                        {details && (
                          <>
                            <br />
                            {details.occurrenceCount} occurrence
                            {details.occurrenceCount === 1 ? '' : 's'} over{' '}
                            {(details.totalFlightMins / 60).toFixed(1)} flight hours
                          </>
                        )}
                      </Box>
                    )
                  }}
                  theme={nivoTheme}
                />
              ) : (
                <Box
                  sx={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    No data available
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              Safety Performance — Per Aircraft, Per Year
            </Typography>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mb: 2,
              }}
            >
              Occurrence count and flight hours behind each rate
            </Typography>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Aircraft</TableCell>
                  <TableCell>Year</TableCell>
                  <TableCell align='right'>Occurrences</TableCell>
                  <TableCell align='right'>Flight Hours</TableCell>
                  <TableCell align='right'>Occurrences / 100h</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {aircraftRegistrations.flatMap((reg) =>
                  years.map((yr) => {
                    const details = detailsByAircraftYear.get(`${reg}|${yr}`)
                    if (!details) return null
                    return (
                      <TableRow key={`${reg}-${yr}`}>
                        <TableCell>{reg}</TableCell>
                        <TableCell>{yr}</TableCell>
                        <TableCell align='right'>{details.occurrenceCount}</TableCell>
                        <TableCell align='right'>
                          {(details.totalFlightMins / 60).toFixed(1)}
                        </TableCell>
                        <TableCell align='right'>{details.occurrencesPer100h ?? '—'}</TableCell>
                      </TableRow>
                    )
                  }),
                )}
                {aircraftRegistrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        No data available
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </RemoteContent>
    </Box>
  )
}
