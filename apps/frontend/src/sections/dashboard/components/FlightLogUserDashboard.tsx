import useApi from '../../../hooks/useApi'
import {
  Typography,
  useMediaQuery,
  Grid,
  Box,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionDetails,
  AccordionSummary,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Link } from 'react-router-dom'
import { RemoteContent } from '../../../components/RemoteContent'
import { useMe } from '../../../hooks/useMe'
import { FlightLogStatsFilter, FlightLogStatsResponse } from '@backend/routes/flight-log/models'
import { t } from 'i18next'
import { useTimezone } from '../../../hooks/useTimezone'
import { useState } from 'react'
import theme from '../../../theme/theme'
import { ResponsiveTable } from '../../../components/ResponsiveTable'
import { formatHHMM } from '../../../utils/format'
import { FormField } from '../../../components/FormField'
import { Title } from '../../../components/Title'

export const FlightLogUserDashboard = () => {
  const { me } = useMe()

  const { formatDateTime } = useTimezone()

  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const [filters, setFilters] = useState<FlightLogStatsFilter>({
    activeOnly: true,
  })

  const { data, isLoading, error } = useApi<FlightLogStatsResponse>(
    {
      url: 'v1/flight-logs/stats',
      params: filters,
      skipFetch: !me?.memberId,
    },
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  )

  const formatCurrency = (landings: number, mins: number) =>
    landings > 0 ? (
      <>
        <Box>{landings}</Box>
        <Box>{formatHHMM(mins)}</Box>
      </>
    ) : (
      '-'
    )

  return (
    <Accordion defaultExpanded sx={{ mt: 4 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Title label={t('dashboard.flightLog.recentFlights')} subtitle={true}>
          <FormControlLabel
            control={
              <Switch
                checked={!filters.activeOnly}
                onClick={(event) => event.stopPropagation()}
                onChange={(e) => setFilters({ ...filters, activeOnly: !e.target.checked })}
              />
            }
            label={t('aircraft.showActive')}
          />
        </Title>
      </AccordionSummary>
      <AccordionDetails>
        <RemoteContent isLoading={isLoading} error={error}>
          <ResponsiveTable
            header={
              <>
                <Grid size={2}>{t('dashboard.flightLog.plane')}</Grid>
                <Grid size={3}>{t('dashboard.flightLog.lastFlight')}</Grid>
                <Grid size={7} container>
                  <Grid size={12} textAlign='center'>
                    {t('dashboard.flightLog.currency')}
                  </Grid>
                  <Grid size={2} textAlign='center'>
                    1m
                  </Grid>
                  <Grid size={2} textAlign='center'>
                    3m
                  </Grid>
                  <Grid size={2} textAlign='center'>
                    6m
                  </Grid>
                  <Grid size={2} textAlign='center'>
                    12m
                  </Grid>
                  <Grid size={4} textAlign='center'>
                    {t('dashboard.flightLog.totals')}
                  </Grid>
                </Grid>
              </>
            }
            headerProps={{
              display: { xs: 'none', sm: 'flex' },
            }}
            notFoundMsg={t('flightLog.noLogs')}
            rows={data?.stats}
            row={(stat) =>
              isXs ? (
                <>
                  <Grid size={12}>
                    {stat.aircraftRegistration == 'total'
                      ? t('dashboard.flightLog.totals')
                      : stat.aircraftRegistration}
                  </Grid>
                  <Grid size={12}>
                    <FormField label={t('dashboard.flightLog.lastFlight')}>
                      <Link to={`/logs/flights/${stat.lastFlightId}`}>
                        {formatDateTime(stat.lastTakeoffTimeUtc)}
                      </Link>
                    </FormField>
                  </Grid>

                  <Grid size={12}>
                    <FormField label={t('dashboard.flightLog.totalLandings')}>
                      {stat.totalLandings}
                    </FormField>
                    <FormField label={t('dashboard.flightLog.totalFlightTime')}>
                      {formatHHMM(stat.totalFlightMins)}
                    </FormField>
                  </Grid>

                  <Grid size={12}>
                    <Typography variant='body2' color='text.secondary'>
                      {t('dashboard.flightLog.currency')}
                    </Typography>
                  </Grid>

                  <Grid size={3} textAlign='center' color='text.secondary'>
                    1m
                  </Grid>
                  <Grid size={3} textAlign='center' color='text.secondary'>
                    3m
                  </Grid>
                  <Grid size={3} textAlign='center' color='text.secondary'>
                    6m
                  </Grid>
                  <Grid size={3} textAlign='center' color='text.secondary'>
                    12m
                  </Grid>

                  <Grid size={3} textAlign='center'>
                    {formatCurrency(stat.landings1month, stat.time1month)}
                  </Grid>
                  <Grid size={3} textAlign='center'>
                    {formatCurrency(stat.landings3month, stat.time3month)}
                  </Grid>
                  <Grid size={3} textAlign='center'>
                    {formatCurrency(stat.landings6month, stat.time6month)}
                  </Grid>
                  <Grid size={3} textAlign='center'>
                    {formatCurrency(stat.landings12month, stat.time12month)}
                  </Grid>
                </>
              ) : (
                <>
                  <Grid size={2}>
                    {stat.aircraftRegistration == 'total'
                      ? t('dashboard.flightLog.totals')
                      : stat.aircraftRegistration}
                  </Grid>
                  <Grid size={3}>
                    <Link to={`/logs/flights/${stat.lastFlightId}`}>
                      {formatDateTime(stat.lastTakeoffTimeUtc)}
                    </Link>
                  </Grid>
                  <Grid size={(2 / 12) * 7} textAlign='center'>
                    {formatCurrency(stat.landings1month, stat.time1month)}
                  </Grid>
                  <Grid size={(2 / 12) * 7} textAlign='center'>
                    {formatCurrency(stat.landings3month, stat.time3month)}
                  </Grid>
                  <Grid size={(2 / 12) * 7} textAlign='center'>
                    {formatCurrency(stat.landings6month, stat.time6month)}
                  </Grid>
                  <Grid size={(2 / 12) * 7} textAlign='center'>
                    {formatCurrency(stat.landings12month, stat.time12month)}
                  </Grid>
                  <Grid size={(4 / 12) * 7} textAlign='center'>
                    {formatCurrency(stat.totalLandings, stat.totalFlightMins)}
                  </Grid>
                </>
              )
            }
          />
        </RemoteContent>
      </AccordionDetails>
    </Accordion>
  )
}
