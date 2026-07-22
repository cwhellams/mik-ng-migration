import { useState, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import type { Dayjs } from 'dayjs'
import { ResponsiveBar } from '@nivo/bar'
import useApi from '../../../hooks/useApi'
import { useThemeMode } from '../../../theme/ThemeContext'
import { RemoteContent } from '../../../components/RemoteContent'
import type { PilotStatistics as PilotStatisticsType } from '@backend/routes/stats/models'
import { useTranslation } from 'react-i18next'
import { dayjs } from '../../../utils/date'

type DatePreset = 'currentYear' | 'previousYear' | 'last12months' | 'custom'
type Timezone = 'local' | 'utc'

const getPresetRange = (preset: DatePreset, tz: Timezone): { from: string; to: string } => {
  const now = tz === 'utc' ? dayjs.utc() : dayjs()
  const currentYear = now.year()
  const today = now.format('YYYY-MM-DD')

  switch (preset) {
    case 'currentYear':
      return { from: `${currentYear}-01-01`, to: `${currentYear}-12-31` }
    case 'previousYear':
      return {
        from: `${currentYear - 1}-01-01`,
        to: `${currentYear - 1}-12-31`,
      }
    case 'last12months': {
      const fromDate = now.subtract(1, 'year').add(1, 'day')
      return { from: fromDate.format('YYYY-MM-DD'), to: today }
    }
    default:
      return { from: `${currentYear}-01-01`, to: `${currentYear}-12-31` }
  }
}

interface HistogramTooltipProps {
  binFrom: number
  binTo: number
  pilotCount: number
  unit: string
}

const HistogramTooltip = ({ binFrom, binTo, pilotCount, unit }: HistogramTooltipProps) => (
  <Box
    sx={(theme) => ({
      background: theme.palette.background.paper,
      color: theme.palette.text.primary,
      padding: '9px 12px',
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 1,
    })}
  >
    <strong>
      {binFrom}–{binTo} {unit}
    </strong>
    : {Math.round(pilotCount)} pilot{Math.round(pilotCount) !== 1 ? 's' : ''}
  </Box>
)

export const PilotStatistics = () => {
  const { t } = useTranslation()
  const { mode } = useThemeMode()

  const [preset, setPreset] = useState<DatePreset>('currentYear')
  const [customFrom, setCustomFrom] = useState<Dayjs | null>(null)
  const [customTo, setCustomTo] = useState<Dayjs | null>(null)

  const { from, to } = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) {
      return {
        from: customFrom.format('YYYY-MM-DD'),
        to: customTo.format('YYYY-MM-DD'),
      }
    }
    return getPresetRange(preset, 'local')
  }, [preset, customFrom, customTo])

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

  const skipFetch = preset === 'custom' && (!customFrom || !customTo)

  const {
    data: pilotStats,
    error,
    isLoading,
  } = useApi<PilotStatisticsType>(
    {
      url: 'v1/stats/pilots',
      params: { from, to },
      skipFetch,
    },
    { refreshInterval: 0 },
  )

  const hoursBarData = useMemo(
    () =>
      (pilotStats?.hoursHistogram ?? []).map((bin) => ({
        range: `${bin.binFrom}–${bin.binTo}`,
        pilotCount: bin.pilotCount,
        binFrom: bin.binFrom,
        binTo: bin.binTo,
      })),
    [pilotStats],
  )

  const hoursTickValues = useMemo(() => {
    const maxHours = Math.max(...(pilotStats?.hoursHistogram?.map((b) => b.pilotCount) || [0]))
    return Array.from({ length: Math.ceil(maxHours) + 1 }, (_, i) => i)
  }, [pilotStats])

  const airportsBarData = useMemo(
    () =>
      (pilotStats?.airportsHistogram ?? []).map((bin) => ({
        range: `${bin.binFrom}–${bin.binTo}`,
        pilotCount: bin.pilotCount,
        binFrom: bin.binFrom,
        binTo: bin.binTo,
      })),
    [pilotStats],
  )

  const airportsTickValues = useMemo(() => {
    const maxAirports = Math.max(
      ...(pilotStats?.airportsHistogram?.map((b) => b.pilotCount) || [0]),
    )
    return Array.from({ length: Math.ceil(maxAirports) + 1 }, (_, i) => i)
  }, [pilotStats])

  return (
    <Box>
      {/* Date Range Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant='h6' gutterBottom>
            {t('stats.pilots.dateRange')}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <ToggleButtonGroup
              value={preset}
              exclusive
              onChange={(_, value) => {
                if (value) setPreset(value as DatePreset)
              }}
              size='small'
            >
              <ToggleButton value='currentYear'>
                {t('stats.pilots.presets.currentYear')}
              </ToggleButton>
              <ToggleButton value='previousYear'>
                {t('stats.pilots.presets.previousYear')}
              </ToggleButton>
              <ToggleButton value='last12months'>
                {t('stats.pilots.presets.last12months')}
              </ToggleButton>
              <ToggleButton value='custom'>{t('stats.pilots.presets.custom')}</ToggleButton>
            </ToggleButtonGroup>

            {preset === 'custom' && (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <DatePicker
                  label={t('stats.pilots.from')}
                  value={customFrom}
                  onChange={setCustomFrom}
                  slotProps={{ textField: { size: 'small' } }}
                />
                <DatePicker
                  label={t('stats.pilots.to')}
                  value={customTo}
                  onChange={setCustomTo}
                  slotProps={{ textField: { size: 'small' } }}
                />
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
      <RemoteContent isLoading={isLoading && !skipFetch} error={error}>
        {/* KPI Card */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant='h3' color='primary'>
                  {pilotStats?.uniquePicCount ?? 0}
                </Typography>
                <Typography
                  variant='subtitle1'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('stats.pilots.uniquePics')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Hours per Pilot Histogram */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              {t('stats.pilots.hoursHistogram')}
            </Typography>
            <Box sx={{ height: 300 }}>
              {hoursBarData.length > 0 ? (
                <ResponsiveBar
                  data={hoursBarData}
                  keys={['pilotCount']}
                  indexBy='range'
                  margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
                  padding={0.3}
                  valueScale={{ type: 'linear', min: 0, max: 'auto' }}
                  colors={{ scheme: 'set2' }}
                  borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                  axisTop={null}
                  axisRight={null}
                  axisBottom={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: -30,
                    legend: t('stats.pilots.hoursAxis'),
                    legendPosition: 'middle',
                    legendOffset: 48,
                  }}
                  axisLeft={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: 0,
                    legend: t('stats.pilots.pilotCountAxis'),
                    legendPosition: 'middle',
                    legendOffset: -50,
                    tickValues: hoursTickValues,
                    format: '.0f',
                  }}
                  tooltip={({ data: barData }) => (
                    <HistogramTooltip
                      binFrom={barData.binFrom as number}
                      binTo={barData.binTo as number}
                      pilotCount={barData.pilotCount as number}
                      unit={t('stats.pilots.hours')}
                    />
                  )}
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
                    {t('stats.pilots.noData')}
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Visited Airports per Pilot Histogram */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant='h6' gutterBottom>
              {t('stats.pilots.airportsHistogram')}
            </Typography>
            <Box sx={{ height: 300 }}>
              {airportsBarData.length > 0 ? (
                <ResponsiveBar
                  data={airportsBarData}
                  keys={['pilotCount']}
                  indexBy='range'
                  margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
                  padding={0.3}
                  valueScale={{ type: 'linear', min: 0, max: 'auto' }}
                  colors={{ scheme: 'nivo' }}
                  borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                  axisTop={null}
                  axisRight={null}
                  axisBottom={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: -30,
                    legend: t('stats.pilots.airportsAxis'),
                    legendPosition: 'middle',
                    legendOffset: 48,
                  }}
                  axisLeft={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: 0,
                    legend: t('stats.pilots.pilotCountAxis'),
                    legendPosition: 'middle',
                    legendOffset: -50,
                    tickValues: airportsTickValues,
                    format: '.0f',
                  }}
                  tooltip={({ data: barData }) => (
                    <HistogramTooltip
                      binFrom={barData.binFrom as number}
                      binTo={barData.binTo as number}
                      pilotCount={barData.pilotCount as number}
                      unit={t('stats.pilots.airports')}
                    />
                  )}
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
                    {t('stats.pilots.noData')}
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
