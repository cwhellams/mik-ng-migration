import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { AjlbEditor } from './components/AjlbModal'
import { RemoteContent } from '../../components/RemoteContent'
import { Upsert } from '@backend/types/schema'
import {
  AircraftJourneyLogBook,
  AjlbListResponse,
} from '@backend/routes/ajlb/model'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'

const Roles = () => {
  const { t } = useTranslation()
  const { isFlightLogAdmin } = useRoles()

  const [editMode, setEditMode] = useState<
    Upsert<AircraftJourneyLogBook> | undefined
  >(undefined)

  const {
    data: logbooks,
    error,
    isLoading,
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

  const handleEditMode = (role: AircraftJourneyLogBook) => {
    setEditMode(role)
  }

  return (
    <Box>
      <Typography variant='h2' gutterBottom>
        {t('flightLog.logbooks.ajlb')}
      </Typography>

      <TableContainer component={Paper}>
        <Table aria-label='simple table'>
          <TableHead>
            <TableRow>
              <TableCell>{t('flightLog.logbooks.seqNo')}</TableCell>
              <TableCell>{t('flightLog.logbooks.validFrom')}</TableCell>
              <TableCell>{t('flightLog.logbooks.validTo')}</TableCell>
              <TableCell>{t('flightLog.logbooks.rowsPerPage')}</TableCell>
              <TableCell width={100}>
                {t('flightLog.logbooks.pagesInUse')}
              </TableCell>
              <TableCell>{t('flightLog.logbooks.flightTimeAtStart')}</TableCell>
              <TableCell>
                {t('flightLog.logbooks.validatedFlightTime')}
              </TableCell>
              <TableCell>{t('flightLog.logbooks.unverifiedFlights')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <RemoteContent isLoading={isLoading} error={error} colSpan={3}>
              {logbooks?.books.map((ajlb) => (
                <TableRow
                  key={`${ajlb.aircraftRegistration}-${ajlb.seqNo}`}
                  sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                >
                  <TableCell component='th' scope='row'>
                    {isFlightLogAdmin ? (
                      <Link to={'#'} onClick={() => handleEditMode(ajlb)}>
                        {ajlb.aircraftRegistration} / {ajlb.seqNo}
                      </Link>
                    ) : (
                      <>
                        {ajlb.aircraftRegistration} / {ajlb.seqNo}
                      </>
                    )}
                  </TableCell>
                  <TableCell>{ajlb.startDate}</TableCell>
                  <TableCell>{ajlb.endDate}</TableCell>
                  <TableCell>{ajlb.rowsPerPage}</TableCell>
                  <TableCell>
                    {ajlb.view?.lastPage} / {ajlb.noOfPages}
                  </TableCell>
                  <TableCell>
                    {ajlb.startFlightTime}
                  </TableCell>
                  <TableCell>{ajlb.view?.validatedFlightTime}</TableCell>
                  <TableCell>
                    <Link
                      to={`/flight-logs?aircraftRegistration=${ajlb.aircraftRegistration}&ajlbSeqNo=${ajlb.seqNo}&page=${ajlb.view?.newFlightsPage}`}
                    >
                      {ajlb.view?.newFlightsCount}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </RemoteContent>
          </TableBody>
        </Table>
      </TableContainer>
      <AjlbEditor book={editMode} onClose={(newBook) => setEditMode(newBook)} />
    </Box>
  )
}

export default Roles
