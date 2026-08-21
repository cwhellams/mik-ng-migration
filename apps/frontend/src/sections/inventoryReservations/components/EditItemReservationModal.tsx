import { Icon } from '@iconify/react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import type { DateTimeValidationError } from '@mui/x-date-pickers/models'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'

import type { BookingListResponse } from '@mik/contracts/bookings'
import type { InventoryItem } from '@mik/contracts/inventory'
import {
  ItemReservationStatus,
  reservationInvariantError,
  type ItemReservation,
  type ItemReservationCancellationRequest,
  type ItemReservationListResponse,
  type ItemReservationUpsertRequest,
} from '@mik/contracts/inventory-reservations'
import type { ItemUnitListResponse } from '@mik/contracts/inventory-units'
import type { Problem } from '@mik/contracts/problem'
import type { Upsert } from '@mik/contracts/schema'

import { absolute, endpoints } from '../../../api/endpoints'
import { AuditFormField } from '@mik/ui/components/AuditFormField'
import { EditDialogTitle } from '@mik/ui/components/EditDialogTitle'
import { FormField } from '@mik/ui/components/FormField'
import { FormTitle } from '@mik/ui/components/FormTitle'
import { RemoveButton } from '@mik/ui/components/RemoveButton'
import { SaveButton } from '@mik/ui/components/SaveButton'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import useApi, { type MutateMethods } from '@mik/ui/hooks/useApi'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { getOffsetLabelInTz, HELSINKI_TIMEZONE } from '@mik/ui/utils/date'
import { localName, resolveLanguage } from '../../inventory/localized'

export type ItemReservationFlags = {
  isNewReservation: boolean
  isReadonly: boolean
  minDate: dayjs.Dayjs
}

/**
 * The item calendar's editor — `EditBookingModal` with everything
 * aircraft-specific removed and two things added.
 *
 * Gone: instructor, booking type, medical and licence currency, the transfer
 * flow, the cancellation-reason taxonomy, the overlap table (an overlapping
 * item reservation is fine as long as there are enough units, which is what
 * the availability line reports instead).
 *
 * Added: a quantity, and an optional link to one of the member's own upcoming
 * flights.
 */
export const ItemReservationEditor = ({
  reservation,
  items,
  onClose,
}: {
  reservation: Upsert<ItemReservation & ItemReservationFlags> | undefined
  items: InventoryItem[]
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const lang = resolveLanguage(i18n.language)
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  // Only for scoping the linked-booking picker to the member's own flights;
  // whether this reservation is editable at all was already decided by
  // `itemReservationFlags()` and arrives as `isReadonly`.
  const { me } = useRoles()

  // `?? false` rather than leaving it undefined: the editor stays mounted with
  // `reservation === undefined` while the dialog is closed, so the new-versus-
  // edit decision must not rest on that.
  const isNew = reservation?.isNewReservation ?? false
  const isReadonly = reservation?.isReadonly
  const minDate = reservation?.minDate

  const { mutation } = useApi<ItemReservation>({
    url:
      !isNew && reservation?.reservationId
        ? endpoints.inventoryReservations.byId(reservation.reservationId)
        : endpoints.inventoryReservations.root,
    skipFetch: true,
  })

  const [formData, setFormData] = useState<
    Omit<ItemReservationUpsertRequest, 'startTimeEpoch' | 'endTimeEpoch'>
  >({
    memberId: '',
    itemId: '',
    unitId: null,
    quantity: 1,
    linkedBookingId: null,
    status: ItemReservationStatus.CONFIRMED,
    description: undefined,
  })

  const now = dayjs().startOf('minute')
  const [startDate, setStartDate] = useState({ date: now, error: '' })
  const [endDate, setEndDate] = useState({ date: now, error: '' })
  const [problem, setProblem] = useState<Problem | undefined>(undefined)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancellationNote, setCancellationNote] = useState('')

  useEffect(() => {
    if (!reservation) return

    setProblem(undefined)
    setFormData({
      memberId: reservation.memberId,
      itemId: reservation.itemId,
      unitId: reservation.unitId ?? null,
      quantity: reservation.quantity,
      linkedBookingId: reservation.linkedBookingId ?? null,
      status: reservation.status,
      description: reservation.description,
    })
    setStartDate({ date: dayjs(reservation.startTime), error: '' })
    setEndDate({ date: dayjs(reservation.endTime), error: '' })
  }, [reservation])

  const datesAreValid =
    startDate.date.isValid() && endDate.date.isValid() && !startDate.error && !endDate.error

  // The units of the chosen item, so the member can pin one ("the tank with the
  // full gauge") and so the availability line below has a denominator.
  //
  // `skipFetch` nulls SWR's key outright, so the placeholder id is never
  // fetched and never occupies a cache entry — it exists only to satisfy
  // `url`'s string type while no item is chosen.
  const { data: unitData } = useApi<ItemUnitListResponse>({
    url: endpoints.inventoryUnits.forItem(formData.itemId || 'no-item'),
    skipFetch: !reservation || !formData.itemId,
  })

  // What else is already committed in this window, so the member sees "2 of 4
  // free" before saving rather than a 400 after. The backend re-checks, and the
  // capacity trigger is the authority — this is a courtesy, not a gate.
  const { data: overlapping } = useApi<ItemReservationListResponse>({
    url: endpoints.inventoryReservations.root,
    skipFetch: !reservation || !datesAreValid || isReadonly || !formData.itemId,
    params: {
      itemId: [formData.itemId],
      from: startDate.date.isValid() ? startDate.date.toISOString() : undefined,
      to: endDate.date.isValid() ? endDate.date.toISOString() : undefined,
      excludeReservationId: reservation?.reservationId || undefined,
    },
  })

  // Only the member's own upcoming flights: linking someone else's booking
  // would say the equipment is for a flight they are not on.
  const { data: myBookings } = useApi<BookingListResponse>({
    url: endpoints.bookings.root,
    skipFetch: !reservation || !me?.memberId,
    params: {
      memberId: me?.memberId,
      from: dayjs().startOf('day').toISOString(),
    },
  })

  const inServiceCount = unitData?.inServiceCount ?? 0
  const committed = (overlapping?.reservations ?? []).reduce(
    (total, other) => total + other.quantity,
    0,
  )
  const available = Math.max(inServiceCount - committed, 0)

  const units = unitData?.units ?? []
  const selectableUnits = units.filter((unit) => unit.isActive)

  const invariantError = datesAreValid
    ? reservationInvariantError({
        unitId: formData.unitId,
        quantity: formData.quantity,
        startTimeEpoch: startDate.date.unix().toString(),
        endTimeEpoch: endDate.date.unix().toString(),
      })
    : undefined

  const pickerErrorText = (reason: DateTimeValidationError) => {
    if (!reason) return ''
    switch (reason) {
      case 'minDate':
      case 'minTime':
      case 'disablePast':
        return t('itemReservations.validation.disablePast')
      case 'minutesStep':
        return t('itemReservations.validation.minutesStep')
      default:
        return t('itemReservations.validation.invalidDateTime')
    }
  }

  const validateDate = (date: dayjs.Dayjs) => {
    if (minDate && date.isBefore(minDate)) return pickerErrorText('minDate')
    if (date.minute() % 15) return pickerErrorText('minutesStep')
    return ''
  }

  const validateDateRange = (start: dayjs.Dayjs, end: dayjs.Dayjs) =>
    end.isAfter(start) ? undefined : t('itemReservations.validation.endAfterStart')

  const trigger = async (method: MutateMethods) => {
    setProblem(undefined)

    const { error } = await mutation.trigger<ItemReservationUpsertRequest>(method, {
      ...formData,
      startTimeEpoch: startDate.date.unix().toString(),
      endTimeEpoch: endDate.date.unix().toString(),
    })
    if (error) return setProblem(error)

    mutate((key) => Array.isArray(key) && key[0] === endpoints.inventoryReservations.root)
    onClose()
  }

  const handleCancelConfirm = async () => {
    setCancelDialogOpen(false)
    setProblem(undefined)

    const body: ItemReservationCancellationRequest = { note: cancellationNote || undefined }
    const { error } = await mutation.trigger<ItemReservationCancellationRequest>(
      'POST',
      body,
      reservation?.reservationId
        ? absolute(endpoints.inventoryReservations.cancel(reservation.reservationId))
        : undefined,
    )
    if (error) return setProblem(error)

    mutate((key) => Array.isArray(key) && key[0] === endpoints.inventoryReservations.root)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await trigger(isNew ? 'POST' : 'PATCH')
  }

  const itemLabel = (item: InventoryItem) => localName(item.name as Record<string, string>, lang)

  const editorCard = () => (
    <Card sx={{ flex: 1 }}>
      <CardContent>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <DateTimePicker
              label={t('itemReservations.startDate', {
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
                if (error) setStartDate((prev) => ({ ...prev, error }))
              }}
              onChange={(date) => {
                if (!date) return
                setStartDate({ date, error: validateDate(date) })
                setEndDate((prev) => ({
                  ...prev,
                  error: validateDateRange(date, prev.date) ?? validateDate(prev.date),
                }))
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
              label={t('itemReservations.endDate', {
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
                if (error) setEndDate((prev) => ({ ...prev, error }))
              }}
              onChange={(date) => {
                if (!date) return
                setEndDate({
                  date,
                  error: validateDateRange(startDate.date, date) ?? validateDate(date),
                })
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

          <Grid size={12}>
            <FormControl fullWidth>
              <InputLabel id='item-reservation-item-label'>{t('itemReservations.item')}</InputLabel>
              <Select
                labelId='item-reservation-item-label'
                disabled={isReadonly}
                value={formData.itemId}
                label={t('itemReservations.item')}
                onChange={({ target }) =>
                  // The unit belongs to the previous item, so changing item has
                  // to drop it — otherwise the backend rejects the pair.
                  setFormData((prev) => ({ ...prev, itemId: target.value, unitId: null }))
                }
              >
                {items.map((item) => (
                  <MenuItem key={item.itemId} value={item.itemId}>
                    {itemLabel(item)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type='number'
              label={t('itemReservations.quantity')}
              disabled={isReadonly || !!formData.unitId}
              value={formData.quantity}
              slotProps={{ htmlInput: { min: 1, max: Math.max(inServiceCount, 1), step: 1 } }}
              onChange={({ target }) =>
                setFormData((prev) => ({
                  ...prev,
                  quantity: Math.max(1, Number.parseInt(target.value, 10) || 1),
                }))
              }
              helperText={formData.unitId ? t('itemReservations.unitOnlyForOne') : undefined}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel id='item-reservation-unit-label'>{t('itemReservations.unit')}</InputLabel>
              <Select
                labelId='item-reservation-unit-label'
                disabled={isReadonly || !formData.itemId}
                value={formData.unitId ?? ''}
                label={t('itemReservations.unit')}
                onChange={({ target }) =>
                  setFormData((prev) => ({
                    ...prev,
                    unitId: target.value || null,
                    // Naming a unit means exactly that unit.
                    quantity: target.value ? 1 : prev.quantity,
                  }))
                }
              >
                <MenuItem value=''>{t('itemReservations.anyUnit')}</MenuItem>
                {selectableUnits.map((unit) => (
                  <MenuItem key={unit.unitId} value={unit.unitId}>
                    {unit.tag ?? unit.unitId} — {t(`inventory.unitStatus.${unit.status}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={12}>
            <FormControl fullWidth>
              <InputLabel id='item-reservation-booking-label'>
                {t('itemReservations.linkedBooking')}
              </InputLabel>
              <Select
                labelId='item-reservation-booking-label'
                disabled={isReadonly}
                value={formData.linkedBookingId ?? ''}
                label={t('itemReservations.linkedBooking')}
                onChange={({ target }) =>
                  setFormData((prev) => ({ ...prev, linkedBookingId: target.value || null }))
                }
              >
                <MenuItem value=''>{t('itemReservations.noLinkedBooking')}</MenuItem>
                {(myBookings?.bookings ?? []).map((booking) => (
                  <MenuItem key={booking.bookingId} value={booking.bookingId}>
                    {`${booking.registration} ${dayjs(booking.startTime).format('DD.MM. HH:mm')}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('itemReservations.description')}
              disabled={isReadonly}
              value={formData.description ?? ''}
              onChange={({ target }) =>
                setFormData((prev) => ({ ...prev, description: target.value }))
              }
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )

  const detailsCard = () =>
    reservation && (
      <Card>
        <CardContent>
          <FormTitle title={t('itemReservations.details')} icon='mdi:information' />

          <Stack spacing={1.5}>
            <FormField label={t('itemReservations.owner')}>
              {`${reservation.member?.firstName ?? ''} ${reservation.member?.lastName ?? ''}`.trim()}
            </FormField>

            {reservation.unitTag && (
              <FormField label={t('itemReservations.unit')}>{reservation.unitTag}</FormField>
            )}

            <AuditFormField
              label={t('itemReservations.created')}
              by={reservation.createdBy}
              byName={reservation.createdByName ?? undefined}
              at={reservation.createdAt}
              includeTime
            />

            <AuditFormField
              label={t('itemReservations.updated')}
              by={reservation.updatedBy}
              byName={reservation.updatedByName ?? undefined}
              at={reservation.updatedAt}
              includeTime
            />

            {reservation.status === ItemReservationStatus.CANCELLED && (
              <AuditFormField
                label={t('itemReservations.cancelled')}
                by={reservation.cancelledBy ?? undefined}
                byName={reservation.cancelledByName ?? undefined}
                at={reservation.cancelledAt ?? undefined}
                includeTime
              />
            )}

            {reservation.cancellationNote && (
              <FormField label={t('itemReservations.cancellationNote')}>
                {reservation.cancellationNote}
              </FormField>
            )}
          </Stack>
        </CardContent>
      </Card>
    )

  return (
    <Dialog
      open={reservation !== undefined}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      fullScreen={isXs}
      slotProps={{ paper: { component: 'form', onSubmit: handleSubmit } }}
    >
      <EditDialogTitle
        title={isNew ? 'itemReservations.newReservation' : 'itemReservations.editReservation'}
        onClose={onClose}
      />
      <DialogContent dividers>
        <Stack spacing={3}>
          {formData.itemId && inServiceCount === 0 && (
            <Alert severity='warning' icon={<Icon icon='mdi:alert' />}>
              {t('itemReservations.noUnits')}
            </Alert>
          )}

          {formData.itemId && inServiceCount > 0 && !isReadonly && (
            <Alert severity={formData.quantity > available ? 'error' : 'info'}>
              {available === 0
                ? t('itemReservations.noneAvailable', { total: inServiceCount })
                : t('itemReservations.availability', {
                    available,
                    total: inServiceCount,
                  })}
            </Alert>
          )}

          {invariantError && <Alert severity='error'>{invariantError}</Alert>}

          {editorCard()}

          {!isNew && detailsCard()}

          <SnackAlert problem={problem} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Grid size={12} sx={{ justifyContent: 'space-between', display: 'flex', flexGrow: 1 }}>
          <Grid>
            {!isNew && !isReadonly && (
              <RemoveButton
                onClick={() => {
                  setCancellationNote('')
                  setCancelDialogOpen(true)
                }}
                loading={mutation.isMutating}
              />
            )}
          </Grid>

          <Grid sx={{ display: 'flex', gap: 2 }}>
            <Button onClick={onClose} color='inherit'>
              {t('general.back')}
            </Button>

            {!isReadonly && (
              <SaveButton
                loading={mutation.isMutating}
                disabled={
                  !formData.itemId ||
                  !!startDate.error ||
                  !!endDate.error ||
                  !!invariantError ||
                  inServiceCount === 0 ||
                  // An admin gets no override here: unlike an overlapping plane
                  // booking, there is no extra vest to hand out.
                  formData.quantity > available
                }
              />
            )}
          </Grid>
        </Grid>
      </DialogActions>

      {/* Cancellation dialog. No reason taxonomy — unlike a flight, an
          unreturned vest has no safety-reporting angle — just a free-text note
          that reaches the owner in the cancellation email. */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
        maxWidth='xs'
        fullWidth
      >
        <EditDialogTitle
          title='itemReservations.confirmCancel'
          onClose={() => setCancelDialogOpen(false)}
        />
        <DialogContent dividers>
          <TextField
            fullWidth
            multiline
            rows={3}
            label={t('itemReservations.cancellationNote')}
            placeholder={t('itemReservations.cancellationNoteHint')}
            value={cancellationNote}
            onChange={({ target }) => setCancellationNote(target.value)}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
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
            {t('itemReservations.confirmCancel')}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
