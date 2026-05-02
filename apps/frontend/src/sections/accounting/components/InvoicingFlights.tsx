import {
  Box,
  useMediaQuery,
  useTheme,
  Pagination,
  Checkbox,
  Button,
  TextField,
} from '@mui/material'
import useApi from '../../../hooks/useApi'
import {
  FlightLogUpsertRequest,
  InvoicableFlight,
  InvoicableFlightListResponse,
  InvoicableFlightFilters,
  InvoicableFlights,
} from '@backend/routes/flight-log/models'
import { RemoteContent } from '../../../components/RemoteContent'
import { useTimezone } from '../../../hooks/useTimezone'
import { useScrollOnRender } from '../../../hooks/useScrollOnRender'
import { useState } from 'react'
import { Problem } from '@backend/routes/response'
import { t } from 'i18next'
import { SnackAlert } from '../../../components/SnackAlert'
import { Grid } from '@mui/system'
import {
  ViewMobileCrew,
  ViewMobileFlightDetails,
  ViewMobileFlightTime,
} from '../../flightLog/components/FlightListEntry'
import { ViewFlightDate } from '../../flightLog/components/FlightListEntry'
import { ResponsiveTable } from '../../../components/ResponsiveTable'

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
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const { formatTime } = useTimezone()

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  // tracks locally-edited non-billing reasons before they are saved to the server
  const [editingReasons, setEditingReasons] = useState<Record<string, string>>(
    {}
  )

  // tracks locally-edited min-billable exception reasons before they are saved to the server
  const [editingExceptionReasons, setEditingExceptionReasons] = useState<
    Record<string, string>
  >({})

  const isMinBillableStep = filters.flights === InvoicableFlights.MIN_BILLABLE

  const showReasonField = (log: InvoicableFlight) =>
    log.isBillableFlight !== true || log.flightId in editingReasons

  const getReasonValue = (log: InvoicableFlight) =>
    editingReasons[log.flightId] ?? log.nonBillingReason ?? ''

  const handleReasonBlur = async (log: InvoicableFlight) => {
    const reason = getReasonValue(log)
    if (!reason.trim()) return
    const res = await updateEntry(log, {
      isBillableFlight: false,
      nonBillingReason: reason,
    })
    if (!res.error) {
      setEditingReasons((prev) => {
        const next = { ...prev }
        delete next[log.flightId]
        return next
      })
    }
  }

  const showExceptionField = (log: InvoicableFlight) =>
    !!log.minBillableExceptionReason || log.flightId in editingExceptionReasons

  const getExceptionReasonValue = (log: InvoicableFlight) =>
    editingExceptionReasons[log.flightId] ??
    log.minBillableExceptionReason ??
    ''

  const handleExceptionReasonBlur = async (log: InvoicableFlight) => {
    const reason = getExceptionReasonValue(log)
    if (!reason.trim()) {
      // If the reason was cleared and there was a previously saved reason, clear it on the server
      if (log.minBillableExceptionReason) {
        await updateEntry(log, { minBillableExceptionReason: null })
        setEditingExceptionReasons((prev) => {
          const next = { ...prev }
          delete next[log.flightId]
          return next
        })
      }
      return
    }
    const res = await updateEntry(log, {
      minBillableExceptionReason: reason,
    })
    if (!res.error) {
      setEditingExceptionReasons((prev) => {
        const next = { ...prev }
        delete next[log.flightId]
        return next
      })
    }
  }

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
    navigate.next()
  }

  const nextButtonLabel = () => {
    const length = data?.logs.length ?? 0
    if (filters.flights == InvoicableFlights.TEST_FLIGHT) {
      return t('invoicing.completeTestFlights', { length })
    } else if (filters.flights == InvoicableFlights.FERRY) {
      return t('invoicing.completeFerryFlights', {
        length,
      })
    } else if (filters.flights == InvoicableFlights.COMMENT) {
      return t('invoicing.completeCommentedFlights')
    } else if (filters.flights == InvoicableFlights.ENTRY_ERROR) {
      return t('invoicing.completeEntryErrorFlights')
    } else if (filters.flights == InvoicableFlights.MIN_BILLABLE) {
      return t('invoicing.completeMinBillable')
    } else if (filters.flights == InvoicableFlights.OTHER) {
      return t('invoicing.reviewPrepaidFlights')
    }
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
              <Grid size={1.5}>{t('flightLog.flightType')}</Grid>
              <Grid size={3.4}>{t('flightLog.billingRemarks')}</Grid>
              <Grid size={'grow'}>
                {isMinBillableStep
                  ? t('invoicing.isMinBillableException')
                  : t('invoicing.isFreeFlight')}
              </Grid>
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
                  <Grid size={1.5}>
                    {t(`flightLog.flightTypes.${log.flightType}`)}
                  </Grid>
                  <Grid size={{ xs: 12, md: 3.4 }}>{log.billingRemarks}</Grid>
                  <Grid size={'grow'} display={{ xs: 'none', md: 'flex' }}>
                    <Checkbox
                      checked={
                        isMinBillableStep
                          ? showExceptionField(log)
                          : log.isBillableFlight !== true ||
                            log.flightId in editingReasons
                      }
                      onChange={async ({ target }) => {
                        if (isMinBillableStep) {
                          if (target.checked) {
                            setEditingExceptionReasons((prev) => ({
                              ...prev,
                              [log.flightId]: '',
                            }))
                          } else {
                            setEditingExceptionReasons((prev) => {
                              const next = { ...prev }
                              delete next[log.flightId]
                              return next
                            })
                            await updateEntry(log, {
                              minBillableExceptionReason: null,
                            })
                          }
                        } else {
                          if (target.checked) {
                            // show the reason field locally; don't call API until reason is entered
                            setEditingReasons((prev) => ({
                              ...prev,
                              [log.flightId]: '',
                            }))
                          } else {
                            setEditingReasons((prev) => {
                              const next = { ...prev }
                              delete next[log.flightId]
                              return next
                            })
                            await updateEntry(log, {
                              isBillableFlight: true,
                              nonBillingReason: null,
                            })
                          }
                        }
                      }}
                    />
                  </Grid>
                  {isMinBillableStep && showExceptionField(log) && (
                    <Grid size={12} display={{ xs: 'none', md: 'block' }}>
                      <TextField
                        size='small'
                        placeholder={t('flightLog.minBillableExceptionReason')}
                        value={getExceptionReasonValue(log)}
                        onChange={({ target }) =>
                          setEditingExceptionReasons((prev) => ({
                            ...prev,
                            [log.flightId]: target.value,
                          }))
                        }
                        onBlur={() => handleExceptionReasonBlur(log)}
                        fullWidth
                      />
                    </Grid>
                  )}
                  {!isMinBillableStep && showReasonField(log) && (
                    <Grid size={12} display={{ xs: 'none', md: 'block' }}>
                      <TextField
                        size='small'
                        placeholder={t('flightLog.nonBillingReason')}
                        value={getReasonValue(log)}
                        onChange={({ target }) =>
                          setEditingReasons((prev) => ({
                            ...prev,
                            [log.flightId]: target.value,
                          }))
                        }
                        onBlur={() => handleReasonBlur(log)}
                        fullWidth
                      />
                    </Grid>
                  )}
                </>
              ) : (
                <>
                  <ViewMobileFlightDetails
                    size={6}
                    numberOfLandings={log.numberOfLandings}
                    flightType={log.flightType}
                  >
                    <Checkbox
                      checked={
                        isMinBillableStep
                          ? showExceptionField(log)
                          : log.isBillableFlight !== true ||
                            log.flightId in editingReasons
                      }
                      onChange={async ({ target }) => {
                        if (isMinBillableStep) {
                          if (target.checked) {
                            setEditingExceptionReasons((prev) => ({
                              ...prev,
                              [log.flightId]: '',
                            }))
                          } else {
                            setEditingExceptionReasons((prev) => {
                              const next = { ...prev }
                              delete next[log.flightId]
                              return next
                            })
                            await updateEntry(log, {
                              minBillableExceptionReason: null,
                            })
                          }
                        } else {
                          if (target.checked) {
                            setEditingReasons((prev) => ({
                              ...prev,
                              [log.flightId]: '',
                            }))
                          } else {
                            setEditingReasons((prev) => {
                              const next = { ...prev }
                              delete next[log.flightId]
                              return next
                            })
                            await updateEntry(log, {
                              isBillableFlight: true,
                              nonBillingReason: null,
                            })
                          }
                        }
                      }}
                    />
                  </ViewMobileFlightDetails>

                  <ViewMobileCrew
                    size={3}
                    personsOnBoard={log.personsOnBoard}
                    crew={[log.billableMemberLastName]}
                  />

                  <ViewMobileFlightTime
                    size={8}
                    departureAirport={log.departureAirport}
                    arrivalAirport={log.arrivalAirport}
                    takeoffTimeUtc={log.takeoffTimeUtc}
                    landingTimeUtc={log.landingTimeUtc}
                    flightTime={log.flightTime}
                  />

                  <Grid size={12}>{log.billingRemarks}</Grid>
                  {isMinBillableStep && showExceptionField(log) && (
                    <Grid size={12}>
                      <TextField
                        size='small'
                        placeholder={t('flightLog.minBillableExceptionReason')}
                        value={getExceptionReasonValue(log)}
                        onChange={({ target }) =>
                          setEditingExceptionReasons((prev) => ({
                            ...prev,
                            [log.flightId]: target.value,
                          }))
                        }
                        onBlur={() => handleExceptionReasonBlur(log)}
                        fullWidth
                      />
                    </Grid>
                  )}
                  {!isMinBillableStep && showReasonField(log) && (
                    <Grid size={12}>
                      <TextField
                        size='small'
                        placeholder={t('flightLog.nonBillingReason')}
                        value={getReasonValue(log)}
                        onChange={({ target }) =>
                          setEditingReasons((prev) => ({
                            ...prev,
                            [log.flightId]: target.value,
                          }))
                        }
                        onBlur={() => handleReasonBlur(log)}
                        fullWidth
                      />
                    </Grid>
                  )}
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
        <Button
          color='secondary'
          variant='outlined'
          onClick={navigate.previous}
          sx={{ mr: 1 }}
        >
          {t('general.back')}
        </Button>
        <Box sx={{ flex: '1 1 auto' }} />
        <Button color='primary' variant='contained' onClick={handleNext}>
          {nextButtonLabel()}
        </Button>
      </Box>
    </>
  )
}
