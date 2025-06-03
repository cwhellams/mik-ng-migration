import { AircraftJourneyLogBook } from '@backend/routes/ajlb/model'
import { FlightLogFilters } from '@backend/routes/flight-log/models'
import { Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { t } from 'i18next'

type Props = {
  logbooks: AircraftJourneyLogBook[]
  filters: FlightLogFilters
  setFilters: (filters: FlightLogFilters) => void
}

export const FlightLogQuery = ({ filters, setFilters, logbooks }: Props) => {
  const planeBooks = logbooks.filter(
    (book) => book.aircraftRegistration == filters.aircraftRegistration
  )

  return (
    <Grid
      size={12}
      direction='column'
      display='flex'
      justifyContent={'flex-start'}
      flexDirection={{ xs: 'column', sm: 'row' }}
      sx={{ mb: 3 }}
    >
      <FormControl sx={{ m: 1, minWidth: 250 }}>
        <InputLabel id='role-label'>{t('flightLog.aircraft')}</InputLabel>

        <Select
          labelId='role-label'
          id='role'
          value={
            logbooks.length > 0 && filters.aircraftRegistration
              ? filters.aircraftRegistration
              : ''
          }
          label={t('flightLog.aircraft')}
          onChange={({ target }) =>
            setFilters({ aircraftRegistration: target.value })
          }
        >
          {logbooks
            .reduce(
              (planes, book) =>
                planes.includes(book.aircraftRegistration)
                  ? planes
                  : [...planes, book.aircraftRegistration].sort(),
              [] as string[]
            )
            .map((plane) => (
              <MenuItem key={plane} value={plane}>
                {plane}
              </MenuItem>
            ))}
        </Select>
      </FormControl>

      <FormControl sx={{ m: 1, minWidth: 250 }}>
        <InputLabel id='role-label'>{t('flightLog.logbooks.ajlb')}</InputLabel>

        <Select
          labelId='role-label'
          id='role'
          value={
            planeBooks.length > 0 && filters.ajlbSeqNo ? filters.ajlbSeqNo : ''
          }
          label={t('flightLog.logbooks.ajlb')}
          onChange={({ target }) => {
            const book = planeBooks.find(
              (book) =>
                book.aircraftRegistration == filters.aircraftRegistration &&
                book.seqNo == target.value
            )
            setFilters({
              ...filters,
              ajlbSeqNo: target.value,
              page: book?.pagesInUse,
            })
          }}
        >
          <MenuItem value=''>{t('flightLog.logbooks.showAll')}</MenuItem>
          {planeBooks.map((book) => (
            <MenuItem key={`${book.seqNo}`} value={book.seqNo}>
              {book.endDate
                ? `${book.startDate} - ${book.endDate}`
                : `${book.startDate} - ${t('flightLog.logbooks.current')}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Grid>
  )
}
