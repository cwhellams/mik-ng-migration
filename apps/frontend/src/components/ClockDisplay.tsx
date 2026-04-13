import { Box, Tooltip, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useServerClock } from '../hooks/useServerClock'
import { formatClockTime, getHelsinkiOffsetLabel } from '../utils/date'

interface ClockDisplayProps {
  /** When true, show HH:MM:SS; when false, show HH:MM only */
  showSeconds?: boolean
}

/**
 * Discreet dual-timezone clock for the site header.
 * Times are server-authoritative (Digital Ocean NTP), never trusting the
 * local device clock. Warns if the device clock is more than 5 minutes off.
 */
const ClockDisplay = ({ showSeconds = false }: ClockDisplayProps) => {
  const { utcMs, synced, skewed, skewMs } = useServerClock()

  const utcTime = formatClockTime(utcMs, 'UTC', showSeconds)
  const helTime = formatClockTime(utcMs, 'Europe/Helsinki', showSeconds)
  const helOffset = getHelsinkiOffsetLabel(utcMs)

  const skewMinutes = Math.round(Math.abs(skewMs) / 60000)
  const skewDirection = skewMs > 0 ? 'behind' : 'ahead of'
  const warningText = `Device clock is ${skewMinutes} min ${skewDirection} server time`

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        mr: 1,
      }}
    >
      {skewed && (
        <Tooltip title={warningText} arrow>
          <Box
            component='span'
            sx={{ display: 'flex', alignItems: 'center', cursor: 'help' }}
          >
            <Icon
              icon='mdi:clock-alert-outline'
              width={16}
              height={16}
              color='#ed6c02'
            />
          </Box>
        </Tooltip>
      )}

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          lineHeight: 1,
        }}
      >
        {/* UTC time — shown on all screen sizes */}
        <Typography
          variant='caption'
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.68rem',
            color: 'text.primary',
            opacity: synced ? 0.7 : 0.35,
            letterSpacing: 0,
            lineHeight: 1.4,
          }}
        >
          UTC&nbsp;{synced ? utcTime : '--:--'}
        </Typography>
        {/* Helsinki offset + time — shown on all screen sizes */}
        <Typography
          variant='caption'
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.68rem',
            color: 'text.primary',
            opacity: synced ? 0.7 : 0.35,
            letterSpacing: 0,
            lineHeight: 1.4,
          }}
        >
          {synced ? `${helOffset} ${helTime}` : '--:--'}
        </Typography>
        {/* "Helsinki" label — desktop only */}
        <Typography
          variant='caption'
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.55rem',
            color: 'text.primary',
            opacity: synced ? 0.5 : 0.25,
            letterSpacing: 0,
            lineHeight: 1.2,
            display: { xs: 'none', sm: 'block' },
          }}
        >
          Helsinki
        </Typography>
      </Box>
    </Box>
  )
}

export default ClockDisplay
