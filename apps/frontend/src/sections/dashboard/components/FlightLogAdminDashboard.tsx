import { AjlbListResponse } from '@backend/routes/ajlb/model'
import useApi from '../../../hooks/useApi'
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { RemoteContent } from '../../../components/RemoteContent'

export const FlightLogAdminDashboard = () => {
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
    }
  )

  const logbooksToValidate = logbooks?.books.filter(
    (logbook) => (logbook.view?.newFlightsCount ?? 0) > 0
  )

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <RemoteContent isLoading={isLoading} error={error}>
          <Typography variant='h5' gutterBottom>
            New Flights to Validate
          </Typography>

          <List>
            {logbooksToValidate?.length === 0 && (
              <Typography>No new flights to validate.</Typography>
            )}
            {logbooksToValidate?.map((ajlb) => (
              <ListItem key={`${ajlb.aircraftRegistration}-${ajlb.seqNo}`}>
                <ListItemText
                  primary={
                    <Link
                      to={`/flight-logs?aircraftRegistration=${ajlb.aircraftRegistration}&ajlbSeqNo=${ajlb.seqNo}&page=${ajlb.view?.newFlightsPage}`}
                    >
                      {ajlb.aircraftRegistration} - {ajlb.seqNo}
                    </Link>
                  }
                  secondary={`${ajlb.view?.newFlightsCount} new flights`}
                />
              </ListItem>
            ))}
          </List>
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
