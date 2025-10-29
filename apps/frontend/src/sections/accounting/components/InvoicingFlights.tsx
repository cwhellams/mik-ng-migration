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
  useMediaQuery,
  useTheme,
  Pagination,
  Checkbox,
  Button,
} from '@mui/material'
import useApi from '../../../hooks/useApi'
import { Link } from 'react-router-dom'
import {
  FlightLogUpsertRequest,
  InvoicableFlight,
  InvoicableFlightListResponse,
  InvoicableFlightFilters,
  InvoicableFlights,
} from '@backend/routes/flight-log/models'
import { RemoteContent } from '../../../components/RemoteContent'
import { formatDate, formatTime } from '../../../utils/date'
import { useScrollOnRender } from '../../../hooks/useScrollOnRender'
import { useState } from 'react'
import { Problem } from '@backend/routes/response'
import { t } from 'i18next'
import { SnackAlert } from '../../../components/SnackAlert'

export const InvoicingFlights = ({
  filters,
  setFilters,
  navigate,
}: {
  filters: InvoicableFlightFilters
  setFilters: (filters: InvoicableFlightFilters) => void
  navigate: {
    next: () => void
    previous: () => void
  }
}) => {
  const { data, isLoading, error, mutation } = useApi<
    InvoicableFlightListResponse,
    InvoicableFlight
  >({
    url: 'v1/invoices/flights',
    params: filters,
  })

  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  const scrollToRef = useScrollOnRender()

  const updateEntry = async (
    log: InvoicableFlight,
    patch: Partial<FlightLogUpsertRequest>
  ) => {
    const res = await mutation.trigger<Partial<FlightLogUpsertRequest>>(
      'PATCH',
      patch,
      `/v1/flight-logs/${log.flightId}`
    )

    setProblem(res.error ? res.error : { status: 200 })

    return res
  }

  const handleNext = async () => {
    if (filters.flights == InvoicableFlights.OTHER) {
      const res = await mutation.trigger<InvoicableFlightFilters>('POST', {
        aircraftRegistration: filters.aircraftRegistration,
        endDate: filters.endDate,
      })
      if (res.error) {
        return setProblem(res.error)
      }
    }

    navigate.next()
  }

  const nextButtonLabel = () => {
    const length = data?.logs.length ?? 0
    if (filters.flights == InvoicableFlights.KOE) {
      return t('invoicing.completeTestFlights', { length })
    } else if (filters.flights == InvoicableFlights.SII) {
      return t('invoicing.completeFerryFlights', {
        length,
      })
    } else if (filters.flights == InvoicableFlights.COMMENT) {
      return t('invoicing.completeCommentedFlights')
    } else if (filters.flights == InvoicableFlights.OTHER) {
      return t('invoicing.complete')
    }
  }

  return (
    <>
      <SnackAlert problem={problem} />
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ pr: 0 }}>{t('flightLog.date')}</TableCell>

              <TableCell>{t('flightLog.aircraft')}</TableCell>
              <TableCell>{t('flightLog.departure')}</TableCell>
              <TableCell>{t('flightLog.arrival')}</TableCell>
              <TableCell>{t('flightLog.airborneTime')}</TableCell>
              <TableCell>{t('flightLog.flightType')}</TableCell>
              <TableCell>{t('flightLog.billingRemarks')}</TableCell>
              {!isXs && <TableCell>{t('invoicing.isFreeFlight')}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            <RemoteContent isLoading={isLoading} error={error} colSpan={8}>
              {data?.logs.map((log) => [
                <TableRow key={log.flightId}>
                  <TableCell>
                    <Link
                      ref={
                        location.hash == `#${log.flightId}`
                          ? scrollToRef
                          : undefined
                      }
                      to={`/flight-logs/${log.flightId}`}
                    >
                      {formatDate(log.takeoffTimeUtc)}
                    </Link>
                    <Box>{log.billableMemberLastName}</Box>
                  </TableCell>
                  <TableCell>{log.aircraftRegistration}</TableCell>
                  <TableCell>
                    {log.departureAirport}
                    <Box>{formatTime(log.takeoffTimeUtc)}</Box>
                  </TableCell>
                  <TableCell>
                    {log.arrivalAirport}
                    <Box>{formatTime(log.landingTimeUtc)}</Box>
                  </TableCell>
                  <TableCell>{log.flightTime}</TableCell>
                  <TableCell>{log.flightType}</TableCell>
                  <TableCell>{log.billingRemarks}</TableCell>
                  {!isXs && (
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Checkbox
                        checked={log.isBillableFlight == false}
                        onChange={async ({ target }) => {
                          await updateEntry(log, {
                            isBillableFlight: !target.checked,
                          })
                        }}
                      />
                    </TableCell>
                  )}
                </TableRow>,
              ])}
              {(!data?.logs || data.logs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} align='center'>
                    <Typography variant='body1' py={3}>
                      {t('flightLog.noLogs')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </RemoteContent>
          </TableBody>
        </Table>
      </TableContainer>

      <Pagination
        count={data?.pages ?? 1}
        size='large'
        page={filters.page ?? 1}
        onChange={(_, page) => setFilters({ ...filters, page })}
        showFirstButton={true}
        showLastButton={true}
        siblingCount={2}
        sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
      />

      <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
        <Button
          color='secondary'
          variant='outlined'
          onClick={navigate.previous}
          sx={{ mr: 1 }}
        >
          {t('invoicing.back')}
        </Button>
        <Box sx={{ flex: '1 1 auto' }} />
        <Button color='primary' variant='contained' onClick={handleNext}>
          {nextButtonLabel()}
        </Button>
      </Box>
    </>
  )
}
