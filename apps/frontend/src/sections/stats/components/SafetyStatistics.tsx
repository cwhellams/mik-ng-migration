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
import { useThemeMode } from '../../../theme/ThemeContext'
import { RemoteContent } from '../../../components/RemoteContent'
import type { OccurrencesPerHundredHrsByAcYr } from '@backend/routes/stats/models'

const STATS_YEAR_RANGE = Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

export const SafetyStatistics = () => {
  const { mode } = useThemeMode()

  const currentYear = new Date().getFullYear()
  const yrFrom = currentYear - (STATS_YEAR_RANGE - 1)

  const { data, error, isLoading } = useApi<OccurrencesPerHundredHrsByAcYr[]>(
    {
      url: 'v1/stats/safety/occurrences-per-100h/aircraft/year',
      params: { yr_from: yrFrom, yr_to: currentYear },
    },
    { refreshInterval: 0 },
  )

  // Derived from the safety stats themselves (not a separate aircraft-list call) — the
  // aircraft list endpoint requires aircraft.user/admin permission, which not every
  // member has, while this endpoint is open to any member.
  const aircraftRegistrations = useMemo(() => {
    const registrations = new Set<string>()
    ;(data ?? []).forEach((d) => {
      if (d.aircraft_registration) registrations.add(d.aircraft_registration)
    })
    return Array.from(registrations).sort((a, b) => a.localeCompare(b))
  }, [data])

  const years = useMemo(
    () => Array.from({ length: currentYear - yrFrom + 1 }, (_, i) => yrFrom + i),
    [yrFrom, currentYear],
  )

  const nivoTheme = useMemo(
    () => ({
      axis: {
        ticks: {
          text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
          line: { stroke: mode === 'dark' ? '#888888' : '#777777' },
        },
        legend: { text: { fill: mode === 'dark' ? '#cccccc' : '#333333' } },
        domain: { line: { stroke: mode === 'dark' ? '#555555' : '#777777' } },
      },
      legends: { text: { fill: mode === 'dark' ? '#cccccc' : '#333333' } },
      tooltip: {
        container: {
          background: mode === 'dark' ? '#2a2a2a' : '#ffffff',
          color: mode === 'dark' ? '#ffffff' : '#333333',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
        },
      },
      grid: { line: { stroke: mode === 'dark' ? '#444444' : '#dddddd' } },
      labels: { text: { fill: mode === 'dark' ? '#cccccc' : '#333333' } },
    }),
    [mode],
  )

  // One bar-chart row per year, one key per aircraft — occurrences per 100 flight hours.
  const barData = useMemo(() => {
    if (!data) return []

    const byYear = new Map<number, Record<string, number>>()
    data.forEach((d) => {
      if (d.yr == null || d.aircraft_registration == null || d.occurrences_per_100h == null) return
      const row = byYear.get(d.yr) ?? {}
      row[d.aircraft_registration] = d.occurrences_per_100h
      byYear.set(d.yr, row)
    })

    return years.map((yr) => ({ year: String(yr), ...(byYear.get(yr) ?? {}) }))
  }, [data, years])

  // Raw counts per (aircraft, year), used for the chart tooltip and the summary table.
  const detailsByAircraftYear = useMemo(() => {
    const map = new Map<
      string,
      { occurrence_count: number; total_flight_mins: number; occurrences_per_100h: number | null }
    >()
    ;(data ?? []).forEach((d) => {
      if (d.yr == null || d.aircraft_registration == null) return
      map.set(`${d.aircraft_registration}|${d.yr}`, {
        occurrence_count: d.occurrence_count ?? 0,
        total_flight_mins: d.total_flight_mins ?? 0,
        occurrences_per_100h: d.occurrences_per_100h,
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
                            {details.occurrence_count} occurrence
                            {details.occurrence_count === 1 ? '' : 's'} over{' '}
                            {(details.total_flight_mins / 60).toFixed(1)} flight hours
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
                        <TableCell align='right'>{details.occurrence_count}</TableCell>
                        <TableCell align='right'>
                          {(details.total_flight_mins / 60).toFixed(1)}
                        </TableCell>
                        <TableCell align='right'>{details.occurrences_per_100h ?? '—'}</TableCell>
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
