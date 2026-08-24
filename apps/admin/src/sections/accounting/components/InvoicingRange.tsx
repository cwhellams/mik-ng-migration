import { Box, Button, FormControl, Grid, InputLabel, MenuItem, Select } from '@mui/material'
import useApi from '@mik/ui/hooks/useApi'
import { InvoicableFlightFilters } from '@mik/contracts/flight-log'
import { dayjs } from '@mik/ui/utils/date'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { AjlbListResponse } from '@mik/contracts/ajlb'
import { t } from 'i18next'
import { RemoteContent } from '@mik/ui/components/RemoteContent'

export const InvoicingRange = ({
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
  const {
    data: logbooksData,
    isLoading,
    error,
  } = useApi<AjlbListResponse>({
    url: 'v1/ajlb',
    params: { current: true },
  })

  const aircrafts = logbooksData?.books?.map((b) => b.aircraftRegistration) ?? []

  const ajlb = logbooksData?.books?.find(
    (b) => b.aircraftRegistration === filters.aircraftRegistration,
  )

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Grid
        container
        spacing={2}
        sx={{
          mb: 2,
        }}
      >
        <Grid size={{ xs: 12, sm: 3 }}>
          <FormControl fullWidth>
            <InputLabel shrink>{t('flightLog.aircraft')}</InputLabel>

            <Select
              label={t('flightLog.aircraft')}
              value={filters.aircraftRegistration ?? ''}
              onChange={({ target }) =>
                setFilters({
                  ...filters,
                  aircraftRegistration: target.value ?? '',
                })
              }
            >
              <MenuItem value={''}>{t('--')}</MenuItem>
              {aircrafts.map((plane) => (
                <MenuItem key={plane} value={plane}>
                  {plane}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <DatePicker
            disableFuture={true}
            label={t('billing.filters.endDate')}
            value={dayjs(filters.endDate)}
            onChange={(newValue) =>
              setFilters({
                ...filters,
                endDate: newValue ? newValue.format('YYYY-MM-DD') : '',
              })
            }
            format={t('general.dateFormat')}
            maxDate={
              ajlb?.view?.validatedBeforeUTC
                ? dayjs(ajlb.view.validatedBeforeUTC).startOf('day').add(1, 'day')
                : undefined
            }
          />
        </Grid>
      </Grid>
      <Box sx={{ display: 'flex', flexDirection: 'row-reverse', pt: 2 }}>
        <Button
          color='primary'
          variant='contained'
          onClick={navigate.next}
          disabled={!filters.endDate}
        >
          {t('invoicing.start')}
        </Button>
      </Box>
    </RemoteContent>
  )
}
