import { AircraftListResponse } from '@mik/contracts/aircrafts'
import { FlightLogFilters } from '@mik/contracts/flight-log'
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { t } from 'i18next'
import useApi from '../../../hooks/useApi'
import { endpoints } from '../../../api/endpoints'

type Props = {
  registration?: string
  setFilters: (filters: FlightLogFilters) => void
}

export const FlightLogQuery = ({ registration, setFilters }: Props) => {
  const { data } = useApi<AircraftListResponse>({
    url: endpoints.aircrafts.root,
    params: { activeOnly: true },
  })

  return (
    <FormControl size='small' sx={{ minWidth: 160 }}>
      <InputLabel id='role-label'>{t('flightLog.aircraft')}</InputLabel>

      <Select
        labelId='role-label'
        id='role'
        size='small'
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
