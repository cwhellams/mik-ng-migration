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
import { useNivoTheme } from '../useNivoTheme'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { wrappingToggleGroupSx } from '../wrappingToggleGroupSx'
import type {
  ReservationEfficiencyByYr,
  ReservationEfficiencyByYrMth,
  ReservationEfficiencyByAcYr,
  ReservationEfficiencyByAcYrMth,
  ReservationEfficiencyByMemberYr,
  ReservationEfficiencyByMemberYrMth,
  SchoolFlightEfficiencyByYr,
  SchoolFlightEfficiencyByYrMth,
  SchoolFlightEfficiencyByAcYr,
  SchoolFlightEfficiencyByAcYrMth,
  SchoolFlightEfficiencyByInstructorYr,
  SchoolFlightEfficiencyByInstructorYrMth,
} from '@mik/contracts/stats'

type FlightScope = 'all' | 'school'
type GroupBy = 'overall' | 'aircraft' | 'member'
type Period = 'year' | 'month'

type OverallRow = ReservationEfficiencyByYr | SchoolFlightEfficiencyByYr
type OverallMthRow = ReservationEfficiencyByYrMth | SchoolFlightEfficiencyByYrMth
type AcRow = ReservationEfficiencyByAcYr | SchoolFlightEfficiencyByAcYr
type AcMthRow = ReservationEfficiencyByAcYrMth | SchoolFlightEfficiencyByAcYrMth
type EntityRow = ReservationEfficiencyByMemberYr | SchoolFlightEfficiencyByInstructorYr
type EntityMthRow = ReservationEfficiencyByMemberYrMth | SchoolFlightEfficiencyByInstructorYrMth

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

// School flight rows report `totalBlockMins` (block time) instead of `totalFlightMins`
// (airtime) — see issue #1081.
const getNumeratorMins = (
  d: OverallRow | OverallMthRow | AcRow | AcMthRow | EntityRow | EntityMthRow,
): number => Number(('totalFlightMins' in d ? d.totalFlightMins : d.totalBlockMins) ?? 0)

// The "by member" dimension becomes "by instructor" for school flights.
const getEntityId = (d: EntityRow | EntityMthRow): string | null =>
  ('member' in d ? d.member : d.instructor) ?? null

export const ReservationEfficiency = () => {
  const [flightScope, setFlightScope] = useState<FlightScope>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('overall')
  const [period, setPeriod] = useState<Period>('year')

  const isSchool = flightScope === 'school'
  const scopeBase = isSchool ? 'school-flight-efficiency' : 'reservation-efficiency'
  const entitySegment = isSchool ? 'instructor' : 'member'
  const entityLabel = isSchool ? 'Instructor' : 'Member'

  const { yrFrom, yrTo } = useMemo(
    () => (period === 'year' ? getYearRange() : getMonthlyRange()),
    [period],
  )

  const nivoTheme = useNivoTheme()

  // Overall by year
  const {
    data: overallByYr,
    error: overallByYrError,
    isLoading: overallByYrLoading,
  } = useApi<OverallRow[]>(
    {
      url: `v1/stats/${scopeBase}/year`,
      params: { yrFrom: yrFrom, yrTo: yrTo },
      skipFetch: groupBy !== 'overall' || period !== 'year',
    },
    { refreshInterval: 0 },
  )

  // Overall by year/month
  const {
    data: overallByYrMth,
    error: overallByYrMthError,
    isLoading: overallByYrMthLoading,
  } = useApi<OverallMthRow[]>(
    {
      url: `v1/stats/${scopeBase}/year/month`,
      params: { yrFrom: yrFrom, yrTo: yrTo },
      skipFetch: groupBy !== 'overall' || period !== 'month',
    },
    { refreshInterval: 0 },
  )

  // By aircraft, year
  const {
    data: byAcYr,
    error: byAcYrError,
    isLoading: byAcYrLoading,
  } = useApi<AcRow[]>(
    {
      url: `v1/stats/${scopeBase}/aircraft/year`,
      params: { yrFrom: yrFrom, yrTo: yrTo },
      skipFetch: groupBy !== 'aircraft' || period !== 'year',
    },
    { refreshInterval: 0 },
  )

  // By aircraft, year/month
  const {
    data: byAcYrMth,
    error: byAcYrMthError,
    isLoading: byAcYrMthLoading,
  } = useApi<AcMthRow[]>(
    {
      url: `v1/stats/${scopeBase}/aircraft/year/month`,
      params: { yrFrom: yrFrom, yrTo: yrTo },
      skipFetch: groupBy !== 'aircraft' || period !== 'month',
    },
    { refreshInterval: 0 },
  )

  // By member/instructor, year
  const {
    data: byEntityYr,
    error: byEntityYrError,
    isLoading: byEntityYrLoading,
  } = useApi<EntityRow[]>(
    {
      url: `v1/stats/${scopeBase}/${entitySegment}/year`,
      params: { yrFrom: yrFrom, yrTo: yrTo },
      skipFetch: groupBy !== 'member' || period !== 'year',
    },
    { refreshInterval: 0 },
  )

  // By member/instructor, year/month
  const {
    data: byEntityYrMth,
    error: byEntityYrMthError,
    isLoading: byEntityYrMthLoading,
  } = useApi<EntityMthRow[]>(
    {
      url: `v1/stats/${scopeBase}/${entitySegment}/year/month`,
      params: { yrFrom: yrFrom, yrTo: yrTo },
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
        efficiencyPct: Number(d.efficiencyPct ?? 0),
        flight_mins: getNumeratorMins(d),
        reserved_mins: Number(d.totalReservedMins ?? 0),
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
        efficiencyPct: Number(d.efficiencyPct ?? 0),
        flight_mins: getNumeratorMins(d),
        reserved_mins: Number(d.totalReservedMins ?? 0),
      }))
      .filter((d) => last12Months.includes(d.period))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [overallByYrMth])

  // Build bar chart data for aircraft by year
  const aircraftYearBarData = useMemo(() => {
    if (!byAcYr) return []
    const grouped = new Map<string, { period: string; [ac: string]: number | string }>()
    byAcYr
      .filter((d) => d.yr != null && d.aircraftRegistration != null)
      .forEach((d) => {
        const period = String(d.yr)
        if (!grouped.has(period)) grouped.set(period, { period })
        grouped.get(period)![d.aircraftRegistration!] = Number(d.efficiencyPct ?? 0)
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
      .filter((d) => d.yr != null && d.mth != null && d.aircraftRegistration != null)
      .forEach((d) => {
        const period = `${d.yr}-${String(d.mth).padStart(2, '0')}`
        if (!last12Months.includes(period)) return
        if (!grouped.has(period)) grouped.set(period, { period })
        grouped.get(period)![d.aircraftRegistration!] = Number(d.efficiencyPct ?? 0)
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
      if (d.aircraftRegistration) keys.add(d.aircraftRegistration)
    })
    return Array.from(keys).sort()
  }, [byAcYr, byAcYrMth, period])

  // Entity (member/instructor) by year - summary table data (top 20 by efficiency)
  const entityYearTableData = useMemo(() => {
    if (!byEntityYr) return []
    const currentYear = new Date().getFullYear()
    return byEntityYr
      .filter((d) => d.yr === currentYear && getEntityId(d) != null)
      .sort((a, b) => Number(b.efficiencyPct ?? 0) - Number(a.efficiencyPct ?? 0))
      .slice(0, 20)
      .map((d) => ({
        entity: getEntityId(d)!.substring(0, 8),
        efficiencyPct: Number(d.efficiencyPct ?? 0),
        flight_mins: getNumeratorMins(d),
        reserved_mins: Number(d.totalReservedMins ?? 0),
      }))
  }, [byEntityYr])

  // Entity (member/instructor) by month - bar chart data for current year
  const entityMonthBarData = useMemo(() => {
    if (!byEntityYrMth) return []
    const now = new Date()
    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    // Aggregate all members/instructors into single overall efficiency per month
    const monthMap = new Map<string, { flight: number; reserved: number }>()
    byEntityYrMth
      .filter((d) => d.yr != null && d.mth != null)
      .forEach((d) => {
        const period = `${d.yr}-${String(d.mth).padStart(2, '0')}`
        if (!last12Months.includes(period)) return
        const existing = monthMap.get(period) ?? { flight: 0, reserved: 0 }
        monthMap.set(period, {
          flight: existing.flight + getNumeratorMins(d),
          reserved: existing.reserved + Number(d.totalReservedMins ?? 0),
        })
      })
    return last12Months.map((period) => {
      const totals = monthMap.get(period)
      const efficiency =
        totals && totals.reserved > 0
          ? Math.round((totals.flight / totals.reserved) * 100 * 100) / 100
          : 0
      return { period, efficiencyPct: efficiency }
    })
  }, [byEntityYrMth])

  // Determine current loading/error state
  const isLoading = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallByYrLoading : overallByYrMthLoading
    if (groupBy === 'aircraft') return period === 'year' ? byAcYrLoading : byAcYrMthLoading
    return period === 'year' ? byEntityYrLoading : byEntityYrMthLoading
  })()

  const error = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallByYrError : overallByYrMthError
    if (groupBy === 'aircraft') return period === 'year' ? byAcYrError : byAcYrMthError
    return period === 'year' ? byEntityYrError : byEntityYrMthError
  })()

  // Overall summary card data
  const allTimeEfficiency = useMemo(() => {
    if (!overallByYr || overallByYr.length === 0) return null
    const totalFlight = overallByYr.reduce((sum, d) => sum + getNumeratorMins(d), 0)
    const totalReserved = overallByYr.reduce((sum, d) => sum + Number(d.totalReservedMins ?? 0), 0)
    if (totalReserved === 0) return 0
    return Math.round((totalFlight / totalReserved) * 100 * 100) / 100
  }, [overallByYr])

  const barData = (() => {
    if (groupBy === 'overall') return period === 'year' ? overallYearBarData : overallMonthBarData
    if (groupBy === 'aircraft')
      return period === 'year' ? aircraftYearBarData : aircraftMonthBarData
    return period === 'year' ? [] : entityMonthBarData
  })()

  const barKeys = (() => {
    if (groupBy === 'aircraft') return aircraftKeys
    return ['efficiencyPct']
  })()

  const reportTitle = isSchool ? 'School Flight Reservation Efficiency' : 'Reservation Efficiency'
  const numeratorLabel = isSchool ? 'block time flown' : 'logged airtime'

  return (
    <Box>
      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant='subtitle2' gutterBottom>
                Flight Type
              </Typography>
              <ToggleButtonGroup
                value={flightScope}
                exclusive
                onChange={(_, v) => v && setFlightScope(v)}
                size='small'
                sx={wrappingToggleGroupSx}
              >
                <ToggleButton value='all'>All Flights</ToggleButton>
                <ToggleButton value='school'>School Flights</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant='subtitle2' gutterBottom>
                Group By
              </Typography>
              <ToggleButtonGroup
                value={groupBy}
                exclusive
                onChange={(_, v) => v && setGroupBy(v)}
                size='small'
                sx={wrappingToggleGroupSx}
              >
                <ToggleButton value='overall'>Overall</ToggleButton>
                <ToggleButton value='aircraft'>Aircraft</ToggleButton>
                <ToggleButton value='member'>{entityLabel}</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant='subtitle2' gutterBottom>
                Period
              </Typography>
              <ToggleButtonGroup
                value={period}
                exclusive
                onChange={(_, v) => v && setPeriod(v)}
                size='small'
                sx={wrappingToggleGroupSx}
              >
                <ToggleButton value='year'>By Year</ToggleButton>
                <ToggleButton value='month'>By Month (Last 12)</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
          </Grid>
          {isSchool && (
            <Typography
              variant='caption'
              sx={{
                display: 'block',
                mt: 1,
                color: 'text.secondary',
              }}
            >
              School flight efficiency is based on block time (off-block to on-block), not flight
              time. Restricted to school/DTO flight logs and TRAINING reservations.
            </Typography>
          )}
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
                  All-time {reportTitle}
                </Typography>
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {numeratorLabel} / Reserved time
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
                {reportTitle} {groupBy === 'aircraft' ? 'by Aircraft' : ''} (
                {period === 'year' ? 'Yearly' : 'Last 12 Months'})
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                Efficiency % = {numeratorLabel} / reserved time × 100
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
      {/* Member/instructor view */}
      {groupBy === 'member' && period === 'year' && (
        <RemoteContent isLoading={byEntityYrLoading} error={byEntityYrError}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant='h6' gutterBottom>
                {reportTitle} by {entityLabel} — Current Year (Top 20)
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                {entityLabel}s are anonymized. Sorted by efficiency descending.
              </Typography>
              {entityYearTableData.length > 0 ? (
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
                          {entityLabel} (anon)
                        </th>
                        <th
                          style={{
                            textAlign: 'right',
                            padding: '8px',
                            borderBottom: '1px solid #ccc',
                          }}
                        >
                          {isSchool ? 'Block (min)' : 'Flight (min)'}
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
                      {entityYearTableData.map((row) => (
                        <tr key={row.entity}>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{row.entity}…</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            {Math.round(row.flight_mins)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            {Math.round(row.reserved_mins)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            <Chip
                              label={formatEfficiency(row.efficiencyPct)}
                              color={getEfficiencyColor(row.efficiencyPct)}
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
        <RemoteContent isLoading={byEntityYrMthLoading} error={byEntityYrMthError}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant='h6' gutterBottom>
                {reportTitle} by {entityLabel} — Monthly (Last 12 Months)
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                Aggregated across all {entityLabel.toLowerCase()}s per month.
              </Typography>
              <Box sx={{ height: 400 }}>
                {entityMonthBarData.some((d) => d.efficiencyPct > 0) ? (
                  <ResponsiveBar
                    data={entityMonthBarData}
                    keys={['efficiencyPct']}
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
