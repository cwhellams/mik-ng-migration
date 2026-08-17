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
  Autocomplete,
  FormHelperText,
  Alert,
  Typography,
} from '@mui/material'
import useApi, { MutateMethods } from '../../../hooks/useApi'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { mutate } from 'swr'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { Upsert } from '@mik/contracts/schema'
import {
  Booking,
  BookingListResponse,
  BookingStatus,
  BookingType,
  BookingUpsertRequest,
  CancellationReason,
  CancellationRequest,
  TransferBookingRequest,
} from '@mik/contracts/bookings'
import dayjs from 'dayjs'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { BookingTimeline } from './BookingTimeline'
import { AuditFormField } from '../../../components/AuditFormField'
import { FormTitle } from '../../../components/FormTitle'
import { FormField } from '../../../components/FormField'
import { useRoles } from '../../../hooks/useRoles'
import { useAppConfig } from '../../../hooks/useAppConfig'
import { AircraftListResponse } from '@mik/contracts/aircrafts'
import { MemberListResponse } from '@mik/contracts/members'
import { BookingTable } from './BookingTable'
import { SnackAlert } from '../../../components/SnackAlert'
import { Problem } from '@mik/contracts/problem'
import { SaveButton } from '../../../components/SaveButton'
import { RemoveButton } from '../../../components/RemoveButton'
import { DateTimeValidationError } from '@mui/x-date-pickers/models'
import {
  getOffsetLabelInTz,
  HELSINKI_TIMEZONE,
  getEffectiveMedicalExpiry,
} from '../../../utils/date'
import { generateGoogleCalendarLink } from '@mik/contracts/calendar'
import { downloadIcs } from '../../../utils/calendarEvent'
import { SelectMember } from '../../../components/SelectMember'
import { endpoints } from '../../../api/endpoints'

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

  const { isBookingAdmin, me } = useRoles()
  const { config: appConfig } = useAppConfig()
  // `?? false` rather than leaving it `boolean | undefined`: `Schedule.tsx` keeps
  // this editor mounted and passes `booking={undefined}` while the dialog is
  // closed, and the new-versus-edit decision should not rest on undefined.
  const isNewBooking = booking?.isNewBooking ?? false
  const isReadonly = booking?.isReadonly
  const minDate = booking?.minDate

  const now = dayjs().startOf('minute')

  const { mutation } = useApi<Booking>({
    // The id has to be present as well as the booking not being new: with the
    // dialog closed there is no booking at all, and keying only off `isNewBooking`
    // handed the builder an empty segment and addressed `v1/bookings/`. A new
    // booking carries `bookingId: ''` (see Schedule.tsx), so both conditions
    // agree for every state that reaches a save.
    url:
      !isNewBooking && booking?.bookingId
        ? endpoints.bookings.byId(booking.bookingId)
        : endpoints.bookings.root,
    skipFetch: true,
  })

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: endpoints.aircrafts.root,
      params: { activeOnly: true, visibleOnly: false },
      skipFetch: !booking,
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  )

  const { data: instructorData } = useApi<MemberListResponse>(
    {
      url: endpoints.members.root,
      params: { role: ['INSTRUCTOR', 'EXAMINER'] },
      skipFetch: !booking,
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  )

  const [formData, setFormData] = useState<
    Omit<BookingUpsertRequest, 'startTimeEpoch' | 'endTimeEpoch'>
  >({
    memberId: '',
    registration: '',
    description: '',
    type: BookingType.PRIVATE,
    status: BookingStatus.CONFIRMED,
    instructorMemberId: null,
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

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancellationReason, setCancellationReason] = useState<CancellationReason | ''>('')
  const [cancellationNote, setCancellationNote] = useState('')
  const [cancellationReasonError, setCancellationReasonError] = useState(false)

  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferTargetMemberId, setTransferTargetMemberId] = useState<string | null>(null)
  const [transferTargetMemberLabel, setTransferTargetMemberLabel] = useState<string>('')
  const [transferTargetError, setTransferTargetError] = useState(false)
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)

  const datesAreValid =
    startDate?.date.isValid() && endDate?.date.isValid() && !startDate.error && !endDate.error

  const { data: overlaps } = useApi<BookingListResponse>({
    url: endpoints.bookings.root,
    skipFetch: !booking || !datesAreValid || isReadonly,
    params: {
      registration: [formData.registration],
      exclusiveStartEnd: true,
      from: startDate?.date.isValid() ? startDate.date.toISOString() : undefined,
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
      return t('schedule.validation.endAfterStart', 'End time must be after start time')
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
    mutate((key) => Array.isArray(key) && key[0] == endpoints.bookings.root)

    onClose()
  }

  const handleRemove = () => {
    setCancellationReason('')
    setCancellationNote('')
    setCancellationReasonError(false)
    setCancelDialogOpen(true)
  }

  const handleCancelConfirm = async () => {
    if (!cancellationReason) {
      setCancellationReasonError(true)
      return
    }
    setCancelDialogOpen(false)
    setProblem(undefined)

    const body: CancellationRequest = {
      reason: cancellationReason,
      note: cancellationNote || undefined,
    }
    const { error } = await mutation.trigger<CancellationRequest>('POST', body, 'cancel')
    if (error) {
      return setProblem(error)
    }

    mutate((key) => Array.isArray(key) && key[0] == endpoints.bookings.root)
    onClose()
  }

  const handleTransfer = () => {
    setTransferTargetMemberId(null)
    setTransferTargetMemberLabel('')
    setTransferTargetError(false)
    setTransferDialogOpen(true)
  }

  const handleTransferSubmit = () => {
    if (!transferTargetMemberId) {
      setTransferTargetError(true)
      return
    }
    setTransferDialogOpen(false)
    setTransferConfirmOpen(true)
  }

  const handleTransferConfirm = async () => {
    if (!transferTargetMemberId) {
      return
    }
    setTransferConfirmOpen(false)
    setProblem(undefined)

    const body: TransferBookingRequest = { newMemberId: transferTargetMemberId }
    const { error } = await mutation.trigger<TransferBookingRequest>('POST', body, 'transfer')
    if (error) {
      return setProblem(error)
    }

    mutate((key) => Array.isArray(key) && key[0] == endpoints.bookings.root)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await trigger(isNewBooking ? 'POST' : 'PATCH')
  }

  const handleChange = (field: keyof Booking, value: string | number | null) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const overlappingBookings = overlaps?.bookings ?? []

  const licenceExpiry = me?.licenceExpiry ? dayjs(me.licenceExpiry) : null

  const medicalExpiry = getEffectiveMedicalExpiry(
    me?.medicalClass1Expiry,
    me?.medicalClass2Expiry,
    me?.medicalLaplExpiry,
    me?.medicalExpiry,
  )

  const licenceExpiresBeforeBooking =
    licenceExpiry !== null &&
    endDate.date.isValid() &&
    endDate.date.isAfter(licenceExpiry.endOf('day'))

  const medicalExpiresBeforeBooking =
    medicalExpiry !== null &&
    endDate.date.isValid() &&
    endDate.date.isAfter(medicalExpiry.endOf('day'))

  const requiresMedical = formData.type === BookingType.PRIVATE

  const medicalCurrentlyInvalid =
    (appConfig?.medicalCheckEnabled ?? true) &&
    requiresMedical &&
    (medicalExpiry === null || dayjs().isAfter(medicalExpiry.endOf('day')))

  const isTraining = formData.type === BookingType.TRAINING
  const isTrainingWithoutInstructor = isTraining && !formData.instructorMemberId

  const instructors = instructorData?.members ?? []
  const selectedInstructor =
    instructors.find((m) => m.memberId === formData.instructorMemberId) ?? null

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
                    error: validateDateRange(date, endDate.date) ?? validateDate(endDate.date),
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
                    error: validateDateRange(startDate.date, date) ?? validateDate(date),
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

          <Grid
            size={12}
            direction={'row'}
            sx={{
              display: 'flex',
              gap: 2,
            }}
          >
            <BookingTimeline
              previousEndDate={overlaps?.previous ? dayjs(overlaps.previous?.endTime) : undefined}
              startDate={startDate.date}
              endDate={endDate.date}
              nextStartDate={
                overlappingBookings.length > 0 || overlaps?.next
                  ? dayjs(overlappingBookings?.[0]?.startTime ?? overlaps?.next?.startTime)
                  : undefined
              }
            />
          </Grid>

          {aircraftData?.aircrafts && (
            <FormControl fullWidth>
              <InputLabel id='registration-label'>{t('schedule.registration')}</InputLabel>

              <Select
                labelId='registration-label'
                disabled={isReadonly}
                value={formData.registration ?? ''}
                label={t('schedule.registration')}
                onChange={({ target }) => handleChange('registration', target.value)}
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
              onChange={({ target }) =>
                setFormData((prev) => ({
                  ...prev,
                  type: target.value as BookingType,
                  // clear instructor when leaving training so we don't persist
                  // a stale instructor on non-training bookings
                  ...(target.value !== BookingType.TRAINING ? { instructorMemberId: null } : {}),
                }))
              }
            >
              <MenuItem value={BookingType.PRIVATE}>
                {t(`schedule.types.${BookingType.PRIVATE}`)}
              </MenuItem>
              <MenuItem value={BookingType.TRAINING}>
                {t(`schedule.types.${BookingType.TRAINING}`)}
              </MenuItem>
              <MenuItem value={BookingType.MAINTENANCE}>
                {t(`schedule.types.${BookingType.MAINTENANCE}`)}
              </MenuItem>
            </Select>
          </FormControl>

          {isTraining && (
            <Autocomplete
              fullWidth
              disabled={isReadonly}
              options={instructors}
              getOptionLabel={(option) => `${option.first} ${option.last}`}
              isOptionEqualToValue={(option, value) => option.memberId === value.memberId}
              value={selectedInstructor}
              onChange={(_event, newValue) => {
                handleChange('instructorMemberId', newValue?.memberId ?? null)
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('schedule.instructor')}
                  required={isTraining}
                  error={isTrainingWithoutInstructor}
                  helperText={
                    isTrainingWithoutInstructor
                      ? t('schedule.validation.instructorRequired')
                      : undefined
                  }
                />
              )}
            />
          )}

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
              <a href={`tel:${booking.member?.phoneNumber}`}>{booking.member?.phoneNumber}</a>
            </FormField>

            {booking.instructorMemberId && (
              <FormField label={t('schedule.instructor')}>
                {`${booking.instructor?.firstName ?? ''} ${booking.instructor?.lastName ?? ''}`.trim()}
              </FormField>
            )}

            <AuditFormField
              label={t('schedule.created')}
              by={booking.createdBy}
              byName={booking.createdByName}
              at={booking.createdAt}
              includeTime={true}
            />

            <AuditFormField
              label={t('schedule.updated')}
              by={booking.updatedBy}
              byName={booking.updatedByName}
              at={booking.updatedAt}
              includeTime={true}
            />

            {booking.status == BookingStatus.CANCELLED && (
              <AuditFormField
                label={t('schedule.cancelled')}
                by={booking.cancelledBy ?? undefined}
                byName={booking.cancelledByName}
                at={booking.cancelledAt ?? undefined}
                includeTime={true}
              />
            )}

            {booking.status == BookingStatus.CANCELLED &&
              isBookingAdmin &&
              booking.cancellationReason && (
                <FormField label={t('schedule.cancellationReason')}>
                  {t(`schedule.cancellationReasons.${booking.cancellationReason}`)}
                </FormField>
              )}

            {booking.status == BookingStatus.CANCELLED &&
              isBookingAdmin &&
              booking.cancellationNote && (
                <FormField label={t('schedule.cancellationNote')}>
                  {booking.cancellationNote}
                </FormField>
              )}

            {booking.status !== BookingStatus.CANCELLED && (
              <Stack
                direction='row'
                spacing={1}
                useFlexGap
                sx={{
                  flexWrap: 'wrap',
                }}
              >
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
                    const { data: fresh } = await mutation.trigger<undefined, Booking>('GET')
                    downloadIcs((fresh ?? booking) as Booking)
                  }}
                >
                  {t('schedule.downloadIcs')}
                </Button>
                {!isReadonly && (booking.memberId === me?.memberId || isBookingAdmin) && (
                  <Button variant='outlined' size='small' onClick={handleTransfer}>
                    {t('schedule.transferBooking')}
                  </Button>
                )}
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
          {medicalCurrentlyInvalid && (
            <Alert severity='error'>
              {medicalExpiry === null
                ? t('schedule.validation.medicalNotEnteredBlocksBooking')
                : t('schedule.validation.medicalExpiredBlocksBooking', {
                    date: medicalExpiry.format('DD.MM.YYYY'),
                  })}
            </Alert>
          )}

          {licenceExpiresBeforeBooking && licenceExpiry && (
            <Alert severity='warning'>
              {t('schedule.validation.licenceExpiresBeforeBooking', {
                date: licenceExpiry.format('DD.MM.YYYY'),
              })}
            </Alert>
          )}

          {medicalExpiresBeforeBooking && medicalExpiry && (
            <Alert severity='warning'>
              {t('schedule.validation.medicalExpiresBeforeBooking', {
                date: medicalExpiry.format('DD.MM.YYYY'),
              })}
            </Alert>
          )}

          {editorCard()}

          {overlappingBookings.length > 0 && overlapsCard()}

          {!isNewBooking && detailsCard()}

          <SnackAlert problem={problem} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Grid
          size={12}
          sx={{
            justifyContent: 'space-between',
            display: 'flex',
            flexGrow: 1,
          }}
        >
          <Grid>
            {!isNewBooking && !isReadonly && (
              <RemoveButton onClick={handleRemove} loading={mutation.isMutating} />
            )}
          </Grid>

          <Grid
            sx={{
              display: 'flex',
              gap: 2,
            }}
          >
            <Button onClick={onClose} color='inherit'>
              {t('general.back')}
            </Button>

            {!isReadonly && (
              <SaveButton
                loading={mutation.isMutating}
                disabled={
                  (overlappingBookings.length > 0 && !isBookingAdmin) ||
                  !!startDate.error ||
                  !!endDate.error ||
                  isTrainingWithoutInstructor ||
                  medicalCurrentlyInvalid
                }
              />
            )}
          </Grid>
        </Grid>
      </DialogActions>
      {/* Cancellation reason dialog */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
        maxWidth='xs'
        fullWidth
      >
        <EditDialogTitle
          title='schedule.confirmCancel'
          onClose={() => setCancelDialogOpen(false)}
        />
        <DialogContent dividers>
          <Stack spacing={2}>
            <FormControl fullWidth error={cancellationReasonError}>
              <InputLabel id='cancel-reason-label'>{t('schedule.cancellationReason')} *</InputLabel>
              <Select
                labelId='cancel-reason-label'
                value={cancellationReason}
                label={`${t('schedule.cancellationReason')} *`}
                onChange={({ target }) => {
                  setCancellationReason(target.value as CancellationReason)
                  setCancellationReasonError(false)
                }}
              >
                {Object.values(CancellationReason).map((reason) => (
                  <MenuItem key={reason} value={reason}>
                    {t(`schedule.cancellationReasons.${reason}`)}
                  </MenuItem>
                ))}
              </Select>
              {cancellationReasonError && (
                <FormHelperText>{t('schedule.cancellationReasonRequired')}</FormHelperText>
              )}
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('schedule.cancellationNote')}
              placeholder={t('schedule.cancellationNoteHint')}
              value={cancellationNote}
              onChange={({ target }) => setCancellationNote(target.value)}
              slotProps={{
                htmlInput: { maxLength: 500 },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)} color='inherit'>
            {t('general.back')}
          </Button>
          <Button
            onClick={handleCancelConfirm}
            color='error'
            variant='contained'
            loading={mutation.isMutating}
          >
            {t('schedule.confirmCancel')}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Transfer booking dialog */}
      <Dialog
        open={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        maxWidth='xs'
        fullWidth
      >
        <EditDialogTitle
          title='schedule.transferBooking'
          onClose={() => setTransferDialogOpen(false)}
        />
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant='body2'>{t('schedule.transferBookingMessage')}</Typography>
            <SelectMember
              label={t('schedule.transferTo')}
              value={transferTargetMemberId}
              exclude={booking ? [booking.memberId] : undefined}
              onChange={(member) => {
                setTransferTargetMemberId(member?.id ?? null)
                setTransferTargetMemberLabel(member?.label ?? '')
                setTransferTargetError(false)
              }}
            />
            {transferTargetError && (
              <FormHelperText error>{t('schedule.transferTargetRequired')}</FormHelperText>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferDialogOpen(false)} color='inherit'>
            {t('general.back')}
          </Button>
          <Button onClick={handleTransferSubmit} color='primary' variant='contained'>
            {t('schedule.confirmTransfer')}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={transferConfirmOpen}
        onClose={() => setTransferConfirmOpen(false)}
        onConfirm={handleTransferConfirm}
        title={t('schedule.transferConfirmTitle')}
        message={t('schedule.transferConfirmMessage', { memberName: transferTargetMemberLabel })}
        confirmText={t('schedule.confirmTransferOfBooking')}
        cancelText={t('general.back')}
        severity='warning'
      />
    </Dialog>
  )
}
