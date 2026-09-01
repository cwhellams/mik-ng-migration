import { useMemo } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import { ResponsiveBar } from '@nivo/bar'
import type { DtoFlightTimeByAcYrMth } from '@mik/contracts/stats'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { StatInfoButton } from '@mik/ui/components/StatInfoButton'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useTranslation } from 'react-i18next'

import { monthKey, monthlySeriesByAircraft } from '@mik/ui/utils/monthlySeries'

import { useNivoTheme } from './useNivoTheme'

/**
 * `stats.dto_total_flight_time_by_ac_yr_mth` is grouped by flight_type as well
 * as aircraft/year/month, so an aircraft can have more than one row for the
 * same month (e.g. DTO-flagged SCHOOL and DTO-flagged DTO-type flights both in
 * one month) — `merge` folds onto the existing entry rather than overwriting
 * it, or one row's hours silently disappear. Exported so the accumulation can
 * be tested directly, without depending on nivo rendering bars in jsdom.
 */
export const dtoMonthlyBarData = (data: DtoFlightTimeByAcYrMth[]) =>
  monthlySeriesByAircraft<DtoFlightTimeByAcYrMth, { month: string; hours: number }>(data, {
    aircraftOf: (item) => item.aircraftRegistration,
    keyOf: (item) => monthKey(item.yr, item.mth),
    merge: (existing, item, month) => ({
      month,
      hours: (existing?.hours ?? 0) + Math.round(item.totalFlightMins / 60),
    }),
    empty: (month) => ({ month, hours: 0 }),
  })

/**
 * DTO (Declared Training Organisation) training flight time per aircraft over
 * the last 12 months — issue #1323. Uses flight/air time (`totalFlightMins`),
 * not block time, matching every other flight-time report in this app; see
 * this page's info button for why that differs from School-Flight Reservation
 * Efficiency, which deliberately uses block time for the same training flights.
 */
const DtoFlightTime = () => {
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

  const { data, error, isLoading } = useApi<DtoFlightTimeByAcYrMth[]>(
    {
      url: 'v1/stats/dto/flight-time/aircraft/year/month',
      params: { yrFrom, yrTo },
    },
    { refreshInterval: 0 },
  )

  const barData = useMemo(() => dtoMonthlyBarData(data ?? []), [data])

  return (
    <Box>
      <Title label={t('admin.stats.dtoFlightTime')}>
        <StatInfoButton
          titleKey='stats.info.dtoFlightTime.title'
          summaryKey='stats.info.dtoFlightTime.summary'
          calculationKey='stats.info.dtoFlightTime.calculation'
          caveatKeys={['stats.info.dtoFlightTime.caveats.airTimeNotBlockTime']}
        />
      </Title>
      <RemoteContent isLoading={isLoading} error={error}>
        {barData.length === 0 ? (
          <Typography color='text.secondary'>{t('admin.stats.noDtoFlights')}</Typography>
        ) : (
          <Card>
            <CardContent>
              {barData.map((aircraftData) => (
                <Box key={aircraftData.aircraft} sx={{ mb: 4 }}>
                  <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
                    {aircraftData.aircraft}
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveBar
                      data={aircraftData.data}
                      keys={['hours']}
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
                        legend: t('admin.stats.dtoHours'),
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
              ))}
            </CardContent>
          </Card>
        )}
      </RemoteContent>
    </Box>
  )
}

export default DtoFlightTime
