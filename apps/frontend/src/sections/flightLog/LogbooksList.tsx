import {
  Box,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { AjlbEditor } from './components/AjlbModal'
import { BaselineDialog } from './components/BaselineDialog'
import { RemoteContent } from '../../components/RemoteContent'
import { Upsert } from '@backend/types/schema'
import { AircraftJourneyLogBook, AjlbFilter, AjlbListResponse } from '@backend/routes/ajlb/model'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Icon } from '@iconify/react/dist/iconify.js'
import { FormField } from '../../components/FormField'
import { useTimezone } from '../../hooks/useTimezone'

const Roles = () => {
  const { t } = useTranslation()
  const { isFlightLogAdmin } = useRoles()

  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const { formatDate } = useTimezone()

  const [filters, setFilters] = useState<AjlbFilter>({
    current: true,
  })

  const [editMode, setEditMode] = useState<Upsert<AircraftJourneyLogBook> | undefined>(undefined)
  const [baselineOpen, setBaselineOpen] = useState(false)

  const {
    data: logbooks,
    error,
    isLoading,
  } = useApi<AjlbListResponse>(
    {
      url: 'v1/ajlb',
      params: filters,
    },
    {
      keepPreviousData: true,
    },
  )

  const currentBaseline = useMemo(() => {
    if (!filters.aircraftRegistration || !logbooks) return 0
    const books = logbooks.books.filter(
      (b) => b.aircraftRegistration === filters.aircraftRegistration,
    )
    if (!books.length) return 0
    return books.sort((a, b) => a.seqNo - b.seqNo)[0].startLandings
  }, [filters.aircraftRegistration, logbooks])

  const aircraftRegistrations = useMemo(
    () =>
      logbooks?.books.reduce(
        (planes, book) =>
          planes.includes(book.aircraftRegistration)
            ? planes
            : [...planes, book.aircraftRegistration].sort(),
        [] as string[],
      ) ?? [],
    [logbooks],
  )

  const handleEditMode = (role: AircraftJourneyLogBook) => {
    setEditMode(role)
  }

  return (
    <Box>
      <Title label={t('flightLog.logbooks.title')} />
      <Grid
        size={12}
        sx={{
          display: 'flex',
          justifyContent: 'flex-start',
          flexDirection: { xs: 'column', sm: 'row' },
          mb: 3,
        }}
      >
        <FormControl sx={{ m: 1, minWidth: 250 }}>
          <InputLabel id='role-label'>{t('flightLog.aircraft')}</InputLabel>

          <Select
            labelId='role-label'
            id='role'
            value={filters.aircraftRegistration ?? ''}
            label={t('flightLog.aircraft')}
            onChange={({ target }) => setFilters({ aircraftRegistration: target.value })}
          >
            <MenuItem value={''}>{t('flightLog.logbooks.showAll')}</MenuItem>
            {aircraftRegistrations.map((plane) => (
              <MenuItem key={plane} value={plane}>
                {plane}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {isFlightLogAdmin && filters.aircraftRegistration && (
          <Tooltip title={t('flightLog.logbooks.setBaseline')}>
            <IconButton onClick={() => setBaselineOpen(true)} color='primary' sx={{ m: 1 }}>
              <Icon icon='mdi:counter' fontSize={24} />
            </IconButton>
          </Tooltip>
        )}

        <Grid
          size={5}
          sx={{
            alignSelf: 'center',
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={!filters.current}
                onChange={(e) => setFilters({ ...filters, current: !e.target.checked })}
              />
            }
            label={t('flightLog.logbooks.showOldBooks')}
          />
        </Grid>
      </Grid>
      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          notFoundMsg={t('error.noRows')}
          header={
            <>
              <Grid size={2}>{t('flightLog.logbooks.book')}</Grid>
              <Grid size={2}>{t('flightLog.logbooks.validity')}</Grid>
              <Grid size={1}>{t('flightLog.logbooks.pagesInUse')}</Grid>
              <Grid size={1}>{t('flightLog.logbooks.flightTimeAtStart')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.verifiedTotalFlightTime')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.unverifiedFlights')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.unverifiedTotalFlightTime')}</Grid>
              <Grid size={1.5}>{t('flightLog.logbooks.totalLandings')}</Grid>
            </>
          }
          rows={logbooks?.books}
          row={(ajlb) => {
            const href = `/logs/books/${ajlb.aircraftRegistration}/${ajlb.seqNo}`
            const lastPage = ajlb.view?.lastPage ?? ajlb.startPage
            const newFlightsPage = ajlb.view?.newFlightsPage ?? lastPage

            return isMd ? (
              <>
                <Grid
                  size={2}
                  sx={{
                    display: 'flex',
                  }}
                >
                  <Link to={`${href}?page=${lastPage}`}>
                    {ajlb.aircraftRegistration} / {ajlb.seqNo}
                  </Link>
                  {isFlightLogAdmin && (
                    // <Box alignItems='center' display='flex' sx={{ mr: 1 }}>
                    <Link
                      to={'#'}
                      onClick={() => handleEditMode(ajlb)}
                      style={{ marginLeft: '8px' }}
                    >
                      <Icon icon='mdi:gear' color='#646cff' fontSize={24} />
                    </Link>
                    // </Box>
                  )}
                </Grid>
                <Grid size={2}>
                  {formatDate(ajlb.startDate)}-
                  {ajlb.endDate ? formatDate(ajlb.endDate) : t('flightLog.logbooks.current')}
                </Grid>
                <Grid size={1}>
                  {lastPage} / {ajlb.noOfPages}
                </Grid>
                <Grid size={1}>{ajlb.startFlightTime}</Grid>
                <Grid size={1.5}>{ajlb.view?.verifiedTotalFlightTime}</Grid>
                <Grid size={1.5}>
                  <Link to={`${href}?page=${newFlightsPage}`}>
                    {ajlb.view?.newFlightsCount} - {ajlb.view?.newFlightsTime}
                  </Link>
                </Grid>
                <Grid size={1.5}>{ajlb.view?.unverifiedTotalFlightTime}</Grid>
                <Grid size={1.5}>{ajlb.view?.totalLandings ?? '-'}</Grid>
              </>
            ) : (
              <>
                <Grid
                  size={12}
                  sx={{
                    display: 'flex',
                  }}
                >
                  <Link to={`${href}?page=${lastPage}`}>
                    {ajlb.aircraftRegistration} / {ajlb.seqNo}
                  </Link>
                  {isFlightLogAdmin && (
                    <Link
                      to={'#'}
                      onClick={() => handleEditMode(ajlb)}
                      style={{ marginLeft: '8px' }}
                    >
                      <Icon icon='mdi:gear' color='#646cff' fontSize={24} />
                    </Link>
                  )}
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormField label={t('flightLog.logbooks.validity')}>
                    {formatDate(ajlb.startDate)}-
                    {ajlb.endDate ? formatDate(ajlb.endDate) : t('flightLog.logbooks.current')}
                  </FormField>
                  <FormField label={t('flightLog.logbooks.pagesInUse')}>
                    {lastPage} / {ajlb.noOfPages}
                  </FormField>
                  <FormField label={t('flightLog.logbooks.flightTimeAtStart')}>
                    {ajlb.startFlightTime}
                  </FormField>
                  <FormField label={t('flightLog.logbooks.verifiedTotalFlightTime')}>
                    {ajlb.view?.verifiedTotalFlightTime}
                  </FormField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormField label={t('flightLog.logbooks.unverifiedFlights')}>
                    <Link to={`${href}?page=${newFlightsPage}`}>
                      {ajlb.view?.newFlightsCount} - {ajlb.view?.newFlightsTime}
                    </Link>
                  </FormField>
                  <FormField label={t('flightLog.logbooks.unverifiedTotalFlightTime')}>
                    {ajlb.view?.unverifiedTotalFlightTime}
                  </FormField>
                  <FormField label={t('flightLog.logbooks.totalLandings')}>
                    {ajlb.view?.totalLandings ?? '-'}
                  </FormField>
                </Grid>
              </>
            )
          }}
        />
      </RemoteContent>
      <AjlbEditor book={editMode} onClose={(newBook) => setEditMode(newBook)} />
      {filters.aircraftRegistration && (
        <BaselineDialog
          key={filters.aircraftRegistration}
          registration={filters.aircraftRegistration}
          currentBaseline={currentBaseline}
          open={baselineOpen}
          onClose={() => setBaselineOpen(false)}
        />
      )}
    </Box>
  )
}

export default Roles
