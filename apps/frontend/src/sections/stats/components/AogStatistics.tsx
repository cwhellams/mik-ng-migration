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
import { RemoteContent } from '../../../components/RemoteContent'
import type { AogDaysByAcYr, AogDaysByAcYrMth } from '@backend/routes/stats/models'

const STATS_YEAR_RANGE = Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

export const AogStatistics = () => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const { yrFrom } = useMemo(
    () => ({ yrFrom: currentYear - (STATS_YEAR_RANGE - 1) }),
    [currentYear],
  )

  const last12Months = useMemo(() => {
    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const monthlyYrFrom = Number(last12Months[0].split('-')[0])

  const {
    data: monthlyData,
    error: monthlyError,
    isLoading: monthlyLoading,
  } = useApi<AogDaysByAcYrMth[]>(
    {
      url: 'v1/stats/aog/aircraft/year/month',
      params: { yr_from: monthlyYrFrom, yr_to: currentYear },
    },
    { refreshInterval: 0 },
  )

  const {
    data: yearlyData,
    error: yearlyError,
    isLoading: yearlyLoading,
  } = useApi<AogDaysByAcYr[]>(
    {
      url: 'v1/stats/aog/aircraft/year',
      params: { yr_from: yrFrom, yr_to: currentYear },
    },
    { refreshInterval: 0 },
  )

  // Derived from the AOG stats themselves (not a separate aircraft-list call) — the
  // aircraft list endpoint requires aircraft.user/admin permission, which not every
  // member has, while the AOG stats endpoints are open to any member.
  const aircraftRegistrations = useMemo(() => {
    const registrations = new Set<string>()
    ;(yearlyData ?? []).forEach((d) => {
      if (d.aircraft_registration) registrations.add(d.aircraft_registration)
    })
    ;(monthlyData ?? []).forEach((d) => {
      if (d.aircraft_registration) registrations.add(d.aircraft_registration)
    })
    return Array.from(registrations).sort((a, b) => a.localeCompare(b))
  }, [yearlyData, monthlyData])

  const nivoTheme = useNivoTheme()

  // One bar-chart row per month, one key per active aircraft — mirrors the aircraft
  // flight-time bar chart's grouped-by-year shape, just grouped by month instead.
  const monthlyBarData = useMemo(() => {
    if (!monthlyData) return []

    const byMonth = new Map<string, Record<string, number>>()
    monthlyData.forEach((d) => {
      if (d.yr == null || d.mth == null || d.aircraft_registration == null) return
      const key = `${d.yr}-${String(d.mth).padStart(2, '0')}`
      if (!last12Months.includes(key)) return
      const row = byMonth.get(key) ?? {}
      row[d.aircraft_registration] = d.total_aog_days
      byMonth.set(key, row)
    })

    return last12Months.map((month) => ({ month, ...(byMonth.get(month) ?? {}) }))
  }, [monthlyData, last12Months])

  // Reason breakdown per (aircraft, month), used only for the chart tooltip.
  const reasonByAircraftMonth = useMemo(() => {
    const map = new Map<string, { maintenance_days: number; unserviceable_days: number }>()
    ;(monthlyData ?? []).forEach((d) => {
      if (d.yr == null || d.mth == null || d.aircraft_registration == null) return
      const key = `${d.aircraft_registration}|${d.yr}-${String(d.mth).padStart(2, '0')}`
      map.set(key, {
        maintenance_days: d.maintenance_days,
        unserviceable_days: d.unserviceable_days,
      })
    })
    return map
  }, [monthlyData])

  // YTD per aircraft = sum of this year's months up to and including the current month
  // (the yearly view has no date cut-off, so a scheduled future maintenance booking
  // wouldn't otherwise be excluded from "year to date").
  const ytdByAircraft = useMemo(() => {
    const totals = new Map<
      string,
      { maintenance_days: number; unserviceable_days: number; total_aog_days: number }
    >()
    ;(monthlyData ?? [])
      .filter((d) => d.yr === currentYear && d.mth != null && d.mth <= currentMonth)
      .forEach((d) => {
        if (!d.aircraft_registration) return
        const existing = totals.get(d.aircraft_registration) ?? {
          maintenance_days: 0,
          unserviceable_days: 0,
          total_aog_days: 0,
        }
        existing.maintenance_days += d.maintenance_days
        existing.unserviceable_days += d.unserviceable_days
        existing.total_aog_days += d.total_aog_days
        totals.set(d.aircraft_registration, existing)
      })
    return totals
  }, [monthlyData, currentYear, currentMonth])

  // Previous (fully completed) years' totals per aircraft
  const previousYears = useMemo(
    () => Array.from({ length: currentYear - yrFrom }, (_, i) => yrFrom + i),
    [yrFrom, currentYear],
  )

  const yearlyByAircraftYear = useMemo(() => {
    const map = new Map<string, number>()
    ;(yearlyData ?? []).forEach((d) => {
      if (!d.aircraft_registration || d.yr == null) return
      map.set(`${d.aircraft_registration}|${d.yr}`, d.total_aog_days)
    })
    return map
  }, [yearlyData])

  return (
    <Box>
      <RemoteContent isLoading={monthlyLoading} error={monthlyError}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              AOG Days per Month (Last 12 Months)
            </Typography>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mb: 2,
              }}
            >
              Days each aircraft was in maintenance or had an outstanding defect
            </Typography>
            <Box sx={{ height: 400 }}>
              {monthlyBarData.length > 0 && aircraftRegistrations.length > 0 ? (
                <ResponsiveBar
                  data={monthlyBarData}
                  keys={aircraftRegistrations}
                  indexBy='month'
                  margin={{ top: 20, right: 130, bottom: 50, left: 60 }}
                  padding={0.3}
                  valueScale={{ type: 'linear', min: 0 }}
                  groupMode='grouped'
                  colors={{ scheme: 'nivo' }}
                  axisBottom={{
                    tickRotation: -45,
                    legend: 'Month',
                    legendPosition: 'middle',
                    legendOffset: 40,
                  }}
                  axisLeft={{
                    legend: 'AOG Days',
                    legendPosition: 'middle',
                    legendOffset: -50,
                  }}
                  tooltip={({ id, value, indexValue }) => {
                    const reason = reasonByAircraftMonth.get(`${id}|${indexValue}`)
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
                        <strong>{id}</strong> — {indexValue}: {value} day{value === 1 ? '' : 's'}
                        {reason && (
                          <>
                            <br />
                            Maintenance: {reason.maintenance_days}, Unserviceable:{' '}
                            {reason.unserviceable_days}
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
      </RemoteContent>
      <RemoteContent isLoading={yearlyLoading} error={yearlyError}>
        <Card>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              AOG Days — Year to Date &amp; Previous Years
            </Typography>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mb: 2,
              }}
            >
              Per aircraft; YTD breaks down maintenance vs. unserviceable days
            </Typography>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Aircraft</TableCell>
                  <TableCell align='right'>YTD ({currentYear})</TableCell>
                  {previousYears.map((yr) => (
                    <TableCell key={yr} align='right'>
                      {yr}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {aircraftRegistrations.map((reg) => {
                  const ytd = ytdByAircraft.get(reg)
                  return (
                    <TableRow key={reg}>
                      <TableCell>{reg}</TableCell>
                      <TableCell align='right'>
                        {ytd
                          ? `${ytd.total_aog_days} (M: ${ytd.maintenance_days}, U: ${ytd.unserviceable_days})`
                          : 0}
                      </TableCell>
                      {previousYears.map((yr) => (
                        <TableCell key={yr} align='right'>
                          {yearlyByAircraftYear.get(`${reg}|${yr}`) ?? 0}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
                {aircraftRegistrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2 + previousYears.length}>
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
