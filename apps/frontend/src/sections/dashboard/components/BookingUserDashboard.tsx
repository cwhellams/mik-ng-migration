import {
  BookingListResponse,
  Booking,
  BookingFilters,
} from '@backend/routes/bookings/models'
import { Upsert } from '@backend/types/schema'
import { Typography, Card, CardContent } from '@mui/material'
import { Box } from '@mui/system'
import { t } from 'i18next'
import { useEffect, useState } from 'react'
import { EditButton } from '../../../components/EditButton'
import { RemoteContent } from '../../../components/RemoteContent'
import useApi from '../../../hooks/useApi'
import { BookingTable } from '../../schedule/components/BookingTable'
import { BookingEditor } from '../../schedule/components/EditBookingModal'
import dayjs from 'dayjs'
import { useMe } from '../../../hooks/useMe'

export const BookingUserDashboard = () => {
  const { me } = useMe()

  const [bookingFilters, setBookingFilters] = useState<BookingFilters>({
    from: dayjs().startOf('day').toISOString(),
  })

  useEffect(() => {
    if (me?.memberId) {
      setBookingFilters((filters) => ({
        ...filters,
        memberId: me?.memberId,
      }))
    }
  }, [me?.memberId])

  const {
    data: scheduleData,
    isLoading: isLoadingSchedule,
    error: scheduleError,
  } = useApi<BookingListResponse, Booking>({
    url: 'v1/bookings',
    skipFetch: !bookingFilters.memberId,
    params: bookingFilters,
  })

  const [editMode, setEditMode] = useState<Upsert<Booking>>()

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <RemoteContent isLoading={isLoadingSchedule} error={scheduleError}>
          <Typography variant='h5' gutterBottom>
            {t('dashboard.schedule.upcoming')}
          </Typography>

          {scheduleData?.bookings.length === 0 ? (
            <Typography>{t('dashboard.schedule.noBookings')}</Typography>
          ) : (
            <BookingTable
              bookings={scheduleData?.bookings || []}
              eventDescription={(booking) => (
                <Box
                  display='flex'
                  justifyContent='space-between'
                  alignItems='center'
                >
                  <Typography variant='body1'>{`${booking.registration}`}</Typography>

                  <EditButton
                    title={t('dashboard.schedule.editBooking')}
                    icon='mdi:edit'
                    onClick={() => {
                      setEditMode(booking)
                    }}
                  />
                </Box>
              )}
            />
          )}

          <BookingEditor
            booking={editMode}
            onClose={() => setEditMode(undefined)}
          />
        </RemoteContent>
      </CardContent>
    </Card>
  )
}
