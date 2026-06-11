import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { FlightLogFilters } from '@backend/routes/flight-log/models'
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { t } from 'i18next'
import useApi from '../../../hooks/useApi'

type Props = {
  registration?: string
  setFilters: (filters: FlightLogFilters) => void
}

export const FlightLogQuery = ({ registration, setFilters }: Props) => {
  const { data } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
    params: { activeOnly: true },
  })

  return (
    <FormControl sx={{ m: 1, minWidth: 250 }}>
      <InputLabel id='role-label'>{t('flightLog.aircraft')}</InputLabel>

      <Select
        labelId='role-label'
        id='role'
        value={registration ?? ''}
        label={t('flightLog.aircraft')}
        onChange={({ target }) => setFilters({ aircraftRegistration: target.value })}
      >
        <MenuItem value={''}>{t('flightLog.logbooks.showAll')}</MenuItem>
        {data?.aircrafts.map((plane) => (
          <MenuItem key={plane.registration} value={plane.registration}>
            {plane.registration}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
