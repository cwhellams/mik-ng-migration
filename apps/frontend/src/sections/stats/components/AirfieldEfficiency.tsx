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
  AirfieldEfficiencyByYr,
  AirfieldEfficiencyByYrMth,
  AirfieldEfficiencyByAcYr,
  AirfieldEfficiencyByAcYrMth,
} from '@backend/routes/stats/models'

type GroupBy = 'overall' | 'aircraft'
type Period = 'year' | 'month'

const STATS_YEAR_RANGE = Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

const CATEGORY_COLORS: Record<string, string> = {
  efnu_efnu_mins: '#4e79a7',
  inbound_outbound_mins: '#f28e2b',
  away_mins: '#e15759',
}

const CATEGORY_LABELS: Record<string, string> = {
  efnu_efnu_mins: 'EFNU–EFNU',
  inbound_outbound_mins: 'Inbound/Outbound',
  away_mins: 'Away',
}

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

const formatHours = (mins: number | null) => {
  if (mins == null) return '—'
  return `${(mins / 60).toFixed(1)}h`
}

export const AirfieldEfficiency = () => {
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
  } = useApi<AirfieldEfficiencyByYr[]>(
    {
      url: 'v1/stats/airfield-efficiency/year',
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
  } = useApi<AirfieldEfficiencyByYrMth[]>(
    {
      url: 'v1/stats/airfield-efficiency/year/month',
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
  } = useApi<AirfieldEfficiencyByAcYr[]>(
    {
      url: 'v1/stats/airfield-efficiency/aircraft/year',
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
  } = useApi<AirfieldEfficiencyByAcYrMth[]>(
    {
      url: 'v1/stats/airfield-efficiency/aircraft/year/month',
      params: { yr_from: yrFrom, yr_to: yrTo },
      skipFetch: groupBy !== 'aircraft' || period !== 'month',
    },
    { refreshInterval: 0 },
  )

  const last12Months = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  }, [])

  // Build overall year bar data
  const overallYearBarData = useMemo(() => {
    if (!overallByYr) return []
    return overallByYr
      .filter((d) => d.yr != null)
      .map((d) => ({
        period: String(d.yr),
        efnu_efnu_mins: Number(d.efnu_efnu_mins ?? 0),
        inbound_outbound_mins: Number(d.inbound_outbound_mins ?? 0),
        away_mins: Number(d.away_mins ?? 0),
      }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [overallByYr])

  // Build overall month bar data
  const overallMonthBarData = useMemo(() => {
    if (!overallByYrMth) return []
    const byPeriod = new Map<
      string,
      { efnu_efnu_mins: number; inbound_outbound_mins: number; away_mins: number }
    >()
    overallByYrMth
      .filter((d) => d.yr != null && d.mth != null)
      .forEach((d) => {
        const p = `${d.yr}-${String(d.mth).padStart(2, '0')}`
        if (!last12Months.includes(p)) return
        byPeriod.set(p, {
          efnu_efnu_mins: Number(d.efnu_efnu_mins ?? 0),
          inbound_outbound_mins: Number(d.inbound_outbound_mins ?? 0),
          away_mins: Number(d.away_mins ?? 0),
        })
      })
    return last12Months.map((p) => ({
      period: p,
      ...(byPeriod.get(p) ?? { efnu_efnu_mins: 0, inbound_outbound_mins: 0, away_mins: 0 }),
    }))
  }, [overallByYrMth, last12Months])

  // Build aircraft year bar data — stacked per year, split by ac
  const aircraftYearBarData = useMemo(() => {
    if (!byAcYr) return []
    const grouped = new Map<string, Record<string, number | string>>()
    byAcYr
      .filter((d) => d.yr != null && d.aircraft_registration != null)
      .forEach((d) => {
        const p = String(d.yr)
        if (!grouped.has(p)) grouped.set(p, { period: p })
        const row = grouped.get(p)!
        const ac = d.aircraft_registration!
        row[`${ac}_efnu_efnu`] = Number(d.efnu_efnu_mins ?? 0)
        row[`${ac}_inbound_outbound`] = Number(d.inbound_outbound_mins ?? 0)
        row[`${ac}_away`] = Number(d.away_mins ?? 0)
      })
    return Array.from(grouped.values()).sort((a, b) =>
      String(a.period).localeCompare(String(b.period)),
    )
  }, [byAcYr])

  // Build aircraft month bar data
  const aircraftMonthBarData = useMemo(() => {
    if (!byAcYrMth) return []
    const grouped = new Map<string, Record<string, number | string>>()
    byAcYrMth
      .filter((d) => d.yr != null && d.mth != null && d.aircraft_registration != null)
      .forEach((d) => {
        const p = `${d.yr}-${String(d.mth).padStart(2, '0')}`
        if (!last12Months.includes(p)) return
        if (!grouped.has(p)) grouped.set(p, { period: p })
        const row = grouped.get(p)!
        const ac = d.aircraft_registration!
        row[`${ac}_efnu_efnu`] = Number(d.efnu_efnu_mins ?? 0)
        row[`${ac}_inbound_outbound`] = Number(d.inbound_outbound_mins ?? 0)
        row[`${ac}_away`] = Number(d.away_mins ?? 0)
      })
    return last12Months.map((p) => ({
      period: p,
      ...(grouped.get(p) ?? {}),
    }))
  }, [byAcYrMth, last12Months])

  // Keys for aircraft bar charts
  const aircraftKeys = useMemo(() => {
    const data = period === 'year' ? byAcYr : byAcYrMth
    if (!data) return []
    const registrations = new Set<string>()
    data.forEach((d) => {
      if (d.aircraft_registration) registrations.add(d.aircraft_registration)
    })
    return Array.from(registrations)
      .sort()
      .flatMap((ac) => [`${ac}_efnu_efnu`, `${ac}_inbound_outbound`, `${ac}_away`])
  }, [byAcYr, byAcYrMth, period])

  // Summary chips — totals for selected period (overall only)
  const allTimeSummary = useMemo(() => {
    if (!overallByYr || overallByYr.length === 0) return null
    const efnu = overallByYr.reduce((s, d) => s + Number(d.efnu_efnu_mins ?? 0), 0)
    const io = overallByYr.reduce((s, d) => s + Number(d.inbound_outbound_mins ?? 0), 0)
    const away = overallByYr.reduce((s, d) => s + Number(d.away_mins ?? 0), 0)
    const total = efnu + io + away
    if (total === 0) return null
    return {
      efnu_pct: Math.round((efnu / total) * 100),
      io_pct: Math.round((io / total) * 100),
      away_pct: Math.round((away / total) * 100),
      efnu_hrs: (efnu / 60).toFixed(1),
      io_hrs: (io / 60).toFixed(1),
      away_hrs: (away / 60).toFixed(1),
    }
  }, [overallByYr])

  const isLoading = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallByYrLoading : overallByYrMthLoading
    return period === 'year' ? byAcYrLoading : byAcYrMthLoading
  })()

  const error = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallByYrError : overallByYrMthError
    return period === 'year' ? byAcYrError : byAcYrMthError
  })()

  const barData = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallYearBarData : overallMonthBarData
    return period === 'year' ? aircraftYearBarData : aircraftMonthBarData
  })()

  const barKeys =
    groupBy === 'overall' ? ['efnu_efnu_mins', 'inbound_outbound_mins', 'away_mins'] : aircraftKeys

  const barColors = (bar: { id: string | number }) => {
    const key = String(bar.id)
    if (key.endsWith('_efnu_efnu')) return CATEGORY_COLORS['efnu_efnu_mins']
    if (key.endsWith('_inbound_outbound')) return CATEGORY_COLORS['inbound_outbound_mins']
    if (key.endsWith('_away')) return CATEGORY_COLORS['away_mins']
    return CATEGORY_COLORS[key] ?? '#888888'
  }

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
      {/* All-time split summary */}
      {groupBy === 'overall' && period === 'year' && allTimeSummary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant='h4' sx={{ color: CATEGORY_COLORS['efnu_efnu_mins'] }}>
                  {allTimeSummary.efnu_pct}%
                </Typography>
                <Typography variant='subtitle1'>EFNU–EFNU</Typography>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {allTimeSummary.efnu_hrs} hrs
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant='h4' sx={{ color: CATEGORY_COLORS['inbound_outbound_mins'] }}>
                  {allTimeSummary.io_pct}%
                </Typography>
                <Typography variant='subtitle1'>Inbound / Outbound</Typography>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {allTimeSummary.io_hrs} hrs
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant='h4' sx={{ color: CATEGORY_COLORS['away_mins'] }}>
                  {allTimeSummary.away_pct}%
                </Typography>
                <Typography variant='subtitle1'>Away</Typography>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {allTimeSummary.away_hrs} hrs
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      {/* Legend chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            size='small'
            sx={{ backgroundColor: CATEGORY_COLORS[key], color: '#fff' }}
          />
        ))}
      </Box>
      {/* Stacked bar chart */}
      <RemoteContent isLoading={isLoading} error={error}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              Airfield Efficiency {groupBy === 'aircraft' ? 'by Aircraft' : ''} (
              {period === 'year' ? 'Yearly' : 'Last 12 Months'})
            </Typography>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mb: 2,
              }}
            >
              Flight hours split by departure/arrival airport category
            </Typography>
            <Box sx={{ height: 400 }}>
              {barData.length > 0 ? (
                <ResponsiveBar
                  data={barData}
                  keys={barKeys}
                  indexBy='period'
                  margin={{ top: 20, right: 160, bottom: 60, left: 70 }}
                  padding={0.3}
                  valueScale={{ type: 'linear', min: 0 }}
                  groupMode='stacked'
                  colors={barColors}
                  borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
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
                    legend: 'Flight Time (hours)',
                    legendPosition: 'middle',
                    legendOffset: -60,
                    format: (v) => (Number(v) / 60).toFixed(0),
                  }}
                  labelSkipWidth={16}
                  labelSkipHeight={16}
                  label={(d) => formatHours(Number(d.value ?? 0))}
                  labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                  tooltip={({ id, value, indexValue }) => {
                    const label = (() => {
                      const key = String(id)
                      if (key.endsWith('_efnu_efnu'))
                        return `EFNU–EFNU (${key.split('_efnu_efnu')[0]})`
                      if (key.endsWith('_inbound_outbound'))
                        return `Inbound/Outbound (${key.split('_inbound_outbound')[0]})`
                      if (key.endsWith('_away')) return `Away (${key.split('_away')[0]})`
                      return CATEGORY_LABELS[key] ?? key
                    })()
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
                        <strong>{indexValue}</strong> — {label}: {formatHours(Number(value ?? 0))}
                      </Box>
                    )
                  }}
                  theme={nivoTheme}
                  legends={
                    groupBy === 'overall'
                      ? [
                          {
                            dataFrom: 'keys',
                            anchor: 'bottom-right',
                            direction: 'column',
                            justify: false,
                            translateX: 150,
                            translateY: 0,
                            itemsSpacing: 2,
                            itemWidth: 140,
                            itemHeight: 20,
                            itemDirection: 'left-to-right',
                            itemOpacity: 0.85,
                            symbolSize: 12,
                            data: Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
                              id: key,
                              label,
                              color: CATEGORY_COLORS[key],
                            })),
                          },
                        ]
                      : []
                  }
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
      </RemoteContent>
    </Box>
  )
}
