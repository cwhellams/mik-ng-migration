import {
  CircularProgress,
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
  Alert,
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

export const BookingEditor = ({
  booking,
  onClose,
}: {
  booking: Upsert<Booking> | undefined
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const { me, isBookingAdmin } = useRoles()
  const isNewBooking = booking?.bookingId === ''
  const isCancelledBooking = booking?.status === BookingStatus.CANCELLED
  const isReadonly = booking?.memberId !== me?.memberId && !isBookingAdmin

  const { mutation } = useApi<Booking>({
    url: `v1/bookings${isNewBooking ? '' : `/${booking?.bookingId}`}`,
    skipFetch: true,
  })

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: 'v1/aircrafts',
      params: { activeOnly: true },
      skipFetch: !booking,
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    }
  )

  const [formData, setFormData] = useState<BookingUpsertRequest>({
    memberId: '',
    registration: '',
    description: '',
    startTimeEpoch: '',
    endTimeEpoch: '',
    type: BookingType.PRACTICE,
    status: BookingStatus.CONFIRMED,
  })

  const [startDate, setStartDate] = useState<dayjs.Dayjs | undefined>()
  const [endDate, setEndDate] = useState<dayjs.Dayjs | undefined>()

  const [errorMsg, setErrorMsg] = useState('')

  const { data: overlaps } = useApi<BookingListResponse>({
    url: 'v1/bookings',
    skipFetch: !booking,
    params: {
      'registration[]': [formData.registration],
      exclusiveStartEnd: true,
      from: startDate?.toISOString(),
      to: endDate?.toISOString(),
      excludeBookingId: booking?.bookingId,
    },
  })

  useEffect(() => {
    if (booking) {
      setErrorMsg('')
      setFormData(booking)
      setStartDate(dayjs(booking.startTime))
      setEndDate(dayjs(booking.endTime))
    }
  }, [booking])

  const trigger = async (method: MutateMethods) => {
    setErrorMsg('')

    const { error } = await mutation.trigger(method, formData)
    if (error) {
      console.error('Error saving booking data:', error)
      return setErrorMsg(error?.detail ?? error?.title ?? 'Error')
    }

    // clear the cache for booking list
    mutate((key) => Array.isArray(key) && key[0] == 'v1/bookings')

    onClose()
  }

  const handleRemove = async () => {
    setErrorMsg('')

    await trigger('DELETE')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

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

  const minDate = overlaps?.previous
    ? dayjs(overlaps.previous?.endTime)
    : undefined
  const maxDate =
    overlappingBookings.length > 0 || overlaps?.next
      ? dayjs(overlappingBookings?.[0]?.startTime ?? overlaps?.next?.startTime)
      : undefined

  const editorCard = () => (
    <Card sx={{ flex: 1, position: 'relative' }}>
      <CardContent>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <DateTimePicker
              label={t('schedule.startDate')}
              disabled={isReadonly}
              value={startDate}
              format='DD.MM.YYYY HH:mm'
              minDateTime={minDate}
              maxDateTime={endDate}
              minutesStep={15}
              onChange={(date) => {
                if (date) {
                  setStartDate(date)
                  handleChange('startTimeEpoch', date.unix().toString())
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  margin: 'normal',
                },
              }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <DateTimePicker
              label={t('schedule.endDate')}
              disabled={isReadonly}
              value={endDate}
              format='DD.MM.YYYY HH:mm'
              minDateTime={startDate}
              maxDateTime={maxDate}
              minutesStep={15}
              onChange={(date) => {
                if (date) {
                  setEndDate(date)
                  handleChange('endTimeEpoch', date.unix().toString())
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  margin: 'normal',
                },
              }}
            />
          </Grid>

          <Grid size={12} display={'flex'} direction={'row'} gap={2}>
            <BookingTimeline
              previousEndDate={minDate}
              startDate={startDate}
              endDate={endDate}
              nextStartDate={maxDate}
            />
          </Grid>

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
              format='DD.MM.YYYY HH:mm'
            />

            <AuditFormField
              label={t('schedule.updated')}
              by={booking.updatedBy}
              at={booking.updatedAt}
              format='DD.MM.YYYY HH:mm'
            />

            {booking.status == BookingStatus.CANCELLED && (
              <AuditFormField
                label={t('schedule.cancelled')}
                by={booking.cancelledBy ?? undefined}
                at={booking.cancelledAt ?? undefined}
                format='DD.MM.YYYY HH:mm'
              />
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

          {errorMsg.length > 0 && <Alert severity='error'>{errorMsg}</Alert>}
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
            {!isNewBooking && !isCancelledBooking && !isReadonly && (
              <Button
                color='secondary'
                variant='outlined'
                onClick={handleRemove}
                disabled={mutation.isMutating}
                startIcon={
                  mutation.isMutating ? <CircularProgress size={20} /> : null
                }
              >
                {t('general.delete', 'Delete')}
              </Button>
            )}
          </Grid>

          <Grid display='flex' gap={2}>
            <Button onClick={onClose} color='inherit'>
              {t('general.cancel', 'Cancel')}
            </Button>

            {!isCancelledBooking && !isReadonly && (
              <Button
                type='submit'
                color='primary'
                variant='contained'
                disabled={
                  mutation.isMutating ||
                  (overlappingBookings.length > 0 && !isBookingAdmin)
                }
                startIcon={
                  mutation.isMutating ? <CircularProgress size={20} /> : null
                }
              >
                {t('general.save', 'Save')}
              </Button>
            )}
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  )
}
