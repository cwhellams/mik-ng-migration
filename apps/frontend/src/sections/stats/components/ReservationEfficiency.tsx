import { useState, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
  Chip,
} from '@mui/material'
import { ResponsiveBar } from '@nivo/bar'
import useApi from '../../../hooks/useApi'
import { useThemeMode } from '../../../theme/ThemeContext'
import { RemoteContent } from '../../../components/RemoteContent'
import type {
  ReservationEfficiencyByYr,
  ReservationEfficiencyByYrMth,
  ReservationEfficiencyByAcYr,
  ReservationEfficiencyByAcYrMth,
  ReservationEfficiencyByMemberYr,
  ReservationEfficiencyByMemberYrMth,
} from '@backend/routes/stats/models'

type GroupBy = 'overall' | 'aircraft' | 'member'
type Period = 'year' | 'month'

const STATS_YEAR_RANGE = Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

const getYearRange = () => {
  const currentYear = new Date().getFullYear()
  return { yrFrom: currentYear - (STATS_YEAR_RANGE - 1), yrTo: currentYear }
}

const getMonthlyRange = () => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const from = currentMonth === 12 ? currentYear : currentYear - 1
  return { yrFrom: from, yrTo: currentYear }
}

const formatEfficiency = (pct: number | null) => {
  if (pct == null) return '—'
  return `${Number(pct).toFixed(1)}%`
}

const getEfficiencyColor = (pct: number | null) => {
  if (pct == null) return 'default' as const
  if (pct >= 75) return 'success' as const
  if (pct >= 50) return 'warning' as const
  return 'error' as const
}

export const ReservationEfficiency = () => {
  const { mode } = useThemeMode()
  const [groupBy, setGroupBy] = useState<GroupBy>('overall')
  const [period, setPeriod] = useState<Period>('year')

  const { yrFrom, yrTo } = useMemo(
    () => (period === 'year' ? getYearRange() : getMonthlyRange()),
    [period],
  )

  const nivoTheme = useMemo(
    () => ({
      axis: {
        ticks: {
          text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
          line: { stroke: mode === 'dark' ? '#888888' : '#777777' },
        },
        legend: {
          text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
        },
        domain: {
          line: { stroke: mode === 'dark' ? '#555555' : '#777777' },
        },
      },
      legends: {
        text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
      },
      tooltip: {
        container: {
          background: mode === 'dark' ? '#2a2a2a' : '#ffffff',
          color: mode === 'dark' ? '#ffffff' : '#333333',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
        },
      },
      grid: {
        line: { stroke: mode === 'dark' ? '#444444' : '#dddddd' },
      },
      labels: {
        text: { fill: mode === 'dark' ? '#cccccc' : '#333333' },
      },
    }),
    [mode],
  )

  // Overall by year
  const {
    data: overallByYr,
    error: overallByYrError,
    isLoading: overallByYrLoading,
  } = useApi<ReservationEfficiencyByYr[]>(
    {
      url: 'v1/stats/reservation-efficiency/year',
      params: { yr_from: yrFrom, yr_to: yrTo },
      skipFetch: groupBy !== 'overall' || period !== 'year',
    },
    { refreshInterval: 0 },
  )

  // Overall by year/month
  const {
    data: overallByYrMth,
    error: overallByYrMthError,
    isLoading: overallByYrMthLoading,
  } = useApi<ReservationEfficiencyByYrMth[]>(
    {
      url: 'v1/stats/reservation-efficiency/year/month',
      params: { yr_from: yrFrom, yr_to: yrTo },
      skipFetch: groupBy !== 'overall' || period !== 'month',
    },
    { refreshInterval: 0 },
  )

  // By aircraft, year
  const {
    data: byAcYr,
    error: byAcYrError,
    isLoading: byAcYrLoading,
  } = useApi<ReservationEfficiencyByAcYr[]>(
    {
      url: 'v1/stats/reservation-efficiency/aircraft/year',
      params: { yr_from: yrFrom, yr_to: yrTo },
      skipFetch: groupBy !== 'aircraft' || period !== 'year',
    },
    { refreshInterval: 0 },
  )

  // By aircraft, year/month
  const {
    data: byAcYrMth,
    error: byAcYrMthError,
    isLoading: byAcYrMthLoading,
  } = useApi<ReservationEfficiencyByAcYrMth[]>(
    {
      url: 'v1/stats/reservation-efficiency/aircraft/year/month',
      params: { yr_from: yrFrom, yr_to: yrTo },
      skipFetch: groupBy !== 'aircraft' || period !== 'month',
    },
    { refreshInterval: 0 },
  )

  // By member, year
  const {
    data: byMemberYr,
    error: byMemberYrError,
    isLoading: byMemberYrLoading,
  } = useApi<ReservationEfficiencyByMemberYr[]>(
    {
      url: 'v1/stats/reservation-efficiency/member/year',
      params: { yr_from: yrFrom, yr_to: yrTo },
      skipFetch: groupBy !== 'member' || period !== 'year',
    },
    { refreshInterval: 0 },
  )

  // By member, year/month
  const {
    data: byMemberYrMth,
    error: byMemberYrMthError,
    isLoading: byMemberYrMthLoading,
  } = useApi<ReservationEfficiencyByMemberYrMth[]>(
    {
      url: 'v1/stats/reservation-efficiency/member/year/month',
      params: { yr_from: yrFrom, yr_to: yrTo },
      skipFetch: groupBy !== 'member' || period !== 'month',
    },
    { refreshInterval: 0 },
  )

  // Build bar chart data for overall by year
  const overallYearBarData = useMemo(() => {
    if (!overallByYr) return []
    return overallByYr
      .filter((d) => d.yr != null)
      .map((d) => ({
        period: String(d.yr),
        efficiency_pct: Number(d.efficiency_pct ?? 0),
        flight_mins: Number(d.total_flight_mins ?? 0),
        reserved_mins: Number(d.total_reserved_mins ?? 0),
      }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [overallByYr])

  // Build bar chart data for overall by month
  const overallMonthBarData = useMemo(() => {
    if (!overallByYrMth) return []
    const now = new Date()
    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return overallByYrMth
      .filter((d) => d.yr != null && d.mth != null)
      .map((d) => ({
        period: `${d.yr}-${String(d.mth).padStart(2, '0')}`,
        efficiency_pct: Number(d.efficiency_pct ?? 0),
        flight_mins: Number(d.total_flight_mins ?? 0),
        reserved_mins: Number(d.total_reserved_mins ?? 0),
      }))
      .filter((d) => last12Months.includes(d.period))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [overallByYrMth])

  // Build bar chart data for aircraft by year
  const aircraftYearBarData = useMemo(() => {
    if (!byAcYr) return []
    const grouped = new Map<string, { period: string; [ac: string]: number | string }>()
    byAcYr
      .filter((d) => d.yr != null && d.aircraft_registration != null)
      .forEach((d) => {
        const period = String(d.yr)
        if (!grouped.has(period)) grouped.set(period, { period })
        grouped.get(period)![d.aircraft_registration!] = Number(d.efficiency_pct ?? 0)
      })
    return Array.from(grouped.values()).sort((a, b) =>
      String(a.period).localeCompare(String(b.period)),
    )
  }, [byAcYr])

  // Build bar chart data for aircraft by month
  const aircraftMonthBarData = useMemo(() => {
    if (!byAcYrMth) return []
    const now = new Date()
    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const grouped = new Map<string, { period: string; [ac: string]: number | string }>()
    byAcYrMth
      .filter((d) => d.yr != null && d.mth != null && d.aircraft_registration != null)
      .forEach((d) => {
        const period = `${d.yr}-${String(d.mth).padStart(2, '0')}`
        if (!last12Months.includes(period)) return
        if (!grouped.has(period)) grouped.set(period, { period })
        grouped.get(period)![d.aircraft_registration!] = Number(d.efficiency_pct ?? 0)
      })
    return last12Months
      .map((p) => grouped.get(p) ?? { period: p })
      .filter((d): d is { period: string; [ac: string]: number | string } => d != null)
  }, [byAcYrMth])

  // Aircraft keys for bar chart
  const aircraftKeys = useMemo(() => {
    const data = period === 'year' ? byAcYr : byAcYrMth
    if (!data) return []
    const keys = new Set<string>()
    data.forEach((d) => {
      if (d.aircraft_registration) keys.add(d.aircraft_registration)
    })
    return Array.from(keys).sort()
  }, [byAcYr, byAcYrMth, period])

  // Member by year - summary table data (top 20 by efficiency)
  const memberYearTableData = useMemo(() => {
    if (!byMemberYr) return []
    const currentYear = new Date().getFullYear()
    return byMemberYr
      .filter((d) => d.yr === currentYear && d.member != null)
      .sort((a, b) => Number(b.efficiency_pct ?? 0) - Number(a.efficiency_pct ?? 0))
      .slice(0, 20)
      .map((d) => ({
        member: d.member!.substring(0, 8),
        efficiency_pct: Number(d.efficiency_pct ?? 0),
        flight_mins: Number(d.total_flight_mins ?? 0),
        reserved_mins: Number(d.total_reserved_mins ?? 0),
      }))
  }, [byMemberYr])

  // Member by month - bar chart data for current year
  const memberMonthBarData = useMemo(() => {
    if (!byMemberYrMth) return []
    const now = new Date()
    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    // Aggregate all members into single overall efficiency per month
    const monthMap = new Map<string, { flight: number; reserved: number }>()
    byMemberYrMth
      .filter((d) => d.yr != null && d.mth != null)
      .forEach((d) => {
        const period = `${d.yr}-${String(d.mth).padStart(2, '0')}`
        if (!last12Months.includes(period)) return
        const existing = monthMap.get(period) ?? { flight: 0, reserved: 0 }
        monthMap.set(period, {
          flight: existing.flight + Number(d.total_flight_mins ?? 0),
          reserved: existing.reserved + Number(d.total_reserved_mins ?? 0),
        })
      })
    return last12Months.map((period) => {
      const totals = monthMap.get(period)
      const efficiency =
        totals && totals.reserved > 0
          ? Math.round((totals.flight / totals.reserved) * 100 * 100) / 100
          : 0
      return { period, efficiency_pct: efficiency }
    })
  }, [byMemberYrMth])

  // Determine current loading/error state
  const isLoading = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallByYrLoading : overallByYrMthLoading
    if (groupBy === 'aircraft') return period === 'year' ? byAcYrLoading : byAcYrMthLoading
    return period === 'year' ? byMemberYrLoading : byMemberYrMthLoading
  })()

  const error = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallByYrError : overallByYrMthError
    if (groupBy === 'aircraft') return period === 'year' ? byAcYrError : byAcYrMthError
    return period === 'year' ? byMemberYrError : byMemberYrMthError
  })()

  // Overall summary card data
  const allTimeEfficiency = useMemo(() => {
    if (!overallByYr || overallByYr.length === 0) return null
    const totalFlight = overallByYr.reduce((sum, d) => sum + Number(d.total_flight_mins ?? 0), 0)
    const totalReserved = overallByYr.reduce(
      (sum, d) => sum + Number(d.total_reserved_mins ?? 0),
      0,
    )
    if (totalReserved === 0) return 0
    return Math.round((totalFlight / totalReserved) * 100 * 100) / 100
  }, [overallByYr])

  const barData = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallYearBarData : overallMonthBarData
    if (groupBy === 'aircraft')
      return period === 'year' ? aircraftYearBarData : aircraftMonthBarData
    return period === 'year' ? [] : memberMonthBarData
  })()

  const barKeys = (() => {
    if (groupBy === 'aircraft') return aircraftKeys
    return ['efficiency_pct']
  })()

  return (
    <Box>
      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant='subtitle2' gutterBottom>
                Group By
              </Typography>
              <ToggleButtonGroup
                value={groupBy}
                exclusive
                onChange={(_, v) => v && setGroupBy(v)}
                size='small'
                fullWidth
              >
                <ToggleButton value='overall'>Overall</ToggleButton>
                <ToggleButton value='aircraft'>Aircraft</ToggleButton>
                <ToggleButton value='member'>Member</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant='subtitle2' gutterBottom>
                Period
              </Typography>
              <ToggleButtonGroup
                value={period}
                exclusive
                onChange={(_, v) => v && setPeriod(v)}
                size='small'
                fullWidth
              >
                <ToggleButton value='year'>By Year</ToggleButton>
                <ToggleButton value='month'>By Month (Last 12)</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {/* All-time summary (overall only) */}
      {groupBy === 'overall' && period === 'year' && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant='h3' color='primary'>
                  {allTimeEfficiency != null ? `${Number(allTimeEfficiency).toFixed(1)}%` : '—'}
                </Typography>
                <Typography
                  variant='subtitle1'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  All-time Reservation Efficiency
                </Typography>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  Logged airtime / Reserved time
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      {/* Bar chart for overall and aircraft groupings */}
      {groupBy !== 'member' && (
        <RemoteContent isLoading={isLoading} error={error}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant='h6' gutterBottom>
                Reservation Efficiency {groupBy === 'aircraft' ? 'by Aircraft' : ''} (
                {period === 'year' ? 'Yearly' : 'Last 12 Months'})
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                Efficiency % = logged airtime / reserved time × 100
              </Typography>
              <Box sx={{ height: 400 }}>
                {barData.length > 0 ? (
                  <ResponsiveBar
                    data={barData}
                    keys={barKeys}
                    indexBy='period'
                    margin={{ top: 20, right: 130, bottom: 60, left: 60 }}
                    padding={0.3}
                    valueScale={{ type: 'linear', min: 0, max: 100 }}
                    groupMode={groupBy === 'aircraft' ? 'grouped' : 'stacked'}
                    colors={{ scheme: 'set2' }}
                    borderColor={{
                      from: 'color',
                      modifiers: [['darker', 1.6]],
                    }}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: period === 'month' ? -45 : 0,
                      legend: period === 'year' ? 'Year' : 'Month',
                      legendPosition: 'middle',
                      legendOffset: period === 'month' ? 50 : 40,
                    }}
                    axisLeft={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: 0,
                      legend: 'Efficiency (%)',
                      legendPosition: 'middle',
                      legendOffset: -50,
                    }}
                    labelSkipWidth={12}
                    labelSkipHeight={12}
                    labelTextColor={{
                      from: 'color',
                      modifiers: [['darker', 1.6]],
                    }}
                    label={(d) => `${Number(d.value ?? 0).toFixed(1)}%`}
                    tooltip={({ id, value, indexValue }) => (
                      <Box
                        sx={(theme) => ({
                          background: theme.palette.background.paper,
                          color: theme.palette.text.primary,
                          padding: '9px 12px',
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 1,
                        })}
                      >
                        <strong>{indexValue}</strong>
                        {groupBy === 'aircraft' && ` — ${id}`}: {Number(value ?? 0).toFixed(1)}%
                      </Box>
                    )}
                    theme={nivoTheme}
                    legends={
                      groupBy === 'aircraft'
                        ? [
                            {
                              dataFrom: 'keys',
                              anchor: 'bottom-right',
                              direction: 'column',
                              justify: false,
                              translateX: 120,
                              translateY: 0,
                              itemsSpacing: 2,
                              itemWidth: 100,
                              itemHeight: 20,
                              itemDirection: 'left-to-right',
                              itemOpacity: 0.85,
                              symbolSize: 20,
                            },
                          ]
                        : []
                    }
                  />
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
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
        </RemoteContent>
      )}
      {/* Member view */}
      {groupBy === 'member' && period === 'year' && (
        <RemoteContent isLoading={byMemberYrLoading} error={byMemberYrError}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant='h6' gutterBottom>
                Reservation Efficiency by Member — Current Year (Top 20)
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                Members are anonymized. Sorted by efficiency descending.
              </Typography>
              {memberYearTableData.length > 0 ? (
                <Box sx={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '8px',
                            borderBottom: '1px solid #ccc',
                          }}
                        >
                          Member (anon)
                        </th>
                        <th
                          style={{
                            textAlign: 'right',
                            padding: '8px',
                            borderBottom: '1px solid #ccc',
                          }}
                        >
                          Flight (min)
                        </th>
                        <th
                          style={{
                            textAlign: 'right',
                            padding: '8px',
                            borderBottom: '1px solid #ccc',
                          }}
                        >
                          Reserved (min)
                        </th>
                        <th
                          style={{
                            textAlign: 'right',
                            padding: '8px',
                            borderBottom: '1px solid #ccc',
                          }}
                        >
                          Efficiency
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberYearTableData.map((row) => (
                        <tr key={row.member}>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{row.member}…</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            {Math.round(row.flight_mins)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            {Math.round(row.reserved_mins)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            <Chip
                              label={formatEfficiency(row.efficiency_pct)}
                              color={getEfficiencyColor(row.efficiency_pct)}
                              size='small'
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              ) : (
                <Typography
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  No data available
                </Typography>
              )}
            </CardContent>
          </Card>
        </RemoteContent>
      )}
      {groupBy === 'member' && period === 'month' && (
        <RemoteContent isLoading={byMemberYrMthLoading} error={byMemberYrMthError}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant='h6' gutterBottom>
                Reservation Efficiency by Member — Monthly (Last 12 Months)
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                Aggregated across all members per month.
              </Typography>
              <Box sx={{ height: 400 }}>
                {memberMonthBarData.some((d) => d.efficiency_pct > 0) ? (
                  <ResponsiveBar
                    data={memberMonthBarData}
                    keys={['efficiency_pct']}
                    indexBy='period'
                    margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
                    padding={0.3}
                    valueScale={{ type: 'linear', min: 0, max: 100 }}
                    colors={{ scheme: 'set2' }}
                    borderColor={{
                      from: 'color',
                      modifiers: [['darker', 1.6]],
                    }}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: -45,
                      legend: 'Month',
                      legendPosition: 'middle',
                      legendOffset: 50,
                    }}
                    axisLeft={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: 0,
                      legend: 'Efficiency (%)',
                      legendPosition: 'middle',
                      legendOffset: -50,
                    }}
                    labelSkipWidth={12}
                    labelSkipHeight={12}
                    labelTextColor={{
                      from: 'color',
                      modifiers: [['darker', 1.6]],
                    }}
                    label={(d) => `${Number(d.value ?? 0).toFixed(1)}%`}
                    theme={nivoTheme}
                  />
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
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
        </RemoteContent>
      )}
    </Box>
  )
}
