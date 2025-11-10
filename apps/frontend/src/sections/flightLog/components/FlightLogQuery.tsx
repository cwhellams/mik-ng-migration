import { AircraftJourneyLogBook } from '@backend/routes/ajlb/model'
import { FlightLogFilters } from '@backend/routes/flight-log/models'
import { Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { t } from 'i18next'
import { useRoles } from '../../../hooks/useRoles'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'

type Props = {
  logbooks: AircraftJourneyLogBook[]
  filters: FlightLogFilters
  setFilters: (filters: FlightLogFilters) => void
}

export const FlightLogQuery = ({ filters, setFilters, logbooks }: Props) => {
  const { isFlightLogAdmin } = useRoles()

  const planeBooks = logbooks.filter(
    (book) =>
      !filters.aircraftRegistration ||
      book.aircraftRegistration == filters.aircraftRegistration
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
          <MenuItem value={''}>{t('flightLog.logbooks.showAll')}</MenuItem>
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

      <Grid
        size={5}
        direction='column'
        display='flex'
        justifyContent={'flex-end'}
      >
        <FormControl sx={{ m: 1, minWidth: 250 }}>
          <InputLabel id='ajlb-label'>
            {t('flightLog.logbooks.ajlb')}
          </InputLabel>

          <Select
            labelId='ajlb-label'
            id='ajlb'
            value={
              filters.aircraftRegistration && filters.ajlbSeqNo
                ? `${filters.aircraftRegistration}:${filters.ajlbSeqNo}`
                : ''
            }
            label={t('flightLog.logbooks.ajlb')}
            onChange={({ target }) => {
              const [aircraftRegistration, seqNo] = target.value?.split(
                ':'
              ) ?? ['', '']
              const book = planeBooks.find(
                (book) =>
                  book.aircraftRegistration == aircraftRegistration &&
                  book.seqNo == Number(seqNo)
              )
              setFilters({
                ...filters,
                aircraftRegistration: book?.aircraftRegistration,
                ajlbSeqNo: book?.seqNo,
                page: book?.view?.lastPage ?? book?.startPage ?? 1,
              })
            }}
          >
            <MenuItem value=''>{t('flightLog.logbooks.showAll')}</MenuItem>
            {planeBooks.map((book) => (
              <MenuItem
                key={`${book.aircraftRegistration}:${book.seqNo}`}
                value={`${book.aircraftRegistration}:${book.seqNo}`}
              >
                {book.endDate
                  ? `${book.aircraftRegistration}: ${book.startDate} - ${book.endDate}`
                  : `${book.aircraftRegistration}: ${book.startDate} - ${t('flightLog.logbooks.current')}`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {isFlightLogAdmin && (
          <Grid alignItems='center' display='flex' sx={{ mr: 1, fontSize: 24 }}>
            <Link to='/flight-logs/logbooks'>
              <Icon icon='mdi:gear' color='#646cff' />
            </Link>
          </Grid>
        )}
      </Grid>
    </Grid>
  )
}
