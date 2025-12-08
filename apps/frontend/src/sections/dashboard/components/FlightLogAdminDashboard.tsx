import { AjlbListResponse } from '@backend/routes/ajlb/model'
import useApi from '../../../hooks/useApi'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
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
    <Accordion defaultExpanded sx={{ mt: 4 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant='h5'>New Flights to Validate</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <RemoteContent isLoading={isLoading} error={error}>
          <List>
            {logbooksToValidate?.length === 0 && (
              <Typography>No new flights to validate.</Typography>
            )}
            {logbooksToValidate?.map((ajlb) => (
              <ListItem key={`${ajlb.aircraftRegistration}-${ajlb.seqNo}`}>
                <ListItemText
                  primary={
                    <Link
                      to={`/logs?aircraftRegistration=${ajlb.aircraftRegistration}&ajlbSeqNo=${ajlb.seqNo}&page=${ajlb.view?.newFlightsPage}`}
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
      </AccordionDetails>
    </Accordion>
  )
}
