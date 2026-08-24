import {
  Box,
  useMediaQuery,
  useTheme,
  Pagination,
  Button,
  TextField,
  Typography,
  Link,
} from '@mui/material'
import useApi from '@mik/ui/hooks/useApi'
import {
  InvoicableFlight,
  InvoicableFlightListResponse,
  InvoicableFlightFilters,
  InvoicableFlights,
  FlightCredit,
} from '@mik/contracts/flight-log'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { useScrollOnRender } from '@mik/ui/hooks/useScrollOnRender'
import { useState } from 'react'
import { Problem } from '@mik/contracts/problem'
import { t } from 'i18next'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import { Grid } from '@mui/system'
import {
  ViewMobileCrew,
  ViewMobileFlightDetails,
  FlightLogTimeline,
  ViewFlightDate,
} from '@mik/ui/components/FlightListEntry'
import { ResponsiveTable } from '@mik/ui/components/ResponsiveTable'

export const PartiallyBillableFlights = ({
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
  const { data, isLoading, error, mutation } = useApi<InvoicableFlightListResponse, FlightCredit>({
    url: 'v1/invoices/flights',
    params: { ...filters, flights: InvoicableFlights.PARTIALLY_BILLABLE },
  })

  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))
  const { formatTime } = useTimezone()

  const [problem, setProblem] = useState<Problem | undefined>(undefined)
  const [creditedMinsMap, setCreditedMinsMap] = useState<Record<string, string>>({})
  const [creditedNoteMap, setCreditedNoteMap] = useState<Record<string, string>>({})

  const scrollToRef = useScrollOnRender()

  const saveCreditedMins = async (log: InvoicableFlight) => {
    const raw = creditedMinsMap[log.flightId]
    // Fall back to the existing saved value when the user hasn't modified the minutes field
    const mins = raw === undefined ? (log.creditedMins ?? Number.NaN) : Number.parseInt(raw, 10)
    const note = (creditedNoteMap[log.flightId] ?? log.creditedNote ?? '').trim()
    if (Number.isNaN(mins) || mins < 1) {
      setProblem({
        status: 400,
        title: t('invoicing.creditedMinsInvalid'),
      } as Problem)
      return
    }

    const res = await mutation.trigger<{
      creditedMins: number
      note: string | null
    }>('PUT', { creditedMins: mins, note: note.length > 0 ? note : null }, `${log.flightId}/credit`)
    setProblem(res.error ?? { status: 200 })
  }

  const handleNext = async () => {
    // Auto-save any pending credited mins/notes the user hasn't explicitly saved
    const pendingFlights = (data?.logs ?? []).filter(
      (log) =>
        creditedMinsMap[log.flightId] !== undefined || creditedNoteMap[log.flightId] !== undefined,
    )
    for (const log of pendingFlights) {
      await saveCreditedMins(log)
    }
    navigate.next()
  }

  return (
    <>
      <SnackAlert problem={problem} />
      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={1.5}>{t('flightLog.date')}</Grid>
              <Grid size={1.3}>{t('flightLog.aircraft')}</Grid>
              <Grid size={1.1}>{t('flightLog.departure')}</Grid>
              <Grid size={1.1}>{t('flightLog.arrival')}</Grid>
              <Grid size={1}>{t('flightLog.airborneTime')}</Grid>
              <Grid size={3}>{t('flightLog.billingRemarks')}</Grid>
              <Grid size={'grow'}>{t('invoicing.creditedMins')}</Grid>
            </>
          }
          notFoundMsg={t('flightLog.noLogs')}
          rows={data?.logs}
          row={(log) => (
            <>
              <Grid size={{ xs: 3, md: 1.5 }}>
                <ViewFlightDate
                  flightId={log.flightId}
                  date={log.takeoffTimeUtc}
                  link={true}
                  ref={scrollToRef}
                />
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  {log.billableMemberLastName}
                </Box>
              </Grid>

              <Grid size={{ xs: 3, md: 1.3 }}>{log.aircraftRegistration}</Grid>

              {isMd ? (
                <>
                  <Grid size={1.1}>
                    {log.departureAirport}
                    <Box>{formatTime(log.takeoffTimeUtc)}</Box>
                  </Grid>
                  <Grid size={1.1}>
                    {log.arrivalAirport}
                    <Box>{formatTime(log.landingTimeUtc)}</Box>
                  </Grid>
                  <Grid size={1}>{log.flightTime}</Grid>
                  <Grid size={3}>
                    <Typography variant='body2'>{log.billingRemarks}</Typography>
                    <Link href={`/flight-logs/${log.flightId}`} variant='caption' underline='hover'>
                      {t('invoicing.viewFlightLog')}
                    </Link>
                  </Grid>
                  <Grid
                    size={'grow'}
                    sx={{
                      display: { xs: 'none', md: 'flex' },
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        width: '100%',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        <TextField
                          size='small'
                          type='number'
                          placeholder={log.creditedMins == null ? '' : String(log.creditedMins)}
                          value={
                            creditedMinsMap[log.flightId] ??
                            (log.creditedMins == null ? '' : String(log.creditedMins))
                          }
                          onChange={({ target }) =>
                            setCreditedMinsMap((prev) => ({
                              ...prev,
                              [log.flightId]: target.value,
                            }))
                          }
                          sx={{ width: 80 }}
                          slotProps={{
                            htmlInput: { min: 1, max: log.flightMins },
                          }}
                        />
                        <Button
                          size='small'
                          variant='outlined'
                          onClick={() => saveCreditedMins(log)}
                        >
                          {t('invoicing.saveCreditedMins')}
                        </Button>
                      </Box>
                      <TextField
                        size='small'
                        value={creditedNoteMap[log.flightId] ?? log.creditedNote ?? ''}
                        onChange={({ target }) =>
                          setCreditedNoteMap((prev) => ({
                            ...prev,
                            [log.flightId]: target.value,
                          }))
                        }
                        placeholder={t('invoicing.creditedNote')}
                        fullWidth
                      />
                    </Box>
                  </Grid>
                </>
              ) : (
                <>
                  <ViewMobileFlightDetails
                    size={6}
                    numberOfLandings={log.numberOfLandings}
                    flightType={log.flightType}
                  >
                    <span />
                  </ViewMobileFlightDetails>

                  <ViewMobileCrew
                    size={3}
                    personsOnBoard={log.personsOnBoard}
                    crew={[log.billableMemberLastName]}
                  />

                  <Grid size={8}>
                    <FlightLogTimeline
                      departureAirport={log.departureAirport}
                      arrivalAirport={log.arrivalAirport}
                      takeoffTimeUtc={log.takeoffTimeUtc}
                      landingTimeUtc={log.landingTimeUtc}
                      flightTime={log.flightTime}
                    />
                  </Grid>

                  <Grid size={12}>
                    <Typography variant='body2'>{log.billingRemarks}</Typography>
                    <Link href={`/flight-logs/${log.flightId}`} variant='caption' underline='hover'>
                      {t('invoicing.viewFlightLog')}
                    </Link>
                  </Grid>

                  <Grid
                    size={12}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        width: '100%',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        <TextField
                          size='small'
                          type='number'
                          placeholder={log.creditedMins == null ? '' : String(log.creditedMins)}
                          value={
                            creditedMinsMap[log.flightId] ??
                            (log.creditedMins == null ? '' : String(log.creditedMins))
                          }
                          onChange={({ target }) =>
                            setCreditedMinsMap((prev) => ({
                              ...prev,
                              [log.flightId]: target.value,
                            }))
                          }
                          sx={{ width: 80 }}
                          slotProps={{
                            htmlInput: { min: 1, max: log.flightMins },
                          }}
                        />
                        <Button
                          size='small'
                          variant='outlined'
                          onClick={() => saveCreditedMins(log)}
                        >
                          {t('invoicing.saveCreditedMins')}
                        </Button>
                      </Box>
                      <TextField
                        size='small'
                        value={creditedNoteMap[log.flightId] ?? log.creditedNote ?? ''}
                        onChange={({ target }) =>
                          setCreditedNoteMap((prev) => ({
                            ...prev,
                            [log.flightId]: target.value,
                          }))
                        }
                        placeholder={t('invoicing.creditedNote')}
                        fullWidth
                      />
                    </Box>
                  </Grid>
                </>
              )}
            </>
          )}
        />
      </RemoteContent>
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
        <Button color='secondary' variant='outlined' onClick={navigate.previous} sx={{ mr: 1 }}>
          {t('general.back')}
        </Button>
        <Box sx={{ flex: '1 1 auto' }} />
        <Button color='primary' variant='contained' onClick={handleNext}>
          {t('invoicing.completePartiallyBillable')}
        </Button>
      </Box>
    </>
  )
}
