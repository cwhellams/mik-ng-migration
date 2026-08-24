import { Alert, Box, Button, Paper, Typography } from '@mui/material'
import { Grid } from '@mui/system'
import { useState } from 'react'

import type { Problem } from '@mik/contracts/problem'
import type {
  InvoicableFlightFilters,
  PrepaidFlightSummaryResponse,
} from '@mik/contracts/flight-log'

import { ResponsiveTable } from '@mik/ui/components/ResponsiveTable'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import useApi from '@mik/ui/hooks/useApi'

import { t } from 'i18next'
import { useTimezone } from '@mik/ui/hooks/useTimezone'

function formatMinutes(minutes: number): string {
  return t('invoicing.minuteAmount', { count: minutes })
}

export const PrepaidBalanceFlights = ({
  filters,
  navigate,
}: {
  filters: InvoicableFlightFilters
  navigate: {
    next: () => void
    previous: () => void
  }
}) => {
  const { data, isLoading, error, mutation } = useApi<PrepaidFlightSummaryResponse>({
    url: 'v1/invoices/flights/prepaid-summary',
    params: {
      aircraftRegistration: filters.aircraftRegistration ?? '',
      endDate: filters.endDate,
    },
  })

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  const { formatISODate } = useTimezone()

  const handleNext = async () => {
    const res = await mutation.trigger(
      'POST',
      {
        aircraftRegistration: filters.aircraftRegistration,
        endDate: filters.endDate,
      },
      '/v1/invoices/flights',
    )

    if (res.error) {
      return setProblem(res.error)
    }

    navigate.next()
  }

  return (
    <>
      <SnackAlert problem={problem} />
      <RemoteContent isLoading={isLoading} error={error}>
        {(data?.groups.length ?? 0) === 0 && (
          <Alert severity='info' sx={{ mb: 3 }}>
            {t('invoicing.noPrepaidFlights')}
          </Alert>
        )}

        {(data?.groups ?? []).map((group) => (
          <Paper
            key={`${group.billableMemberId}-${group.aircraftRegistration}`}
            variant='outlined'
            sx={{ p: 2, mb: 3 }}
          >
            <Typography variant='h6' sx={{ mb: 0.5 }}>
              {group.billableMemberLastName} · {group.aircraftRegistration}
            </Typography>

            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
                mb: 2,
              }}
            >
              {t('invoicing.prepaidSummary', {
                available: formatMinutes(group.availablePrepaidMinutes),
                used: formatMinutes(group.prepaidMinutesUsed),
                remaining: formatMinutes(group.remainingPrepaidMinutes),
              })}
            </Typography>

            <ResponsiveTable
              header={
                <>
                  <Grid size={1.8}>{t('flightLog.date')}</Grid>
                  <Grid size={1.2}>{t('flightLog.departure')}</Grid>
                  <Grid size={1.2}>{t('flightLog.arrival')}</Grid>
                  <Grid size={1.1}>{t('invoicing.billableMinutes')}</Grid>
                  <Grid size={1.5}>{t('invoicing.availablePrepaidMinutes')}</Grid>
                  <Grid size={1.5}>{t('invoicing.prepaidMinutesUsed')}</Grid>
                  <Grid size={1.5}>{t('invoicing.standardMinutes')}</Grid>
                  <Grid size={1.5}>{t('invoicing.remainingPrepaidMinutes')}</Grid>
                </>
              }
              notFoundMsg={t('invoicing.noPrepaidFlights')}
              rows={group.flights}
              row={(flight) => (
                <>
                  <Grid size={{ xs: 12, md: 1.8 }}>
                    <Box>{formatISODate(flight.takeoffTimeUtc)}</Box>
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {flight.billableMemberLastName}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 1.2 }}>{flight.departureAirport}</Grid>
                  <Grid size={{ xs: 6, md: 1.2 }}>{flight.arrivalAirport}</Grid>
                  <Grid size={{ xs: 6, md: 1.1 }}>{formatMinutes(flight.billableMinutes)}</Grid>
                  <Grid size={{ xs: 6, md: 1.5 }}>
                    {formatMinutes(flight.availablePrepaidMinutes)}
                  </Grid>
                  <Grid size={{ xs: 6, md: 1.5 }}>{formatMinutes(flight.prepaidMinutesUsed)}</Grid>
                  <Grid size={{ xs: 6, md: 1.5 }}>{formatMinutes(flight.standardMinutes)}</Grid>
                  <Grid size={{ xs: 12, md: 1.5 }}>
                    {formatMinutes(flight.remainingPrepaidMinutes)}
                  </Grid>
                </>
              )}
            />
          </Paper>
        ))}
      </RemoteContent>
      <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
        <Button color='secondary' variant='outlined' onClick={navigate.previous} sx={{ mr: 1 }}>
          {t('general.back')}
        </Button>
        <Box sx={{ flex: '1 1 auto' }} />
        <Button color='primary' variant='contained' onClick={handleNext}>
          {t('invoicing.complete')}
        </Button>
      </Box>
    </>
  )
}
