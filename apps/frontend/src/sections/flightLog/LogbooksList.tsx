import { Box, Grid } from '@mui/material'
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
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'

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
      <Title label={t('flightLog.logbooks.title')} />

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          notFoundMsg={t('error.noRows')}
          header={
            <>
              <Grid size={2}>{t('flightLog.logbooks.seqNo')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.validFrom')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.validTo')}</Grid>
              <Grid size={0.5}>{t('flightLog.logbooks.rowsPerPage')}</Grid>
              <Grid size={1}>{t('flightLog.logbooks.pagesInUse')}</Grid>
              <Grid size={1.5}>
                {t('flightLog.logbooks.flightTimeAtStart')}
              </Grid>
              <Grid size={1.5}>
                {t('flightLog.logbooks.verifiedTotalFlightTime')}
              </Grid>
              <Grid size={1.5}>
                {t('flightLog.logbooks.unverifiedFlights')}
              </Grid>
              <Grid size={1}>
                {t('flightLog.logbooks.unverifiedTotalFlightTime')}
              </Grid>
            </>
          }
          rows={logbooks?.books}
          row={(ajlb) => (
            <>
              <Grid size={{ xs: 4, md: 2 }}>
                {isFlightLogAdmin ? (
                  <Link to={'#'} onClick={() => handleEditMode(ajlb)}>
                    {ajlb.aircraftRegistration} / {ajlb.seqNo}
                  </Link>
                ) : (
                  <>
                    {ajlb.aircraftRegistration} / {ajlb.seqNo}
                  </>
                )}
              </Grid>
              <Grid size={{ xs: 4, md: 1.5 }}>{ajlb.startDate}</Grid>
              <Grid size={{ xs: 4, md: 1.5 }}>{ajlb.endDate}</Grid>
              <Grid size={{ xs: 4, md: 0.5 }}>{ajlb.rowsPerPage}</Grid>
              <Grid size={{ xs: 4, md: 1 }}>
                {ajlb.view?.lastPage} / {ajlb.noOfPages}
              </Grid>
              <Grid size={{ xs: 4, md: 1.5 }}>{ajlb.startFlightTime}</Grid>
              <Grid size={{ xs: 4, md: 1.5 }}>
                {ajlb.view?.verifiedTotalFlightTime}
              </Grid>
              <Grid size={{ xs: 4, md: 1.5 }}>
                <Link
                  to={`/logs?aircraftRegistration=${ajlb.aircraftRegistration}&ajlbSeqNo=${ajlb.seqNo}&page=${ajlb.view?.newFlightsPage}`}
                >
                  {ajlb.view?.newFlightsCount} - {ajlb.view?.newFlightsTime}
                </Link>
              </Grid>
              <Grid size={{ xs: 4, md: 1 }}>
                {ajlb.view?.unverifiedTotalFlightTime}
              </Grid>
            </>
          )}
        />
      </RemoteContent>
      <AjlbEditor book={editMode} onClose={(newBook) => setEditMode(newBook)} />
    </Box>
  )
}

export default Roles
