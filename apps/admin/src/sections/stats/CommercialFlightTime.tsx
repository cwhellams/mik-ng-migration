import { useMemo } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import { ResponsiveBar } from '@nivo/bar'
import type { CommercialFlightTimeByAcYrMth } from '@mik/contracts/stats'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useTranslation } from 'react-i18next'

import { monthKey, monthlySeriesByAircraft } from '@mik/ui/utils/monthlySeries'

import { useNivoTheme } from './useNivoTheme'

/**
 * Commercial flight hours per aircraft over the last 12 months.
 *
 * This was a panel inside the member app's `/club/stats`, hidden behind a
 * sudo-gated `hasCommercialAccess` check while the rest of that page showed
 * members their own flying. Revenue reporting is desk work and belongs beside
 * the accounting section, so #1233 moved it here and `/club/stats` lost its
 * only admin branch.
 */
const CommercialFlightTime = () => {
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

  const { data, error, isLoading } = useApi<CommercialFlightTimeByAcYrMth[]>(
    {
      url: 'v1/stats/commercial/flight-time/aircraft/year/month',
      params: { yrFrom, yrTo },
    },
    { refreshInterval: 0 },
  )

  const barData = useMemo(
    () =>
      monthlySeriesByAircraft(data ?? [], {
        aircraftOf: (item) => item.aircraftRegistration,
        keyOf: (item) => monthKey(item.yr, item.mth),
        merge: (_existing, item, month) => ({
          month,
          hours: Math.round(item.totalCommercialFlightMins / 60),
        }),
        empty: (month) => ({ month, hours: 0 }),
      }),
    [data],
  )

  return (
    <Box>
      <Title label={t('admin.stats.commercialFlightTime')} />
      <RemoteContent isLoading={isLoading} error={error}>
        {barData.length === 0 ? (
          <Typography color='text.secondary'>{t('admin.stats.noCommercialFlights')}</Typography>
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
                        legend: t('admin.stats.commercialHours'),
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

export default CommercialFlightTime
