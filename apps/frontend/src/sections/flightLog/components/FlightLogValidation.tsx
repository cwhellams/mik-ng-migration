import {
  FlightLogListEntry,
  FlightLogListResponse,
  FlightLogStatus,
} from '@mik/contracts/flight-log'
import { Card, CardContent, Stack, Button, Typography } from '@mui/material'
import { t } from 'i18next'
import { FormField } from '../../../components/FormField'
import { FormTitle } from '../../../components/FormTitle'
import { Icon } from '@iconify/react'
import { AircraftJourneyLogBook } from '@mik/contracts/ajlb'
import { useRoles } from '../../../hooks/useRoles'
import { useTimezone } from '../../../hooks/useTimezone'

export const FlightLogValidation = ({
  ajlb,
  data,
  navigateToNewFlightsPage,
  validateEntry,
  isMutating,
}: {
  ajlb: AircraftJourneyLogBook
  data: FlightLogListResponse
  navigateToNewFlightsPage: () => void
  validateEntry: (log: FlightLogListEntry, isLast?: boolean) => Promise<boolean>
  isMutating: boolean
}) => {
  const view = ajlb.view ?? {
    lastPage: 0,
    newFlightsCount: 0,
    newFlightsPage: 0,
    newFlightsTime: '00:00',
    flightTime: '00:00',
    totalFlightTime: '00:00',
    validatedBeforeUTC: null,
  }

  const { isFlightLogAdmin } = useRoles()

  const hasNewFlights = view.newFlightsCount > 0

  const pageValidated = data.logs.every((log) => log.status !== FlightLogStatus.NEW)

  const unverifiedFlights = data?.logs.filter((log) => log.status === FlightLogStatus.NEW) ?? []

  const { formatDate } = useTimezone()

  return (
    <Card sx={{ flex: 1, mt: 10 }}>
      <CardContent
        sx={{
          borderWidth: '8px',
          borderStyle: 'solid',
          borderColor: pageValidated ? 'green' : 'orange',
          borderRadius: 2,
          boxShadow: 1,
        }}
      >
        <FormTitle title={t('flightLog.logbooks.validateTitle')} icon='mdi:check' />

        <Stack spacing={2}>
          <Stack
            direction={'row'}
            sx={{
              alignItems: 'center',
            }}
          >
            <Typography
              variant='body1'
              sx={{
                mr: 2,
              }}
            >
              {data?.page == view.lastPage
                ? t('flightLog.logbooks.lastAirborneTime')
                : t('flightLog.logbooks.carriedForward')}
            </Typography>
            <Typography
              variant='h3'
              sx={{
                mr: 2,
              }}
            >
              {data?.logs.at(-1)?.acTotalFlightTime}
            </Typography>
          </Stack>

          {hasNewFlights && view.newFlightsPage != data.page && (
            <Button
              variant='outlined'
              color='primary'
              startIcon={<Icon icon='mdi:arrow' color='green' />}
              onClick={navigateToNewFlightsPage}
            >
              {t('flightLog.logbooks.goToNewFlights', {
                page: view.newFlightsPage,
              })}
            </Button>
          )}

          {isFlightLogAdmin && hasNewFlights && view.newFlightsPage == data.page && (
            <Button
              variant='contained'
              color='primary'
              startIcon={<Icon icon='mdi:check' color='green' />}
              loadingPosition='start'
              loading={isMutating}
              onClick={async () => {
                for (const [index, log] of unverifiedFlights.entries()) {
                  const isLast = index == unverifiedFlights.length - 1

                  const res = await validateEntry(log, isLast)
                  if (!res) {
                    // operation failed, stop processing
                    return
                  }
                }
              }}
            >
              {t('flightLog.logbooks.validateAll', {
                count: unverifiedFlights.length,
              })}
            </Button>
          )}
          {hasNewFlights && (
            <>
              <Typography
                variant='h6'
                sx={{
                  mb: 2,
                }}
              >
                {t('flightLog.logbooks.newFlightsSince', {
                  date: formatDate(view.validatedBeforeUTC),
                })}
              </Typography>
              <FormField label={t(`flightLog.logbooks.newFlightsCount`)} width={200}>
                {view.newFlightsCount}
              </FormField>
              <FormField label={t(`flightLog.logbooks.newFlightsTime`)} width={200}>
                {view.newFlightsTime}
              </FormField>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
