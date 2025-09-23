import { Typography } from '@mui/material'
import { Box, alpha } from '@mui/system'
import dayjs from 'dayjs'
import theme from '../../../theme/theme'
import { formatDuration } from '../../flightLog/utils/timeUtils'
import { useTranslation } from 'react-i18next'

const showDiff = (previous?: dayjs.Dayjs, next?: dayjs.Dayjs) => {
  if (!previous || !next) {
    return '--'
  }
  const diff = next.diff(previous, 'minutes')
  if (diff == 0) {
    return '0 min'
  }
  return formatDuration(diff)
}

export const BookingTimeline = ({
  previousEndDate,
  startDate,
  endDate,
  nextStartDate,
}: {
  previousEndDate?: dayjs.Dayjs
  startDate?: dayjs.Dayjs
  endDate?: dayjs.Dayjs
  nextStartDate?: dayjs.Dayjs
}) => {
  const { t } = useTranslation()

  return (
    <>
      <Box
        width={'33%'}
        sx={{
          p: { xs: 1, sm: 1.5 },
          borderRadius: 1,
          height: '100%',
          bgcolor: alpha(theme.palette.info.main, 0.1),
        }}
      >
        <Typography variant='body2' fontWeight='medium' color={'primary.info'}>
          {t('schedule.freeBefore')}
        </Typography>
        <Typography variant='body1'>
          {showDiff(previousEndDate, startDate)}
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          {previousEndDate
            ? t('schedule.ends', { at: previousEndDate.format('D.M. HH:mm') })
            : t('schedule.noPreviousBooking')}
        </Typography>
      </Box>

      <Box
        width={'33%'}
        sx={{
          p: { xs: 1, sm: 1.5 },
          borderRadius: 1,
          height: '100%',
          bgcolor: alpha(theme.palette.primary.main, 0.1),
        }}
      >
        <Typography variant='body2' fontWeight='medium' color={'primary.main'}>
          {t('schedule.bookingDuration')}
        </Typography>
        <Typography variant='h6'>
          {formatDuration(endDate?.diff(startDate, 'minutes') ?? -1)}
        </Typography>
      </Box>

      <Box
        width={'33%'}
        sx={{
          p: { xs: 1, sm: 1.5 },
          borderRadius: 1,
          height: '100%',
          bgcolor: alpha(theme.palette.info.main, 0.1),
        }}
      >
        <Typography variant='body2' fontWeight='medium' color={'info.main'}>
          {t('schedule.freeAfter')}
        </Typography>
        <Typography variant='body1'>
          {showDiff(endDate, nextStartDate)}
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          {nextStartDate
            ? t('schedule.starts', { at: nextStartDate.format('D.M. HH:mm') })
            : t('schedule.noNextBooking')}
        </Typography>
      </Box>
    </>
  )
}
