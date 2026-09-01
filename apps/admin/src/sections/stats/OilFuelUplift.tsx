import { useMemo } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import { Stack } from '@mui/system'
import { ResponsiveBar } from '@nivo/bar'
import type { TotalFuelUpliftByAcYrMth, TotalOilUpliftByAcYrMth } from '@mik/contracts/stats'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { StatInfoButton } from '@mik/ui/components/StatInfoButton'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useTranslation } from 'react-i18next'

import { monthKey, monthlySeriesByAircraft } from '@mik/ui/utils/monthlySeries'

import { useNivoTheme } from './useNivoTheme'

type UpliftBarPoint = { month: string; litres: number }

/**
 * Oil and fuel uplift recorded per aircraft over the last 12 months —
 * issue #1323. Two independent series (litres of oil, litres of fuel),
 * fetched separately since the backend exposes them as two endpoints.
 */
const OilFuelUplift = () => {
  const { t } = useTranslation()
  const nivoTheme = useNivoTheme()

  // The trailing 12 months can straddle a year boundary, so ask for both years
  // unless we happen to be in December.
  const { yrFrom, yrTo } = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    return { yrFrom: currentMonth === 12 ? currentYear : currentYear - 1, yrTo: currentYear }
  }, [])

  const {
    data: oilData,
    error: oilError,
    isLoading: oilLoading,
  } = useApi<TotalOilUpliftByAcYrMth[]>(
    { url: 'v1/stats/oil-uplift/year/month', params: { yrFrom, yrTo } },
    { refreshInterval: 0 },
  )

  const {
    data: fuelData,
    error: fuelError,
    isLoading: fuelLoading,
  } = useApi<TotalFuelUpliftByAcYrMth[]>(
    { url: 'v1/stats/fuel-uplift/year/month', params: { yrFrom, yrTo } },
    { refreshInterval: 0 },
  )

  const oilBarData = useMemo(
    () =>
      monthlySeriesByAircraft<TotalOilUpliftByAcYrMth, UpliftBarPoint>(oilData ?? [], {
        aircraftOf: (item) => item.aircraftRegistration,
        keyOf: (item) => monthKey(item.yr, item.mth),
        merge: (_existing, item, month) => ({
          month,
          litres: Math.round(item.totalOilUplift),
        }),
        empty: (month) => ({ month, litres: 0 }),
      }),
    [oilData],
  )

  const fuelBarData = useMemo(
    () =>
      monthlySeriesByAircraft<TotalFuelUpliftByAcYrMth, UpliftBarPoint>(fuelData ?? [], {
        aircraftOf: (item) => item.aircraftRegistration,
        keyOf: (item) => monthKey(item.yr, item.mth),
        merge: (_existing, item, month) => ({
          month,
          litres: Math.round(item.totalFuelUplift),
        }),
        empty: (month) => ({ month, litres: 0 }),
      }),
    [fuelData],
  )

  const barChart = (
    aircraftData: { aircraft: string; data: UpliftBarPoint[] },
    axisLegend: string,
  ) => (
    <Box key={aircraftData.aircraft} sx={{ mb: 4 }}>
      <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
        {aircraftData.aircraft}
      </Typography>
      <Box sx={{ height: 300 }}>
        <ResponsiveBar
          data={aircraftData.data}
          keys={['litres']}
          indexBy='month'
          margin={{ top: 20, right: 30, bottom: 50, left: 60 }}
          padding={0.3}
          valueScale={{ type: 'linear' }}
          colors={{ scheme: 'set2' }}
          borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: -45,
            legend: t('admin.stats.month'),
            legendPosition: 'middle',
            legendOffset: 40,
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: axisLegend,
            legendPosition: 'middle',
            legendOffset: -50,
          }}
          labelSkipWidth={12}
          labelSkipHeight={12}
          labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
          theme={nivoTheme}
          enableLabel
        />
      </Box>
    </Box>
  )

  return (
    <Box>
      <Title label={t('admin.stats.oilFuelUplift')} />

      <Stack direction='row' spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant='h6'>{t('stats.info.oilFuelUplift.titles.oil')}</Typography>
        <StatInfoButton
          titleKey='stats.info.oilFuelUplift.titles.oil'
          summaryKey='stats.info.oilFuelUplift.summary'
          calculationKey='stats.info.oilFuelUplift.calculation'
          caveatKeys={['stats.info.oilFuelUplift.caveats.recordedNotEstimated']}
        />
      </Stack>
      <RemoteContent isLoading={oilLoading} error={oilError}>
        {oilBarData.length === 0 ? (
          <Typography color='text.secondary' sx={{ mb: 3 }}>
            {t('admin.stats.noUpliftData')}
          </Typography>
        ) : (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              {oilBarData.map((aircraftData) => barChart(aircraftData, t('admin.stats.oilLitres')))}
            </CardContent>
          </Card>
        )}
      </RemoteContent>

      <Stack direction='row' spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant='h6'>{t('stats.info.oilFuelUplift.titles.fuel')}</Typography>
        <StatInfoButton
          titleKey='stats.info.oilFuelUplift.titles.fuel'
          summaryKey='stats.info.oilFuelUplift.summary'
          calculationKey='stats.info.oilFuelUplift.calculation'
          caveatKeys={['stats.info.oilFuelUplift.caveats.recordedNotEstimated']}
        />
      </Stack>
      <RemoteContent isLoading={fuelLoading} error={fuelError}>
        {fuelBarData.length === 0 ? (
          <Typography color='text.secondary'>{t('admin.stats.noUpliftData')}</Typography>
        ) : (
          <Card>
            <CardContent>
              {fuelBarData.map((aircraftData) =>
                barChart(aircraftData, t('admin.stats.fuelLitres')),
              )}
            </CardContent>
          </Card>
        )}
      </RemoteContent>
    </Box>
  )
}

export default OilFuelUplift
