import { useState, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import { ResponsiveBar } from '@nivo/bar'
import { ResponsiveCalendar } from '@nivo/calendar'
import { useTranslation } from 'react-i18next'
import useApi from '@mik/ui/hooks/useApi'
import { useThemeMode } from '../../../theme/ThemeContext'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { formatHHMM } from '@mik/ui/utils/format'
import { useNivoTheme } from '../useNivoTheme'
import type { MyStatistics as MyStatisticsType } from '@mik/contracts/stats'
import type { AircraftListResponse } from '@mik/contracts/aircrafts'
import { endpoints } from '../../../api/endpoints'
import { wrappingToggleGroupSx } from '../wrappingToggleGroupSx'

type RangeMode = 'ytd' | 'all'

// Nivo lays the calendar out year by year, so all-time needs vertical room per year.
const CALENDAR_HEIGHT_PER_YEAR = 190
// Minimum horizontal room per monthly bar, so long ranges scroll instead of squashing.
const MONTHLY_BAR_MIN_WIDTH = 46

const KpiTile = ({ label, value }: { label: string; value: string }) => (
  <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ textAlign: 'center' }}>
        <Typography variant='h4' color='primary'>
          {value}
        </Typography>
        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
      </CardContent>
    </Card>
  </Grid>
)

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
    <strong>{day}</strong>: {value ? Number(value).toFixed(1) : 0} h
  </Box>
)

export const MyStatistics = () => {
  const { t } = useTranslation()
  const { mode } = useThemeMode()
  const nivoTheme = useNivoTheme()

  const [range, setRange] = useState<RangeMode>('ytd')
  const [selectedAircraft, setSelectedAircraft] = useState<string>('')

  const { data: aircraftData } = useApi<AircraftListResponse>({
    url: endpoints.aircrafts.root,
    params: { activeOnly: true },
  })

  // Year-to-date sends an explicit range; all-time simply omits it.
  const rangeParams = useMemo(() => {
    if (range === 'all') return {}
    const now = new Date()
    return {
      dateFrom: `${now.getFullYear()}-01-01`,
      dateTo: now.toISOString().split('T')[0],
    }
  }, [range])

  const {
    data: stats,
    isLoading,
    error,
  } = useApi<MyStatisticsType>(
    {
      url: 'v1/stats/my',
      params: {
        ...rangeParams,
        ...(selectedAircraft ? { aircraftRegistration: selectedAircraft } : {}),
      },
    },
    { refreshInterval: 0 },
  )

  const calendarData = useMemo(
    () =>
      (stats?.daily ?? []).map((d) => ({
        day: d.date,
        value: Math.round((d.flightMins / 60) * 10) / 10,
      })),
    [stats],
  )

  // All-time spans whatever the member has actually flown; YTD is the calendar year.
  const { calendarFrom, calendarTo } = useMemo(() => {
    const now = new Date()
    if (range === 'ytd') {
      return {
        calendarFrom: `${now.getFullYear()}-01-01`,
        calendarTo: `${now.getFullYear()}-12-31`,
      }
    }
    if (calendarData.length === 0) {
      return {
        calendarFrom: `${now.getFullYear()}-01-01`,
        calendarTo: `${now.getFullYear()}-12-31`,
      }
    }
    const firstYear = calendarData[0].day.slice(0, 4)
    const lastYear = calendarData[calendarData.length - 1].day.slice(0, 4)
    return { calendarFrom: `${firstYear}-01-01`, calendarTo: `${lastYear}-12-31` }
  }, [range, calendarData])

  const calendarYearCount = Number(calendarTo.slice(0, 4)) - Number(calendarFrom.slice(0, 4)) + 1

  const monthlyData = useMemo(
    () =>
      (stats?.monthly ?? []).map((m) => ({
        month: `${m.yr}-${String(m.mth).padStart(2, '0')}`,
        hours: Math.round((m.flightMins / 60) * 10) / 10,
      })),
    [stats],
  )

  const totals = stats?.totals

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            <ToggleButtonGroup
              value={range}
              exclusive
              onChange={(_, value) => {
                if (value) setRange(value as RangeMode)
              }}
              size='small'
              sx={wrappingToggleGroupSx}
            >
              <ToggleButton value='ytd'>{t('stats.my.range.ytd')}</ToggleButton>
              <ToggleButton value='all'>{t('stats.my.range.allTime')}</ToggleButton>
            </ToggleButtonGroup>

            <FormControl size='small' sx={{ minWidth: 240 }}>
              <InputLabel id='my-stats-aircraft-label'>{t('stats.my.aircraft')}</InputLabel>
              <Select
                labelId='my-stats-aircraft-label'
                value={selectedAircraft}
                label={t('stats.my.aircraft')}
                onChange={({ target }) => setSelectedAircraft(target.value)}
              >
                <MenuItem value=''>{t('stats.my.allAircraft')}</MenuItem>
                {aircraftData?.aircrafts?.map((ac) => (
                  <MenuItem key={ac.registration} value={ac.registration}>
                    {ac.registration} – {ac.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      <RemoteContent isLoading={isLoading} error={error}>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <KpiTile
            label={t('stats.my.totals.flightTime')}
            value={formatHHMM(totals?.totalFlightMins ?? 0)}
          />
          <KpiTile
            label={t('stats.my.totals.blockTime')}
            value={formatHHMM(totals?.totalBlockMins ?? 0)}
          />
          <KpiTile
            label={t('stats.my.totals.landings')}
            value={String(totals?.totalLandings ?? 0)}
          />
          <KpiTile
            label={t('stats.my.totals.airports')}
            value={String(totals?.uniqueAirports ?? 0)}
          />
          <KpiTile label={t('stats.my.totals.flights')} value={String(totals?.flightCount ?? 0)} />
        </Grid>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              {t('stats.my.calendarTitle')}
            </Typography>
            {calendarData.length === 0 ? (
              <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('stats.my.noData')}
              </Typography>
            ) : (
              <Box sx={{ height: Math.max(300, calendarYearCount * CALENDAR_HEIGHT_PER_YEAR) }}>
                <ResponsiveCalendar
                  data={calendarData}
                  from={calendarFrom}
                  to={calendarTo}
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
            )}
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              {t('stats.my.monthlyTitle')}
            </Typography>
            {monthlyData.length === 0 ? (
              <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('stats.my.noData')}
              </Typography>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Box
                  sx={{
                    height: 340,
                    minWidth: Math.max(600, monthlyData.length * MONTHLY_BAR_MIN_WIDTH),
                  }}
                >
                  <ResponsiveBar
                    data={monthlyData}
                    keys={['hours']}
                    indexBy='month'
                    margin={{ top: 20, right: 30, bottom: 70, left: 60 }}
                    padding={0.3}
                    valueScale={{ type: 'linear' }}
                    colors={{ scheme: 'nivo' }}
                    borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: -45,
                      legend: t('stats.my.monthAxis'),
                      legendPosition: 'middle',
                      legendOffset: 60,
                    }}
                    axisLeft={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: 0,
                      legend: t('stats.my.hoursAxis'),
                      legendPosition: 'middle',
                      legendOffset: -50,
                    }}
                    labelSkipWidth={12}
                    labelSkipHeight={12}
                    labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                    theme={nivoTheme}
                  />
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      </RemoteContent>
    </Box>
  )
}
