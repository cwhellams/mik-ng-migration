import {
  Card,
  CardContent,
  Stack,
  Grid,
  TextField,
  Button,
  DialogActions,
  DialogContent,
  Dialog,
  useMediaQuery,
  useTheme,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material'
import useApi, { MutateMethods } from '../../../hooks/useApi'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { mutate } from 'swr'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { Upsert } from '@backend/types/schema'
import {
  Booking,
  BookingListResponse,
  BookingStatus,
  BookingType,
  BookingUpsertRequest,
} from '@backend/routes/bookings/models'
import dayjs from 'dayjs'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker/DateTimePicker'
import { BookingTimeline } from './BookingTimeline'
import { AuditFormField } from '../../../components/AuditFormField'
import { FormTitle } from '../../../components/FormTitle'
import { FormField } from '../../../components/FormField'
import { useRoles } from '../../../hooks/useRoles'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { BookingTable } from './BookingTable'
import { SnackAlert } from '../../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { SaveButton } from '../../../components/SaveButton'
import { RemoveButton } from '../../../components/RemoveButton'
import { DateTimeValidationError } from '@mui/x-date-pickers/models'
import { getOffsetLabelInTz, HELSINKI_TIMEZONE } from '../../../utils/date'
import {
  generateGoogleCalendarLink,
  downloadIcs,
} from '../../../utils/calendarEvent'

export type BookingFlags = {
  isNewBooking: boolean
  isReadonly: boolean
  minDate: dayjs.Dayjs
}

export const BookingEditor = ({
  booking,
  onClose,
}: {
  booking: Upsert<Booking & BookingFlags> | undefined
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const { isBookingAdmin } = useRoles()
  const isNewBooking = booking?.isNewBooking
  const isReadonly = booking?.isReadonly
  const minDate = booking?.minDate

  const now = dayjs().startOf('minute')

  const { mutation } = useApi<Booking>({
    url: `v1/bookings${isNewBooking ? '' : `/${booking?.bookingId}`}`,
    skipFetch: true,
  })

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: 'v1/aircrafts',
      params: { activeOnly: true, visibleOnly: false },
      skipFetch: !booking,
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    }
  )

  const [formData, setFormData] = useState<
    Omit<BookingUpsertRequest, 'startTimeEpoch' | 'endTimeEpoch'>
  >({
    memberId: '',
    registration: '',
    description: '',
    type: BookingType.PRACTICE,
    status: BookingStatus.CONFIRMED,
  })

  const [startDate, setStartDate] = useState({
    date: now,
    error: '',
  })
  const [endDate, setEndDate] = useState({
    date: now,
    error: '',
  })

  const [problem, setProblem] = useState<Problem | undefined>(undefined)

  const datesAreValid =
    startDate?.date.isValid() &&
    endDate?.date.isValid() &&
    !startDate.error &&
    !endDate.error

  const { data: overlaps } = useApi<BookingListResponse>({
    url: 'v1/bookings',
    skipFetch: !booking || !datesAreValid || isReadonly,
    params: {
      'registration[]': [formData.registration],
      exclusiveStartEnd: true,
      from: startDate?.date.isValid()
        ? startDate.date.toISOString()
        : undefined,
      to: endDate?.date.isValid() ? endDate.date.toISOString() : undefined,
      excludeBookingId: booking?.bookingId,
    },
  })

  useEffect(() => {
    if (booking) {
      setProblem(undefined)
      setFormData(booking)

      const start = dayjs(booking.startTime)
      setStartDate({ date: start, error: '' })
      setEndDate({ date: dayjs(booking.endTime), error: '' })
    }
  }, [booking])

  const pickerErrorText = (reason: DateTimeValidationError) => {
    if (!reason) return ''

    switch (reason) {
      case 'minDate':
      case 'minTime':
      case 'disablePast':
        return t('schedule.validation.disablePast')
      case 'minutesStep':
        return t('schedule.validation.minutesStep')
      case 'invalidDate':
      default:
        return t('schedule.validation.invalidDateTime')
    }
  }

  const validateDate = (date: dayjs.Dayjs) => {
    if (minDate && date.isBefore(minDate)) {
      return pickerErrorText('minDate')
    }
    if (date.minute() % 15) {
      return pickerErrorText('minutesStep')
    }
    return ''
  }

  const validateDateRange = (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
    const validRange = end?.isAfter(start) === true
    if (!validRange) {
      return t(
        'schedule.validation.endAfterStart',
        'End time must be after start time'
      )
    }
  }

  const trigger = async (method: MutateMethods) => {
    setProblem(undefined)

    const { error } = await mutation.trigger<BookingUpsertRequest>(method, {
      ...formData,
      startTimeEpoch: startDate.date.unix().toString(),
      endTimeEpoch: endDate.date.unix().toString(),
    })
    if (error) {
      return setProblem(error)
    }

    // clear the cache for booking list
    mutate((key) => Array.isArray(key) && key[0] == 'v1/bookings')

    onClose()
  }

  const handleRemove = async () => trigger('DELETE')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await trigger(isNewBooking ? 'POST' : 'PATCH')
  }

  const handleChange = (
    field: keyof Booking,
    value: string | number | null
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const overlappingBookings = overlaps?.bookings ?? []

  const editorCard = () => (
    <Card sx={{ flex: 1, position: 'relative' }}>
      <CardContent>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <DateTimePicker
              label={t('schedule.startDate', {
                tz: getOffsetLabelInTz(startDate.date.toDate(), 'helsinki'),
              })}
              disabled={isReadonly}
              value={startDate.date}
              format='DD.MM.YYYY HH:mm'
              timezone={HELSINKI_TIMEZONE}
              minDateTime={minDate}
              minutesStep={15}
              onError={(reason) => {
                const error = pickerErrorText(reason)
                if (error) {
                  setStartDate((prev) => ({ ...prev, error }))
                }
              }}
              onChange={(date) => {
                if (date) {
                  setStartDate({
                    date,
                    error: validateDate(date),
                  })
                  setEndDate((prev) => ({
                    ...prev,
                    error:
                      validateDateRange(date, endDate.date) ??
                      validateDate(endDate.date),
                  }))
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  margin: 'normal',
                  error: !!startDate.error,
                  helperText: startDate.error,
                },
              }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <DateTimePicker
              label={t('schedule.endDate', {
                tz: getOffsetLabelInTz(endDate.date.toDate(), 'helsinki'),
              })}
              disabled={isReadonly}
              value={endDate.date}
              format='DD.MM.YYYY HH:mm'
              timezone={HELSINKI_TIMEZONE}
              minDateTime={minDate}
              minutesStep={15}
              onError={(reason) => {
                const error = pickerErrorText(reason)
                if (error) {
                  setEndDate((prev) => ({ ...prev, error }))
                }
              }}
              onChange={(date) => {
                if (date) {
                  setEndDate({
                    date,
                    error:
                      validateDateRange(startDate.date, date) ??
                      validateDate(date),
                  })
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  margin: 'normal',
                  error: !!endDate.error,
                  helperText: endDate.error,
                },
              }}
            />
          </Grid>

          <Grid size={12} display={'flex'} direction={'row'} gap={2}>
            <BookingTimeline
              previousEndDate={
                overlaps?.previous
                  ? dayjs(overlaps.previous?.endTime)
                  : undefined
              }
              startDate={startDate.date}
              endDate={endDate.date}
              nextStartDate={
                overlappingBookings.length > 0 || overlaps?.next
                  ? dayjs(
                      overlappingBookings?.[0]?.startTime ??
                        overlaps?.next?.startTime
                    )
                  : undefined
              }
            />
          </Grid>

          {aircraftData?.aircrafts && (
            <FormControl fullWidth>
              <InputLabel id='registration-label'>
                {t('schedule.registration')}
              </InputLabel>

              <Select
                labelId='registration-label'
                disabled={isReadonly}
                value={formData.registration ?? ''}
                label={t('schedule.registration')}
                onChange={({ target }) =>
                  handleChange('registration', target.value)
                }
              >
                {aircraftData?.aircrafts.map((plane) => (
                  <MenuItem key={plane.registration} value={plane.registration}>
                    {plane.registration}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl fullWidth>
            <InputLabel id='type-label'>{t('schedule.type')}</InputLabel>

            <Select
              labelId='type-label'
              disabled={isReadonly}
              value={formData.type ?? ''}
              label={t('schedule.type')}
              onChange={({ target }) => handleChange('type', target.value)}
            >
              <MenuItem value={BookingType.PRACTICE}>
                {t(`schedule.types.${BookingType.PRACTICE}`)}
              </MenuItem>
              <MenuItem value={BookingType.TRAINING}>
                {t(`schedule.types.${BookingType.TRAINING}`)}
              </MenuItem>
              <MenuItem value={BookingType.CROSSCOUNTRY}>
                {t(`schedule.types.${BookingType.CROSSCOUNTRY}`)}
              </MenuItem>
              <MenuItem value={BookingType.MAINTENANCE}>
                {t(`schedule.types.${BookingType.MAINTENANCE}`)}
              </MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            multiline
            rows={3}
            label={t('schedule.description')}
            disabled={isReadonly}
            value={formData.description || ''}
            onChange={({ target }) => handleChange('description', target.value)}
          />
        </Grid>
      </CardContent>
    </Card>
  )

  const overlapsCard = () => (
    <Card>
      <CardContent>
        <FormTitle title={t('schedule.overlaps')} icon='mdi:shield-alert' />

        <Grid size={12}>
          <BookingTable
            bookings={overlappingBookings}
            eventDescription={(booking) =>
              `${booking.registration} ${booking.member?.firstName} ${booking.member?.lastName}`
            }
          />
        </Grid>
      </CardContent>
    </Card>
  )

  const detailsCard = () =>
    booking && (
      <Card>
        <CardContent>
          <FormTitle title={t('schedule.details')} icon='mdi:information' />

          <Stack spacing={1.5}>
            <FormField label={t('schedule.owner')}>
              {`${booking.member?.firstName} ${booking.member?.lastName}`}
            </FormField>
            <FormField label={t('member.phone')}>
              <a href={`tel:${booking.member?.phoneNumber}`}>
                {booking.member?.phoneNumber}
              </a>
            </FormField>

            <AuditFormField
              label={t('schedule.created')}
              by={booking.createdBy}
              at={booking.createdAt}
              includeTime={true}
            />

            <AuditFormField
              label={t('schedule.updated')}
              by={booking.updatedBy}
              at={booking.updatedAt}
              includeTime={true}
            />

            {booking.status == BookingStatus.CANCELLED && (
              <AuditFormField
                label={t('schedule.cancelled')}
                by={booking.cancelledBy ?? undefined}
                at={booking.cancelledAt ?? undefined}
                includeTime={true}
              />
            )}

            {booking.status !== BookingStatus.CANCELLED && (
              <Stack direction='row' spacing={1} flexWrap='wrap'>
                <Button
                  variant='outlined'
                  size='small'
                  href={generateGoogleCalendarLink(booking as Booking)}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  {t('schedule.addToGoogleCalendar')}
                </Button>
                <Button
                  variant='outlined'
                  size='small'
                  onClick={async () => {
                    const { data: fresh } = await mutation.trigger<
                      undefined,
                      Booking
                    >('GET')
                    downloadIcs((fresh ?? booking) as Booking)
                  }}
                >
                  {t('schedule.downloadIcs')}
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    )

  return (
    <Dialog
      open={booking !== undefined}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      fullScreen={isXs}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: handleSubmit,
        },
      }}
    >
      <EditDialogTitle
        title={isNewBooking ? 'schedule.newBooking' : 'schedule.editBooking'}
        onClose={onClose}
      />

      <DialogContent dividers>
        <Stack spacing={3}>
          {editorCard()}

          {overlappingBookings.length > 0 && overlapsCard()}

          {!isNewBooking && detailsCard()}

          <SnackAlert problem={problem} />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Grid
          size={12}
          justifyContent='space-between'
          display='flex'
          flexGrow={1}
        >
          <Grid>
            {!isNewBooking && !isReadonly && (
              <RemoveButton
                onClick={handleRemove}
                loading={mutation.isMutating}
              />
            )}
          </Grid>

          <Grid display='flex' gap={2}>
            <Button onClick={onClose} color='inherit'>
              {t('general.back')}
            </Button>

            {!isReadonly && (
              <SaveButton
                loading={mutation.isMutating}
                disabled={
                  (overlappingBookings.length > 0 && !isBookingAdmin) ||
                  !!startDate.error ||
                  !!endDate.error
                }
              />
            )}
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  )
}
