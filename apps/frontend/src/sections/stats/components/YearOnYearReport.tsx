import { useState, useMemo, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import { ResponsiveBar } from '@nivo/bar'
import { useTranslation } from 'react-i18next'
import useApi from '../../../hooks/useApi'
import { useThemeMode } from '../../../theme/ThemeContext'
import { RemoteContent } from '../../../components/RemoteContent'
import type { TotalFlightTimeByAcYrMth } from '@backend/routes/stats/models'
import type { AircraftListResponse } from '@backend/routes/aircrafts/models'

const STATS_YEAR_RANGE = Number(import.meta.env.VITE_STATS_YEAR_RANGE) || 5

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export const YearOnYearReport = () => {
  const { t } = useTranslation()
  const { mode } = useThemeMode()

  const { yrFrom, yrTo } = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return { yrFrom: currentYear - (STATS_YEAR_RANGE - 1), yrTo: currentYear }
  }, [])

  const years = useMemo(
    () => Array.from({ length: yrTo - yrFrom + 1 }, (_, i) => String(yrFrom + i)),
    [yrFrom, yrTo],
  )

  const [selectedAircraft, setSelectedAircraft] = useState<string>('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
    params: { activeOnly: true },
  })

  const {
    data: flightData,
    isLoading,
    error,
  } = useApi<TotalFlightTimeByAcYrMth[]>(
    {
      url: 'v1/stats/flight-time/aircraft/year/month',
      params: {
        yr_from: yrFrom,
        yr_to: yrTo,
        ...(selectedAircraft ? { aircraft_registration: selectedAircraft } : {}),
      },
    },
    { refreshInterval: 0 },
  )

  // Derive available flight types from actual data — stays in sync with backend automatically
  const availableTypes = useMemo(() => {
    if (!flightData || flightData.length === 0) return []
    return Array.from(new Set(flightData.map((d) => d.flight_type))).sort()
  }, [flightData])

  // Reset selection to all available types whenever the data (or aircraft filter) changes
  useEffect(() => {
    setSelectedTypes(availableTypes)
  }, [availableTypes])

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

  const chartData = useMemo(() => {
    if (!flightData) return []

    const totals = new Map<string, Map<string, number>>()
    for (const month of MONTH_NAMES) {
      totals.set(month, new Map())
    }

    flightData.forEach((row) => {
      if (!selectedTypes.includes(row.flight_type)) return
      const monthName = MONTH_NAMES[row.mth - 1]
      if (!monthName) return
      const yearStr = String(row.yr)
      const monthMap = totals.get(monthName)!
      monthMap.set(yearStr, (monthMap.get(yearStr) ?? 0) + row.total_flight_mins)
    })

    return MONTH_NAMES.map((month) => {
      const entry: Record<string, string | number> = { month }
      const monthMap = totals.get(month)!
      for (const yr of years) {
        entry[yr] = Math.round(((monthMap.get(yr) ?? 0) / 60) * 10) / 10
      }
      return entry
    })
  }, [flightData, selectedTypes, years])

  const handleTypeToggle = (_: unknown, newTypes: string[]) => {
    if (newTypes.length > 0) setSelectedTypes(newTypes)
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant='h6' gutterBottom>
          {t('stats.yearOnYear.title')}
        </Typography>

        <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl size='small' sx={{ maxWidth: 280 }}>
            <InputLabel id='yoy-aircraft-label'>{t('stats.yearOnYear.aircraft')}</InputLabel>
            <Select
              labelId='yoy-aircraft-label'
              value={selectedAircraft}
              label={t('stats.yearOnYear.aircraft')}
              onChange={({ target }) => setSelectedAircraft(target.value)}
            >
              <MenuItem value=''>{t('stats.yearOnYear.allAircraft')}</MenuItem>
              {aircraftData?.aircrafts?.map((ac) => (
                <MenuItem key={ac.registration} value={ac.registration}>
                  {ac.registration} – {ac.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {availableTypes.length > 0 && (
            <Box>
              <Typography
                variant='caption'
                sx={{
                  color: 'text.secondary',
                  mb: 0.5,
                  display: 'block',
                }}
              >
                {t('stats.yearOnYear.flightType')}
              </Typography>
              <ToggleButtonGroup
                value={selectedTypes}
                onChange={handleTypeToggle}
                size='small'
                sx={{ flexWrap: 'wrap', gap: 0.5 }}
              >
                {availableTypes.map((ft) => (
                  <ToggleButton key={ft} value={ft} sx={{ fontSize: '0.7rem', px: 1 }}>
                    {ft}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}
        </Box>

        <RemoteContent isLoading={isLoading} error={error}>
          <Box sx={{ height: 400 }}>
            <ResponsiveBar
              data={chartData}
              keys={years}
              indexBy='month'
              groupMode='grouped'
              margin={{ top: 20, right: 130, bottom: 50, left: 60 }}
              padding={0.2}
              innerPadding={2}
              valueScale={{ type: 'linear' }}
              colors={{ scheme: 'nivo' }}
              borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: t('stats.yearOnYear.monthAxis'),
                legendPosition: 'middle',
                legendOffset: 40,
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: t('stats.yearOnYear.hoursAxis'),
                legendPosition: 'middle',
                legendOffset: -50,
              }}
              labelSkipWidth={12}
              labelSkipHeight={12}
              labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
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
                  effects: [{ on: 'hover', style: { itemOpacity: 1 } }],
                },
              ]}
            />
          </Box>
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
