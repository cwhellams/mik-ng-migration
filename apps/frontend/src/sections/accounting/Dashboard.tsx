import { AjlbListResponse } from '@mik/contracts/ajlb'
import useApi from '../../hooks/useApi'
import { Card, CardContent, Typography, List, ListItem, ListItemText } from '@mui/material'
import { Link } from 'react-router'
import { RemoteContent } from '../../components/RemoteContent'
import { formatDuration, splitTime } from '../flightLog/utils/timeUtils'
import { t } from 'i18next'

export const InvoicingAdminDashboard = () => {
  // fetch list of aircraft journey log books
  const {
    data: logbooks,
    isLoading,
    error,
  } = useApi<AjlbListResponse>(
    {
      url: 'v1/ajlb',
    },
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  )

  const logbooksToValidate =
    logbooks?.books.reduce(
      (acc, logbook) => {
        const existing = acc[logbook.aircraftRegistration]

        const newFlightTime = splitTime(logbook.view?.validatedFlightsTime ?? '00:00')
        const newFlightMins = newFlightTime.hours * 60 + newFlightTime.minutes

        return {
          ...acc,
          [logbook.aircraftRegistration]: {
            ...logbook,
            validatedCount:
              (existing?.validatedCount ?? 0) + (logbook.view?.validatedFlightsCount ?? 0),
            validatedMins: (existing?.validatedMins ?? 0) + newFlightMins,
          },
        }
      },
      {} as Record<
        string,
        {
          aircraftRegistration: string
          validatedCount: number
          validatedMins: number
        }
      >,
    ) ?? {}

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <RemoteContent isLoading={isLoading} error={error}>
          <Typography variant='h5' gutterBottom>
            {t('invoicing.dashboard.title')}
          </Typography>

          <List>
            {Object.values(logbooksToValidate).map((ajlb) => (
              <ListItem key={ajlb.aircraftRegistration}>
                <ListItemText
                  primary={
                    <Link
                      to={`/accounting/invoicing?step=0&registration=${ajlb.aircraftRegistration}`}
                    >
                      {ajlb.aircraftRegistration}
                    </Link>
                  }
                  secondary={t('invoicing.dashboard.secondary', {
                    length: ajlb.validatedCount,
                    time: formatDuration(ajlb.validatedMins),
                  })}
                />
              </ListItem>
            ))}
          </List>
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
