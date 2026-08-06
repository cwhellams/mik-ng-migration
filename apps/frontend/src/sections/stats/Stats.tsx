import { useState, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material'
import { ResponsiveBar } from '@nivo/bar'
import { ResponsiveCalendar } from '@nivo/calendar'
import { ResponsivePie } from '@nivo/pie'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'
import { useThemeMode } from '../../theme/ThemeContext'
import { useNivoTheme } from './useNivoTheme'
import { MIKPermissions } from '@backend/routes/members/models'
import {
  TotalFlightTimeByAcYrFt,
  TotalFlightTimeByPilotYr,
  TotalFlightTimeByAcCalendar,
  TotalFlightTimeByAcYrMth,
  MemberCountByType,
  VisitedAirfieldsByAc,
  CommercialFlightTimeByAcYrMth,
  TotalLandingsByAcYr,
  PobDistributionByAcYr,
} from '@backend/routes/stats/models'
import { RemoteContent } from '../../components/RemoteContent'
import { PilotStatistics as PilotStatisticsView } from './components/PilotStatistics'
import { ReservationEfficiency as ReservationEfficiencyView } from './components/ReservationEfficiency'
import { YearOnYearReport } from './components/YearOnYearReport'

type ViewMode =
  'my' | 'aircraft' | 'pilot' | 'pilots' | 'efficiency' | 'yoy' | 'airfield' | 'aog' | 'safety'

// View modes rendered entirely by their own component, rather than by the
// aircraft/member charts below.
const STANDALONE_VIEW_MODES: ViewMode[] = [
  'my',
  'pilots',
  'efficiency',
  'yoy',
  'airfield',
  'aog',
  'safety',
]

type PobBucketTotals = {
  flightCount: number
  crossCountryFlightCount: number
  totalFlightMins: number
}
import { AirfieldEfficiency as AirfieldEfficiencyView } from './components/AirfieldEfficiency'
import { AogStatistics as AogStatisticsView } from './components/AogStatistics'
import { SafetyStatistics as SafetyStatisticsView } from './components/SafetyStatistics'
import { MyStatistics as MyStatisticsView } from './components/MyStatistics'

const CalendarTooltip = ({ day, value }: { day: string; value: string }) => (
  <Box
    sx={(theme) => ({
      background: theme.palette.background.paper,
      color: theme.palette.text.primary,
      padding: '9px 12px',
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 1,
    })}
  >
    <strong>{day}</strong>: {value ? Number(value).toFixed(1) : 0} hours
  </Box>
)

export const Stats = () => {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<ViewMode>('aircraft')
  const { hasAccess: hasAdminAccess } = useRoles()
  const { sudo, mode } = useThemeMode()

  const nivoTheme = useNivoTheme()

  const arcLinkLabelsTextColor = mode === 'dark' ? '#cccccc' : '#333333'
  const legendHoverTextColor = mode === 'dark' ? '#ffffff' : '#000000'

  // Check if user has admin permissions for commercial data AND is in admin view mode
  const hasCommercialAccess =
    sudo &&
    hasAdminAccess(
      MIKPermissions.FLIGHTLOG_ADMIN,
      MIKPermissions.AIRCRAFT_ADMIN,
      MIKPermissions.INVOICING_ADMIN,
    )

  // Get year range from env var (default 5 years)
  const statsYearRange = Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

  // Calculate year range based on configured value
  const { yrFrom, yrTo } = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const from = currentYear - (statsYearRange - 1)
    return { yrFrom: from, yrTo: currentYear }
  }, [statsYearRange])

  // Calculate date range for calendar (last year and current year)
  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const lastYear = currentYear - 1
    const from = `${lastYear}-01-01`
    const to = now.toISOString().split('T')[0]
    return { dateFrom: from, dateTo: to }
  }, [])

  // Fetch aircraft data
  const {
    data: aircraftYearlyData,
    error: aircraftError,
    isLoading: aircraftLoading,
  } = useApi<TotalFlightTimeByAcYrFt[]>(
    {
      url: 'v1/stats/flight-time/aircraft/year',
      params: {
        yr_from: yrFrom,
        yr_to: yrTo,
      },
    },
    {
      refreshInterval: 0,
    },
  )

  // Fetch pilot data
  const {
    data: pilotYearlyData,
    error: pilotError,
    isLoading: pilotLoading,
  } = useApi<TotalFlightTimeByPilotYr[]>(
    {
      url: 'v1/stats/pilot/flight-time/year',
      params: {
        yr_from: yrFrom,
        yr_to: yrTo,
      },
    },
    {
      refreshInterval: 0,
    },
  )
  // Fetch member count by type
  const {
    data: memberCountData,
    error: memberCountError,
    isLoading: memberCountLoading,
  } = useApi<MemberCountByType[]>(
    {
      url: 'v1/stats/members/count-by-type',
    },
    {
      refreshInterval: 0,
    },
  )

  // Fetch calendar data
  const {
    data: calendarData,
    error: calendarError,
    isLoading: calendarLoading,
  } = useApi<TotalFlightTimeByAcCalendar[]>(
    {
      url: 'v1/stats/flight-time/aircraft/calendar',
      params: {
        date_from: dateFrom,
        date_to: dateTo,
      },
    },
    {
      refreshInterval: 0,
    },
  )

  // Fetch visited airfields data for OH-STL and OH-IHQ (last 2 years)
  const {
    data: visitedAirfieldsData,
    error: visitedAirfieldsError,
    isLoading: visitedAirfieldsLoading,
  } = useApi<VisitedAirfieldsByAc[]>(
    {
      url: 'v1/stats/visited-airfields',
      params: {
        yr_from: new Date().getFullYear() - 1,
        yr_to: new Date().getFullYear(),
      },
    },
    {
      refreshInterval: 0,
    },
  )

  // Fetch monthly data for last 12 months
  const { yrFrom: monthlyYrFrom, yrTo: monthlyYrTo } = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const from = currentMonth === 12 ? currentYear : currentYear - 1
    return { yrFrom: from, yrTo: currentYear }
  }, [])

  const {
    data: monthlyData,
    error: monthlyError,
    isLoading: monthlyLoading,
  } = useApi<TotalFlightTimeByAcYrMth[]>(
    {
      url: 'v1/stats/flight-time/aircraft/year/month',
      params: {
        yr_from: monthlyYrFrom,
        yr_to: monthlyYrTo,
      },
    },
    {
      refreshInterval: 0,
    },
  )

  // Fetch commercial flight time data (admin only)
  const {
    data: commercialData,
    error: commercialError,
    isLoading: commercialLoading,
  } = useApi<CommercialFlightTimeByAcYrMth[]>(
    {
      url: 'v1/stats/commercial/flight-time/aircraft/year/month',
      params: {
        yr_from: monthlyYrFrom,
        yr_to: monthlyYrTo,
      },
      skipFetch: !hasCommercialAccess,
    },
    {
      refreshInterval: 0,
    },
  )

  // Fetch landings by aircraft per year
  const {
    data: landingsYearlyData,
    error: landingsError,
    isLoading: landingsLoading,
  } = useApi<TotalLandingsByAcYr[]>(
    {
      url: 'v1/stats/landings/year',
      params: {
        yr_from: yrFrom,
        yr_to: yrTo,
      },
    },
    {
      refreshInterval: 0,
    },
  )

  // Fetch occupancy (persons-on-board) distribution — server-side view already
  // restricts this to aircraft with more than 2 seats (currently only OH-STL)
  const {
    data: pobDistributionData,
    error: pobDistributionError,
    isLoading: pobDistributionLoading,
  } = useApi<PobDistributionByAcYr[]>(
    {
      url: 'v1/stats/pob-distribution/year',
      params: {
        yr_from: new Date().getFullYear() - 1,
        yr_to: new Date().getFullYear(),
      },
    },
    {
      refreshInterval: 0,
    },
  )

  // Transform aircraft data for bar chart
  const aircraftBarData = useMemo(() => {
    if (!aircraftYearlyData) return []

    const grouped = new Map<number, { [key: string]: number }>()

    aircraftYearlyData.forEach((item) => {
      if (item.yr == null || item.aircraft_registration == null || item.total_flight_mins == null)
        return

      if (!grouped.has(item.yr)) {
        grouped.set(item.yr, {})
      }
      const yearData = grouped.get(item.yr)!
      yearData[item.aircraft_registration] =
        (yearData[item.aircraft_registration] || 0) + Math.round(item.total_flight_mins / 60) // Convert to hours and accumulate across flight types
    })

    return Array.from(grouped.entries())
      .map(([yr, data]) => ({
        year: yr.toString(),
        ...data,
      }))
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [aircraftYearlyData])

  // Transform pilot data for bar chart
  const pilotBarData = useMemo(() => {
    if (!pilotYearlyData) return []

    const grouped = new Map<number, { [key: string]: number }>()

    pilotYearlyData.forEach((item) => {
      if (!grouped.has(item.yr)) {
        grouped.set(item.yr, {})
      }
      const yearData = grouped.get(item.yr)!
      yearData[item.pilot] = Math.round(item.total_flight_mins / 60) // Convert to hours
    })

    return Array.from(grouped.entries())
      .map(([yr, data]) => ({
        year: yr.toString(),
        ...data,
      }))
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [pilotYearlyData])

  // Transform calendar data grouped by aircraft
  const calendarDataByAircraft = useMemo(() => {
    if (!calendarData) return []

    const grouped = new Map<string, Array<{ day: string; value: number }>>()

    calendarData.forEach((item) => {
      if (!grouped.has(item.aircraft_registration)) {
        grouped.set(item.aircraft_registration, [])
      }
      grouped.get(item.aircraft_registration)!.push({
        day: item.date,
        value: Math.round(item.total_flight_mins / 60), // Convert to hours
      })
    })

    return Array.from(grouped.entries())
      .map(([aircraft, data]) => ({
        aircraft,
        data,
      }))
      .sort((a, b) => a.aircraft.localeCompare(b.aircraft))
  }, [calendarData])

  // Transform monthly data by aircraft for stacked bar chart
  const monthlyDataByAircraft = useMemo(() => {
    if (!monthlyData) return []

    const now = new Date()
    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const aircraftMap = new Map<string, any[]>()

    monthlyData.forEach((item) => {
      const monthKey = `${item.yr}-${String(item.mth).padStart(2, '0')}`
      if (!last12Months.includes(monthKey)) return

      if (!aircraftMap.has(item.aircraft_registration)) {
        aircraftMap.set(item.aircraft_registration, [])
      }

      const existingMonth = aircraftMap
        .get(item.aircraft_registration)!
        .find((d) => d.month === monthKey)

      if (existingMonth) {
        existingMonth[item.flight_type] = Math.round(
          (existingMonth[item.flight_type] || 0) + item.total_flight_mins / 60,
        )
      } else {
        aircraftMap.get(item.aircraft_registration)!.push({
          month: monthKey,
          [item.flight_type]: Math.round(item.total_flight_mins / 60),
        })
      }
    })

    // Fill in missing months with zero values
    const result: Array<{ aircraft: string; data: any[] }> = []
    aircraftMap.forEach((data, aircraft) => {
      const filledData = last12Months.map((month) => {
        const existing = data.find((d) => d.month === month)
        return existing || { month }
      })
      result.push({ aircraft, data: filledData })
    })

    return result
  }, [monthlyData])

  // Get all unique flight types for stacked bar chart
  const flightTypes = useMemo(() => {
    if (!monthlyData) return []
    const types = new Set(monthlyData.map((d) => d.flight_type))
    return Array.from(types).sort()
  }, [monthlyData])

  // Transform commercial flight time data for bar chart
  const commercialBarData = useMemo(() => {
    if (!commercialData) return []

    const now = new Date()
    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const aircraftMap = new Map<string, any[]>()

    commercialData.forEach((item) => {
      const monthKey = `${item.yr}-${String(item.mth).padStart(2, '0')}`
      if (!last12Months.includes(monthKey)) return

      if (!aircraftMap.has(item.aircraft_registration)) {
        aircraftMap.set(item.aircraft_registration, [])
      }

      aircraftMap.get(item.aircraft_registration)!.push({
        month: monthKey,
        hours: Math.round(item.total_commercial_flight_mins / 60),
      })
    })

    // Fill in missing months with zero values
    const result: Array<{ aircraft: string; data: any[] }> = []
    aircraftMap.forEach((data, aircraft) => {
      const filledData = last12Months.map((month) => {
        const existing = data.find((d) => d.month === month)
        return existing || { month, hours: 0 }
      })
      result.push({ aircraft, data: filledData })
    })

    return result
  }, [commercialData])

  // Transform landings data for bar chart
  const landingsBarData = useMemo(() => {
    if (!landingsYearlyData) return []

    const grouped = new Map<number, { [key: string]: number }>()

    landingsYearlyData.forEach((item) => {
      if (!grouped.has(item.yr)) {
        grouped.set(item.yr, {})
      }
      const yearData = grouped.get(item.yr)!
      yearData[item.aircraft_registration] =
        (yearData[item.aircraft_registration] || 0) + item.total_landings
    })

    return Array.from(grouped.entries())
      .map(([yr, data]) => ({
        year: yr.toString(),
        ...data,
      }))
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [landingsYearlyData])

  // Get all unique aircraft keys for landings bar chart
  const landingsBarKeys = useMemo(() => {
    if (!landingsYearlyData) return []
    const keys = new Set(landingsYearlyData.map((d) => d.aircraft_registration))
    return Array.from(keys).sort()
  }, [landingsYearlyData])

  // Transform visited airfields data for pie chart (separate for OH-STL and OH-IHQ)
  const visitedAirfieldsPieData = useMemo(() => {
    if (!visitedAirfieldsData || visitedAirfieldsData.length === 0) return []

    const allowedAircraft = ['OH-STL', 'OH-IHQ']
    const aircraftMap = new Map<string, Map<string, number>>()

    // Group by aircraft and aggregate total visits per airfield
    visitedAirfieldsData.forEach((item) => {
      if (!allowedAircraft.includes(item.aircraft_registration)) return

      if (!aircraftMap.has(item.aircraft_registration)) {
        aircraftMap.set(item.aircraft_registration, new Map())
      }
      const airfieldMap = aircraftMap.get(item.aircraft_registration)!

      const currentVisits = airfieldMap.get(item.airfield) || 0
      airfieldMap.set(item.airfield, currentVisits + item.total_visits)
    })

    // Convert to nivo pie chart format
    return Array.from(aircraftMap.entries())
      .map(([aircraft, airfieldMap]) => {
        if (airfieldMap.size === 0) return null

        // Sort airfields by total visits (descending) and take top 15
        const data = Array.from(airfieldMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([airfield, visits]) => ({
            id: airfield,
            label: airfield,
            value: visits,
          }))

        if (data.length === 0) return null

        return {
          aircraft,
          data,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.aircraft.localeCompare(b.aircraft))
  }, [visitedAirfieldsData])

  const POB_BUCKET_LABELS: Record<string, string> = {
    '1_2': '1-2 people',
    '3': '3 people',
    '4_PLUS': '>=4 people',
  }
  const POB_BUCKET_ORDER = ['1_2', '3', '4_PLUS']

  // Transform occupancy distribution into a YTD pie and a previous-year pie per aircraft
  const pobDistributionPieData = useMemo(() => {
    if (!pobDistributionData || pobDistributionData.length === 0) return []

    const currentYear = new Date().getFullYear()
    const aircraftMap = new Map<string, Map<number, Map<string, PobBucketTotals>>>()

    pobDistributionData.forEach((item) => {
      if (item.yr !== currentYear && item.yr !== currentYear - 1) return

      if (!aircraftMap.has(item.aircraft_registration)) {
        aircraftMap.set(item.aircraft_registration, new Map())
      }
      const yearMap = aircraftMap.get(item.aircraft_registration)!
      if (!yearMap.has(item.yr)) {
        yearMap.set(item.yr, new Map())
      }
      const bucketMap = yearMap.get(item.yr)!
      const existing = bucketMap.get(item.pob_bucket) ?? {
        flightCount: 0,
        crossCountryFlightCount: 0,
        totalFlightMins: 0,
      }
      bucketMap.set(item.pob_bucket, {
        flightCount: existing.flightCount + item.flight_count,
        crossCountryFlightCount: existing.crossCountryFlightCount + item.cross_country_flight_count,
        totalFlightMins: existing.totalFlightMins + item.total_flight_mins,
      })
    })

    const toPieData = (bucketMap: Map<string, PobBucketTotals> | undefined) =>
      POB_BUCKET_ORDER.filter((bucket) => (bucketMap?.get(bucket)?.flightCount ?? 0) > 0).map(
        (bucket) => ({
          id: POB_BUCKET_LABELS[bucket],
          label: POB_BUCKET_LABELS[bucket],
          value: bucketMap!.get(bucket)!.flightCount,
        }),
      )

    // Per-bucket breakdown feeding the summary table below each pie: flight
    // hours (rounded to the nearest hour) and the share of flights that were
    // cross-country (departure airport != arrival airport).
    const toBucketStats = (bucketMap: Map<string, PobBucketTotals> | undefined) =>
      POB_BUCKET_ORDER.filter((bucket) => (bucketMap?.get(bucket)?.flightCount ?? 0) > 0).map(
        (bucket) => {
          const totals = bucketMap!.get(bucket)!
          return {
            bucket,
            label: POB_BUCKET_LABELS[bucket],
            flightCount: totals.flightCount,
            hours: Math.round(totals.totalFlightMins / 60),
            crossCountryPct: Math.round(
              (totals.crossCountryFlightCount / totals.flightCount) * 100,
            ),
          }
        },
      )

    return Array.from(aircraftMap.entries())
      .map(([aircraft, yearMap]) => ({
        aircraft,
        ytd: toPieData(yearMap.get(currentYear)),
        ytdStats: toBucketStats(yearMap.get(currentYear)),
        previousYear: toPieData(yearMap.get(currentYear - 1)),
        previousYearStats: toBucketStats(yearMap.get(currentYear - 1)),
        previousYearLabel: currentYear - 1,
      }))
      .filter((item) => item.ytd.length > 0 || item.previousYear.length > 0)
      .sort((a, b) => a.aircraft.localeCompare(b.aircraft))
  }, [pobDistributionData])

  // Get all unique keys for bar chart
  const barChartKeys = useMemo(() => {
    const data = viewMode === 'aircraft' ? aircraftBarData : pilotBarData
    const keys = new Set<string>()
    data.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (key !== 'year') keys.add(key)
      })
    })
    return Array.from(keys).sort()
  }, [aircraftBarData, pilotBarData, viewMode])

  // Transform member count data for pie chart
  const memberCountPieData = useMemo(() => {
    if (!memberCountData) return []

    return memberCountData.map((item) => ({
      id: item.member_type,
      label: item.member_type,
      value: item.member_count,
    }))
  }, [memberCountData])

  // Calculate summary stats by aircraft
  const summaryStatsByAircraft = useMemo(() => {
    if (!aircraftYearlyData) return []

    const currentYear = new Date().getFullYear()
    const allowedAircraft = ['OH-IHQ', 'OH-STL']
    const aircraftMap = new Map<
      string,
      {
        ytd: number
        ytdNf: number
        ytdIfr: number
        previousYears: Map<number, { hours: number; nf: number; ifr: number }>
      }
    >()

    aircraftYearlyData.forEach((item) => {
      if (item.aircraft_registration == null || item.yr == null) return
      if (!allowedAircraft.includes(item.aircraft_registration)) return

      if (!aircraftMap.has(item.aircraft_registration)) {
        aircraftMap.set(item.aircraft_registration, {
          ytd: 0,
          ytdNf: 0,
          ytdIfr: 0,
          previousYears: new Map(),
        })
      }

      const stats = aircraftMap.get(item.aircraft_registration)!
      const hours = Math.round((item.total_flight_mins ?? 0) / 60)
      const nf = Math.round((item.total_nf_mins ?? 0) / 60)
      const ifr = Math.round((item.total_ifr_mins ?? 0) / 60)

      if (item.yr === currentYear) {
        stats.ytd += hours
        stats.ytdNf += nf
        stats.ytdIfr += ifr
      } else if (item.yr === currentYear - 1 || item.yr === currentYear - 2) {
        const existing = stats.previousYears.get(item.yr) || {
          hours: 0,
          nf: 0,
          ifr: 0,
        }
        stats.previousYears.set(item.yr, {
          hours: existing.hours + hours,
          nf: existing.nf + nf,
          ifr: existing.ifr + ifr,
        })
      }
    })

    return Array.from(aircraftMap.entries())
      .map(([aircraft, stats]) => ({
        aircraft,
        ytd: stats.ytd,
        ytdNf: stats.ytdNf,
        ytdIfr: stats.ytdIfr,
        previousYears: Array.from(stats.previousYears.entries())
          .map(([year, data]) => ({ year, ...data }))
          .sort((a, b) => b.year - a.year),
      }))
      .sort((a, b) => a.aircraft.localeCompare(b.aircraft))
  }, [aircraftYearlyData])

  const isLoading = viewMode === 'aircraft' ? aircraftLoading : pilotLoading
  const error = viewMode === 'aircraft' ? aircraftError : pilotError
  const barData = viewMode === 'aircraft' ? aircraftBarData : pilotBarData

  return (
    <Box>
      <Typography variant='h4' gutterBottom>
        Flight Statistics
      </Typography>
      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid
            container
            spacing={2}
            sx={{
              alignItems: 'center',
            }}
          >
            <Grid size={{ xs: 12 }}>
              <Typography variant='subtitle2' gutterBottom>
                View Mode
              </Typography>
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, newMode) => newMode && setViewMode(newMode)}
                fullWidth
                size='small'
              >
                <ToggleButton value='my'>{t('stats.my.viewMode')}</ToggleButton>
                <ToggleButton value='aircraft'>Aircraft</ToggleButton>
                <ToggleButton value='pilot'>Members</ToggleButton>
                <ToggleButton value='pilots'>Pilots</ToggleButton>
                <ToggleButton value='efficiency'>Reservation Efficiency</ToggleButton>
                <ToggleButton value='yoy'>{t('stats.yearOnYear.viewMode')}</ToggleButton>
                <ToggleButton value='airfield'>Airfield Efficiency</ToggleButton>
                <ToggleButton value='aog'>AOG</ToggleButton>
                <ToggleButton value='safety'>Safety</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {/* My Statistics view */}
      {viewMode === 'my' && <MyStatisticsView />}
      {/* Pilot Statistics view */}
      {viewMode === 'pilots' && <PilotStatisticsView />}
      {/* Reservation Efficiency view */}
      {viewMode === 'efficiency' && <ReservationEfficiencyView />}
      {/* Year on Year view */}
      {viewMode === 'yoy' && <YearOnYearReport />}
      {/* Airfield Efficiency view */}
      {viewMode === 'airfield' && <AirfieldEfficiencyView />}
      {/* AOG (Aircraft On Ground) view */}
      {viewMode === 'aog' && <AogStatisticsView />}
      {/* Safety Performance Indicators view */}
      {viewMode === 'safety' && <SafetyStatisticsView />}
      {!STANDALONE_VIEW_MODES.includes(viewMode) && (
        <>
          {/* Summary Stats */}
          {viewMode === 'aircraft' ? (
            <RemoteContent isLoading={aircraftLoading} error={aircraftError}>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                {summaryStatsByAircraft.map((stats) => (
                  <Grid key={stats.aircraft} size={{ xs: 12, sm: 6 }}>
                    <Card>
                      <CardContent>
                        <Typography
                          gutterBottom
                          sx={{
                            color: 'text.secondary',
                          }}
                        >
                          {stats.aircraft} - Flight Hours YTD
                        </Typography>
                        <Typography variant='h4'>{stats.ytd}</Typography>
                        <Box sx={{ mt: 2 }}>
                          {stats.previousYears.map((yearData) => (
                            <Typography
                              key={yearData.year}
                              variant='body2'
                              sx={{
                                color: 'text.secondary',
                              }}
                            >
                              {yearData.year}: {yearData.hours} hrs (NF: {yearData.nf}, IFR:{' '}
                              {yearData.ifr})
                            </Typography>
                          ))}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </RemoteContent>
          ) : (
            <RemoteContent isLoading={memberCountLoading} error={memberCountError}>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant='h6' gutterBottom>
                    Member Count by Type
                  </Typography>
                  <Box sx={{ height: 400 }}>
                    <ResponsivePie
                      data={memberCountPieData}
                      margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
                      innerRadius={0.5}
                      padAngle={0.7}
                      cornerRadius={3}
                      activeOuterRadiusOffset={8}
                      borderWidth={1}
                      borderColor={{
                        from: 'color',
                        modifiers: [['darker', 0.2]],
                      }}
                      arcLinkLabelsSkipAngle={10}
                      arcLinkLabelsTextColor={arcLinkLabelsTextColor}
                      arcLinkLabelsThickness={2}
                      arcLinkLabelsColor={{ from: 'color' }}
                      arcLabelsSkipAngle={10}
                      arcLabelsTextColor={{
                        from: 'color',
                        modifiers: [['darker', 2]],
                      }}
                      theme={nivoTheme}
                      legends={[
                        {
                          anchor: 'bottom',
                          direction: 'row',
                          justify: false,
                          translateX: 0,
                          translateY: 56,
                          itemsSpacing: 0,
                          itemWidth: 100,
                          itemHeight: 18,
                          itemTextColor: arcLinkLabelsTextColor,
                          itemDirection: 'left-to-right',
                          itemOpacity: 1,
                          symbolSize: 18,
                          symbolShape: 'circle',
                          effects: [
                            {
                              on: 'hover',
                              style: {
                                itemTextColor: legendHoverTextColor,
                              },
                            },
                          ],
                        },
                      ]}
                    />
                  </Box>
                </CardContent>
              </Card>
            </RemoteContent>
          )}

          {/* Flight Time Calendar */}
          {viewMode === 'aircraft' && (
            <RemoteContent isLoading={calendarLoading} error={calendarError}>
              <Box>
                {calendarDataByAircraft.map((aircraftCalendar) => (
                  <Card key={aircraftCalendar.aircraft} sx={{ mb: 3 }}>
                    <CardContent>
                      <Typography variant='h6' gutterBottom>
                        Flight Time Calendar - {aircraftCalendar.aircraft} (Last 2 Years)
                      </Typography>
                      <Box sx={{ height: 400 }}>
                        <ResponsiveCalendar
                          data={aircraftCalendar.data}
                          from={dateFrom}
                          to={dateTo}
                          emptyColor={mode === 'dark' ? '#333333' : '#eeeeee'}
                          colors={['#61cdbb', '#97e3d5', '#e8c1a0', '#f47560']}
                          margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
                          yearSpacing={40}
                          monthBorderColor={mode === 'dark' ? '#555555' : '#ffffff'}
                          dayBorderWidth={2}
                          dayBorderColor={mode === 'dark' ? '#555555' : '#ffffff'}
                          tooltip={CalendarTooltip}
                          theme={nivoTheme}
                          legends={[
                            {
                              anchor: 'bottom-right',
                              direction: 'row',
                              translateY: 36,
                              itemCount: 4,
                              itemWidth: 42,
                              itemHeight: 36,
                              itemsSpacing: 14,
                              itemDirection: 'right-to-left',
                            },
                          ]}
                        />
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </RemoteContent>
          )}

          {/* Monthly Flight Time by Aircraft (Stacked) */}
          {viewMode === 'aircraft' && (
            <RemoteContent isLoading={monthlyLoading} error={monthlyError}>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant='h6' gutterBottom>
                    Monthly Flight Time by Aircraft (Last 12 Months)
                  </Typography>
                  <Box>
                    {monthlyDataByAircraft.map((aircraftData) => (
                      <Box key={aircraftData.aircraft} sx={{ mb: 4 }}>
                        <Typography
                          variant='subtitle1'
                          gutterBottom
                          sx={{
                            fontWeight: 'bold',
                          }}
                        >
                          {aircraftData.aircraft}
                        </Typography>
                        <Box sx={{ height: 300 }}>
                          <ResponsiveBar
                            data={aircraftData.data}
                            keys={flightTypes}
                            indexBy='month'
                            margin={{
                              top: 20,
                              right: 130,
                              bottom: 50,
                              left: 60,
                            }}
                            padding={0.3}
                            valueScale={{ type: 'linear' }}
                            colors={{ scheme: 'nivo' }}
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
                              legendOffset: 40,
                            }}
                            axisLeft={{
                              tickSize: 5,
                              tickPadding: 5,
                              tickRotation: 0,
                              legend: 'Hours',
                              legendPosition: 'middle',
                              legendOffset: -50,
                            }}
                            labelSkipWidth={12}
                            labelSkipHeight={12}
                            labelTextColor={{
                              from: 'color',
                              modifiers: [['darker', 1.6]],
                            }}
                            theme={nivoTheme}
                            legends={[
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
                                effects: [
                                  {
                                    on: 'hover',
                                    style: {
                                      itemOpacity: 1,
                                    },
                                  },
                                ],
                              },
                            ]}
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </RemoteContent>
          )}

          {/* Commercial Flight Time by Aircraft (Admin Only) */}
          {viewMode === 'aircraft' && hasCommercialAccess && (
            <RemoteContent isLoading={commercialLoading} error={commercialError}>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant='h6' gutterBottom>
                    Commercial Flight Time by Aircraft (Last 12 Months)
                  </Typography>
                  <Box>
                    {commercialBarData.map((aircraftData) => (
                      <Box key={aircraftData.aircraft} sx={{ mb: 4 }}>
                        <Typography
                          variant='subtitle1'
                          gutterBottom
                          sx={{
                            fontWeight: 'bold',
                          }}
                        >
                          {aircraftData.aircraft}
                        </Typography>
                        <Box sx={{ height: 300 }}>
                          <ResponsiveBar
                            data={aircraftData.data}
                            keys={['hours']}
                            indexBy='month'
                            margin={{
                              top: 20,
                              right: 30,
                              bottom: 50,
                              left: 60,
                            }}
                            padding={0.3}
                            valueScale={{ type: 'linear' }}
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
                              legendOffset: 40,
                            }}
                            axisLeft={{
                              tickSize: 5,
                              tickPadding: 5,
                              tickRotation: 0,
                              legend: 'Commercial Hours',
                              legendPosition: 'middle',
                              legendOffset: -50,
                            }}
                            labelSkipWidth={12}
                            labelSkipHeight={12}
                            labelTextColor={{
                              from: 'color',
                              modifiers: [['darker', 1.6]],
                            }}
                            theme={nivoTheme}
                            enableLabel={true}
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </RemoteContent>
          )}

          {/* Flight Time by Year */}
          {viewMode === 'aircraft' && (
            <RemoteContent isLoading={isLoading} error={error}>
              <Card>
                <CardContent>
                  <Typography variant='h6' gutterBottom>
                    Flight Time by Aircraft (Yearly)
                  </Typography>
                  <Box sx={{ height: 500 }}>
                    <ResponsiveBar
                      data={barData}
                      keys={barChartKeys}
                      indexBy='year'
                      margin={{ top: 20, right: 130, bottom: 50, left: 60 }}
                      padding={0.3}
                      valueScale={{ type: 'linear' }}
                      groupMode='grouped'
                      colors={{ scheme: 'nivo' }}
                      borderColor={{
                        from: 'color',
                        modifiers: [['darker', 1.6]],
                      }}
                      axisTop={null}
                      axisRight={null}
                      axisBottom={{
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: 0,
                        legend: 'Year',
                        legendPosition: 'middle',
                        legendOffset: 40,
                      }}
                      axisLeft={{
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: 0,
                        legend: 'Hours',
                        legendPosition: 'middle',
                        legendOffset: -50,
                      }}
                      labelSkipWidth={12}
                      labelSkipHeight={12}
                      labelTextColor={{
                        from: 'color',
                        modifiers: [['darker', 1.6]],
                      }}
                      theme={nivoTheme}
                    />
                  </Box>
                </CardContent>
              </Card>
            </RemoteContent>
          )}

          {/* Landings by Aircraft (Yearly) */}
          {viewMode === 'aircraft' && (
            <RemoteContent isLoading={landingsLoading} error={landingsError}>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant='h6' gutterBottom>
                    {t('stats.totalLandingsByYear')}
                  </Typography>
                  <Box sx={{ height: 500 }}>
                    <ResponsiveBar
                      data={landingsBarData}
                      keys={landingsBarKeys}
                      indexBy='year'
                      margin={{ top: 20, right: 130, bottom: 50, left: 60 }}
                      padding={0.3}
                      valueScale={{ type: 'linear' }}
                      groupMode='grouped'
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
                        tickRotation: 0,
                        legend: t('stats.yearAxis'),
                        legendPosition: 'middle',
                        legendOffset: 40,
                      }}
                      axisLeft={{
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: 0,
                        legend: t('stats.landingsAxis'),
                        legendPosition: 'middle',
                        legendOffset: -50,
                      }}
                      labelSkipWidth={12}
                      labelSkipHeight={12}
                      labelTextColor={{
                        from: 'color',
                        modifiers: [['darker', 1.6]],
                      }}
                      theme={nivoTheme}
                      legends={[
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
                          effects: [
                            {
                              on: 'hover',
                              style: {
                                itemOpacity: 1,
                              },
                            },
                          ],
                        },
                      ]}
                    />
                  </Box>
                </CardContent>
              </Card>
            </RemoteContent>
          )}

          {/* Visited Airfields Pie Chart */}
          {viewMode === 'aircraft' && visitedAirfieldsPieData.length > 0 && (
            <RemoteContent isLoading={visitedAirfieldsLoading} error={visitedAirfieldsError}>
              <Box>
                {visitedAirfieldsPieData.map((aircraftPie) => (
                  <Card key={aircraftPie.aircraft} sx={{ mb: 3 }}>
                    <CardContent>
                      <Typography variant='h6' gutterBottom>
                        Visited Airfields - {aircraftPie.aircraft} (Last 2 Years)
                      </Typography>
                      <Box sx={{ height: 500 }}>
                        <ResponsivePie
                          data={aircraftPie.data}
                          margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
                          innerRadius={0.5}
                          padAngle={0.7}
                          cornerRadius={3}
                          activeOuterRadiusOffset={8}
                          borderWidth={1}
                          borderColor={{
                            from: 'color',
                            modifiers: [['darker', 0.2]],
                          }}
                          arcLinkLabelsSkipAngle={10}
                          arcLinkLabelsTextColor={arcLinkLabelsTextColor}
                          arcLinkLabelsThickness={2}
                          arcLinkLabelsColor={{ from: 'color' }}
                          arcLabelsSkipAngle={10}
                          arcLabelsTextColor={{
                            from: 'color',
                            modifiers: [['darker', 2]],
                          }}
                          theme={nivoTheme}
                          legends={[
                            {
                              anchor: 'bottom',
                              direction: 'row',
                              justify: false,
                              translateX: 0,
                              translateY: 56,
                              itemsSpacing: 0,
                              itemWidth: 100,
                              itemHeight: 18,
                              itemTextColor: arcLinkLabelsTextColor,
                              itemDirection: 'left-to-right',
                              itemOpacity: 1,
                              symbolSize: 18,
                              symbolShape: 'circle',
                              effects: [
                                {
                                  on: 'hover',
                                  style: {
                                    itemTextColor: legendHoverTextColor,
                                  },
                                },
                              ],
                            },
                          ]}
                        />
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </RemoteContent>
          )}

          {/* Occupancy (Persons on Board) Distribution Pie Charts */}
          {viewMode === 'aircraft' && pobDistributionPieData.length > 0 && (
            <RemoteContent isLoading={pobDistributionLoading} error={pobDistributionError}>
              <Box>
                {pobDistributionPieData.map((aircraftPie) => (
                  <Card key={aircraftPie.aircraft} sx={{ mb: 3 }}>
                    <CardContent>
                      <Typography variant='h6' gutterBottom>
                        Occupancy Distribution - {aircraftPie.aircraft}
                      </Typography>
                      <Typography
                        variant='body2'
                        sx={{
                          color: 'text.secondary',
                          mb: 2,
                        }}
                      >
                        Share of flights by number of people on board (restricted to aircraft with
                        more than 2 seats)
                      </Typography>
                      <Grid container spacing={2}>
                        {(
                          [
                            {
                              key: 'ytd',
                              title: `Year to Date (${new Date().getFullYear()})`,
                              data: aircraftPie.ytd,
                              stats: aircraftPie.ytdStats,
                            },
                            {
                              key: 'previousYear',
                              title: `Previous Year (${aircraftPie.previousYearLabel})`,
                              data: aircraftPie.previousYear,
                              stats: aircraftPie.previousYearStats,
                            },
                          ] as const
                        ).map((pie) => (
                          <Grid size={{ xs: 12, md: 6 }} key={pie.key}>
                            <Typography variant='subtitle2' align='center' gutterBottom>
                              {pie.title}
                            </Typography>
                            <Box sx={{ height: 400 }}>
                              {pie.data.length > 0 ? (
                                <ResponsivePie
                                  data={pie.data}
                                  margin={{ top: 20, right: 40, bottom: 60, left: 40 }}
                                  innerRadius={0.5}
                                  padAngle={0.7}
                                  cornerRadius={3}
                                  activeOuterRadiusOffset={8}
                                  borderWidth={1}
                                  borderColor={{
                                    from: 'color',
                                    modifiers: [['darker', 0.2]],
                                  }}
                                  arcLinkLabelsSkipAngle={10}
                                  arcLinkLabelsTextColor={arcLinkLabelsTextColor}
                                  arcLinkLabelsThickness={2}
                                  arcLinkLabelsColor={{ from: 'color' }}
                                  arcLabel={(d) =>
                                    `${((d.value / pie.data.reduce((sum, p) => sum + p.value, 0)) * 100).toFixed(0)}%`
                                  }
                                  arcLabelsSkipAngle={10}
                                  arcLabelsTextColor={{
                                    from: 'color',
                                    modifiers: [['darker', 2]],
                                  }}
                                  theme={nivoTheme}
                                  legends={[
                                    {
                                      anchor: 'bottom',
                                      direction: 'row',
                                      justify: false,
                                      translateX: 0,
                                      translateY: 56,
                                      itemsSpacing: 0,
                                      itemWidth: 90,
                                      itemHeight: 18,
                                      itemTextColor: arcLinkLabelsTextColor,
                                      itemDirection: 'left-to-right',
                                      itemOpacity: 1,
                                      symbolSize: 18,
                                      symbolShape: 'circle',
                                      effects: [
                                        {
                                          on: 'hover',
                                          style: {
                                            itemTextColor: legendHoverTextColor,
                                          },
                                        },
                                      ],
                                    },
                                  ]}
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
                                  <Typography sx={{ color: 'text.secondary' }}>
                                    No data available
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                            {pie.stats.length > 0 && (
                              <Table size='small' sx={{ mt: 3 }}>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Occupancy</TableCell>
                                    <TableCell align='right'>Flights</TableCell>
                                    <TableCell align='right'>Hours</TableCell>
                                    <TableCell align='right'>Cross-Country</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {pie.stats.map((bucketStats) => (
                                    <TableRow key={bucketStats.bucket}>
                                      <TableCell>{bucketStats.label}</TableCell>
                                      <TableCell align='right'>{bucketStats.flightCount}</TableCell>
                                      <TableCell align='right'>{bucketStats.hours}</TableCell>
                                      <TableCell align='right'>
                                        {bucketStats.crossCountryPct}%
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </Grid>
                        ))}
                      </Grid>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </RemoteContent>
          )}
        </>
      )}
    </Box>
  )
}
