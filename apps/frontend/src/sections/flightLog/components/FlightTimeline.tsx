import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  IconButton,
  Collapse,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Icon } from '@iconify/react'

interface FlightTimelineProps {
  offBlockTime: dayjs.Dayjs | null
  takeoffTime: dayjs.Dayjs | null
  landingTime: dayjs.Dayjs | null
  onBlockTime: dayjs.Dayjs | null
}

const FlightTimeline = ({
  offBlockTime,
  takeoffTime,
  landingTime,
  onBlockTime,
}: FlightTimelineProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const [currentHours, setCurrentHours] = useState<number | ''>('')
  const [currentMinutes, setCurrentMinutes] = useState<number | ''>('')
  const [calculatorExpanded, setCalculatorExpanded] = useState(false)

  const hasEnoughData =
    (offBlockTime && takeoffTime) ||
    (takeoffTime && landingTime) ||
    (landingTime && onBlockTime)

  if (!hasEnoughData) return null

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

  const formatDuration = (minutes: number): string => {
    if (minutes <= 0) return '--'
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`
  }

  const taxiOutPercent = totalTime ? (taxiOutTime / totalTime) * 100 : 0
  const flightPercent = totalTime ? (flightTime / totalTime) * 100 : 0
  const taxiInPercent = totalTime ? (taxiInTime / totalTime) * 100 : 0

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
        {t('flightLog.flightTimeline', 'Flight Timeline')}
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
        {offBlockTime && takeoffTime && (
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box
              sx={{
                p: { xs: 1, sm: 1.5 },
                borderRadius: 1,
                bgcolor: alpha(theme.palette.info.light, 0.1),
                height: '100%',
              }}
            >
              <Typography variant='body2' fontWeight='medium' color='info.main'>
                {t('flightLog.taxiOut', 'Taxi Out')}
              </Typography>
              <Typography variant='h6'>
                {formatDuration(taxiOutTime)}
              </Typography>
              <Typography variant='caption' color='text.secondary'>
                {offBlockTime.format('HH:mm')} - {takeoffTime.format('HH:mm')}
              </Typography>
            </Box>
          </Grid>
        )}

        {takeoffTime && landingTime && (
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box
              sx={{
                p: { xs: 1, sm: 1.5 },
                borderRadius: 1,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                height: '100%',
              }}
            >
              <Typography
                variant='body2'
                fontWeight='medium'
                color='primary.main'
              >
                {t('flightLog.flight', 'Flight')}
              </Typography>
              <Typography variant='h6'>{formatDuration(flightTime)}</Typography>
              <Typography variant='caption' color='text.secondary'>
                {takeoffTime.format('HH:mm')} - {landingTime.format('HH:mm')}
              </Typography>
            </Box>
          </Grid>
        )}

        {landingTime && onBlockTime && (
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box
              sx={{
                p: { xs: 1, sm: 1.5 },
                borderRadius: 1,
                bgcolor: alpha(theme.palette.info.light, 0.1),
                height: '100%',
              }}
            >
              <Typography variant='body2' fontWeight='medium' color='info.main'>
                {t('flightLog.taxiIn', 'Taxi In')}
              </Typography>
              <Typography variant='h6'>{formatDuration(taxiInTime)}</Typography>
              <Typography variant='caption' color='text.secondary'>
                {landingTime.format('HH:mm')} - {onBlockTime.format('HH:mm')}
              </Typography>
            </Box>
          </Grid>
        )}
      </Grid>

      <Box sx={{ display: 'none' }}>
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ mb: 1, display: 'block' }}
        >
          {t('flightLog.flightTimeline')}
        </Typography>
        {taxiOutTime > 0 && (
          <Box
            sx={{
              height: 24,
              mb: 1,
              borderRadius: 1,
              backgroundColor: theme.palette.info.light,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
            }}
          >
            <Typography variant='caption'>
              {t('flightLog.taxiOut', 'Taxi Out')}
            </Typography>
            <Typography variant='caption'>
              {formatDuration(taxiOutTime)}
            </Typography>
          </Box>
        )}
        {flightTime > 0 && (
          <Box
            sx={{
              height: 24,
              mb: 1,
              borderRadius: 1,
              backgroundColor: theme.palette.primary.main,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
            }}
          >
            <Typography variant='caption' color='primary.contrastText'>
              {t('flightLog.flight', 'Flight')}
            </Typography>
            <Typography variant='caption' color='primary.contrastText'>
              {formatDuration(flightTime)}
            </Typography>
          </Box>
        )}
        {taxiInTime > 0 && (
          <Box
            sx={{
              height: 24,
              mb: 1,
              borderRadius: 1,
              backgroundColor: theme.palette.info.light,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
            }}
          >
            <Typography variant='caption'>
              {t('flightLog.taxiIn', 'Taxi In')}
            </Typography>
            <Typography variant='caption'>
              {formatDuration(taxiInTime)}
            </Typography>
          </Box>
        )}
      </Box>

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
            {t('flightLog.totalBlockTime', 'Total Block Time')}
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
                {t('flightLog.logbookCalculator', 'Logbook Calculator')}
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
                      {t(
                        'flightLog.currentLogbookTime',
                        'Current Logbook Time'
                      )}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <TextField
                        size='small'
                        label={t('flightLog.hours', 'Hours')}
                        type='number'
                        value={currentHours}
                        onChange={(e) =>
                          setCurrentHours(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        inputProps={{ min: 0 }}
                        sx={{ width: '100%' }}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        size='small'
                        label={t('flightLog.minutes', 'Minutes')}
                        type='number'
                        value={currentMinutes}
                        onChange={(e) => {
                          const value =
                            e.target.value === '' ? '' : Number(e.target.value)
                          if (typeof value !== 'number' || value <= 59) {
                            setCurrentMinutes(value)
                          }
                        }}
                        inputProps={{ min: 0, max: 59 }}
                        sx={{ width: '100%' }}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Box>
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
                        if (currentHours === '' && currentMinutes === '') {
                          return '--'
                        }

                        const totalMinutes =
                          (typeof currentHours === 'number'
                            ? currentHours * 60
                            : 0) +
                          (typeof currentMinutes === 'number'
                            ? currentMinutes
                            : 0) +
                          flightTime

                        const newHours = Math.floor(totalMinutes / 60)
                        const newMinutes = totalMinutes % 60

                        return `${newHours}h ${newMinutes}m`
                      })()}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {currentHours === '' && currentMinutes === ''
                        ? t(
                            'flightLog.enterCurrentTime',
                            'Enter your current time'
                          )
                        : t('flightLog.calculatedTotal', 'Calculated total')}
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

export default FlightTimeline
