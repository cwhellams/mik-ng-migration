import {
  Box,
  Grid,
  Paper,
  Typography,
  IconButton,
  Collapse,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { getTimezoneDisplay } from '../utils/timezoneUtils'
import { formatDuration, splitTime } from '../utils/timeUtils'
import { HoursAndMinutes } from './HoursAndMinutes'

interface Props {
  offBlockTime: dayjs.Dayjs | null
  takeoffTime: dayjs.Dayjs | null
  landingTime: dayjs.Dayjs | null
  onBlockTime: dayjs.Dayjs | null
  acTotalFlightTimeBefore?: string
  acTotalFlightTimeAfter?: string | null
}

const FlightTimeline = ({
  offBlockTime,
  takeoffTime,
  landingTime,
  onBlockTime,
  acTotalFlightTimeBefore,
  acTotalFlightTimeAfter,
}: Props) => {
  const { t } = useTranslation()
  const theme = useTheme()

  const [currentHours, setCurrentHours] = useState<number | null>(null)
  const [currentMinutes, setCurrentMinutes] = useState<number | null>(null)
  const [calculatorExpanded, setCalculatorExpanded] = useState(false)

  useEffect(() => {
    if (acTotalFlightTimeBefore) {
      const { hours, minutes } = splitTime(acTotalFlightTimeBefore)
      setCurrentHours(hours)
      setCurrentMinutes(minutes)
      setCalculatorExpanded(true)
    }
  }, [acTotalFlightTimeBefore])

  const hasEnoughData =
    (offBlockTime && takeoffTime) ||
    (takeoffTime && landingTime) ||
    (landingTime && onBlockTime)

  const calculateDuration = (
    start: dayjs.Dayjs | null,
    end: dayjs.Dayjs | null
  ): number => {
    if (!start || !end) return 0
    return end.diff(start, 'minute')
  }

  const taxiOutTime = calculateDuration(offBlockTime, takeoffTime)
  const flightTime = calculateDuration(takeoffTime, landingTime)
  const taxiInTime = calculateDuration(landingTime, onBlockTime)
  const totalTime = taxiOutTime + flightTime + taxiInTime

  const taxiOutPercent = totalTime ? (taxiOutTime / totalTime) * 100 : 0
  const flightPercent = totalTime ? (flightTime / totalTime) * 100 : 0
  const taxiInPercent = totalTime ? (taxiInTime / totalTime) * 100 : 0

  useEffect(() => {
    if (acTotalFlightTimeAfter) {
      const { hours, minutes } = splitTime(acTotalFlightTimeAfter)

      const totalMinutes = hours * 60 + minutes - flightTime

      setCurrentHours(Math.floor(totalMinutes / 60))
      setCurrentMinutes(totalMinutes % 60)
      setCalculatorExpanded(true)
    }
  }, [acTotalFlightTimeAfter, flightTime])

  if (!hasEnoughData) return null

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mt: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Typography variant='subtitle1' gutterBottom fontWeight='medium'>
        {t('flightLog.flightTimeline')}
      </Typography>

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          mb: 2,
          display: { xs: 'none', sm: 'none', md: 'block' },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            height: 30,
            borderRadius: 1,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          {taxiOutTime > 0 && (
            <Box
              sx={{
                width: `${taxiOutPercent}%`,
                backgroundColor: theme.palette.info.light,
                position: 'relative',
              }}
            >
              <Typography
                variant='caption'
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontWeight: 'medium',
                }}
              >
                {formatDuration(taxiOutTime)}
              </Typography>
            </Box>
          )}

          {flightTime > 0 && (
            <Box
              sx={{
                width: `${flightPercent}%`,
                backgroundColor: theme.palette.primary.main,
                position: 'relative',
              }}
            >
              <Typography
                variant='caption'
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontWeight: 'medium',
                  color: theme.palette.primary.contrastText,
                }}
              >
                {formatDuration(flightTime)}
              </Typography>
            </Box>
          )}

          {taxiInTime > 0 && (
            <Box
              sx={{
                width: `${taxiInPercent}%`,
                backgroundColor: theme.palette.info.light,
                position: 'relative',
              }}
            >
              <Typography
                variant='caption'
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontWeight: 'medium',
                }}
              >
                {formatDuration(taxiInTime)}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Grid container spacing={2}>
        <TimeBlock
          from={offBlockTime}
          to={takeoffTime}
          label={t('flightLog.taxiOut')}
          duration={taxiOutTime}
          color='info'
        />

        <TimeBlock
          from={takeoffTime}
          to={landingTime}
          label={t('flightLog.flightTime')}
          duration={flightTime}
          color='primary'
        />

        <TimeBlock
          from={landingTime}
          to={onBlockTime}
          label={t('flightLog.taxiIn')}
          duration={taxiInTime}
          color='info'
        />
      </Grid>

      {offBlockTime && onBlockTime && (
        <Box
          sx={{
            mt: 2,
            p: { xs: 1, sm: 1.5 },
            borderRadius: 1,
            bgcolor: alpha(theme.palette.primary.dark, 0.1),
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
          }}
        >
          <Typography variant='body2' fontWeight='medium' color='primary.dark'>
            {t('flightLog.totalBlockTime')}
          </Typography>
          <Typography
            variant='h6'
            color='primary.dark'
            sx={{ mt: { xs: 0.5, sm: 0 } }}
          >
            {formatDuration(calculateDuration(offBlockTime, onBlockTime))}
          </Typography>
        </Box>
      )}

      {flightTime > 0 && (
        <Box
          sx={{
            mt: 2,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.success.light, 0.05),
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <Box
            onClick={() => setCalculatorExpanded(!calculatorExpanded)}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: { xs: 1, sm: 1.5 },
              cursor: 'pointer',
              '&:hover': {
                bgcolor: alpha(theme.palette.success.light, 0.1),
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Icon
                icon='mdi:calculator'
                color={theme.palette.success.main}
                width={20}
                height={20}
                style={{ marginRight: theme.spacing(1) }}
              />
              <Typography
                variant='body2'
                fontWeight='medium'
                color='success.main'
              >
                {t('flightLog.logbookCalculator')}
              </Typography>
            </Box>
            <IconButton
              size='small'
              sx={{
                transform: calculatorExpanded
                  ? 'rotate(180deg)'
                  : 'rotate(0deg)',
                transition: 'transform 0.3s',
              }}
            >
              <Icon icon='mdi:chevron-down' width={20} height={20} />
            </IconButton>
          </Box>

          <Collapse in={calculatorExpanded}>
            <Box sx={{ p: { xs: 1, sm: 1.5 } }}>
              <Grid container spacing={2} sx={{ mb: 1.5 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Box
                    sx={{
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.grey[100], 0.5),
                      p: { xs: 1, sm: 1.5 },
                      height: '100%',
                    }}
                  >
                    <Typography
                      variant='caption'
                      color='text.secondary'
                      gutterBottom
                      display='block'
                    >
                      {t('flightLog.currentLogbookTime')}
                    </Typography>

                    <HoursAndMinutes
                      currentHours={currentHours}
                      currentMinutes={currentMinutes}
                      setCurrentHours={setCurrentHours}
                      setCurrentMinutes={setCurrentMinutes}
                    />
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <Box
                    sx={{
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      p: { xs: 1, sm: 1.5 },
                      height: '100%',
                    }}
                  >
                    <Typography
                      variant='body2'
                      fontWeight='medium'
                      color='primary.main'
                    >
                      {t('flightLog.thisFlightTime', 'This Flight Time')}
                    </Typography>
                    <Typography variant='h6'>
                      {formatDuration(flightTime)}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {t('flightLog.toBeAdded', 'To be added')}
                    </Typography>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <Box
                    sx={{
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.success.main, 0.1),
                      p: { xs: 1, sm: 1.5 },
                      height: '100%',
                    }}
                  >
                    <Typography
                      variant='body2'
                      fontWeight='medium'
                      color='success.main'
                    >
                      {t('flightLog.newTotalTime', 'New Total Time')}
                    </Typography>
                    <Typography variant='h6' color='success.main'>
                      {(() => {
                        if (currentHours == null || currentMinutes == null) {
                          return '--'
                        }

                        const totalMinutes =
                          currentHours * 60 + currentMinutes + flightTime

                        const newHours = Math.floor(totalMinutes / 60)
                        const newMinutes = totalMinutes % 60

                        return `${newHours}h ${newMinutes}min`
                      })()}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {!currentHours || !currentMinutes
                        ? t('flightLog.enterCurrentTime')
                        : t('flightLog.calculatedTotal')}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          </Collapse>
        </Box>
      )}
    </Paper>
  )
}

const TimeBlock = ({
  duration,
  from,
  to,
  label,
  color,
}: {
  duration: number
  from: dayjs.Dayjs | null
  to: dayjs.Dayjs | null
  label: string
  color: 'info' | 'primary'
}) => {
  const theme = useTheme()

  if (!from || !to) return <></>
  return (
    <Grid size={{ xs: 12, sm: 4 }}>
      <Box
        sx={{
          p: { xs: 1, sm: 1.5 },
          borderRadius: 1,
          height: '100%',
          bgcolor: alpha(
            color == 'primary'
              ? theme.palette.primary.main
              : theme.palette.info.light,
            0.1
          ),
        }}
      >
        <Typography
          variant='body2'
          fontWeight='medium'
          color={color == 'primary' ? 'primary.main' : 'info.main'}
        >
          {label}
        </Typography>
        <Typography variant='h6'>{formatDuration(duration)}</Typography>
        <Typography variant='caption' color='text.secondary'>
          {from.utc().format('HH:mm')} - {to.utc().format('HH:mm')} (
          {getTimezoneDisplay(true, from)})
          <br />
          {from.format('HH:mm')} - {to.format('HH:mm')} (
          {getTimezoneDisplay(false, from)})
        </Typography>
      </Box>
    </Grid>
  )
}

export default FlightTimeline
