import { Box, Tooltip, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useServerClock } from '../hooks/useServerClock'
import { formatTimeInTz, getOffsetLabelInTz } from '@mik/ui/utils/date'
import { useTimezone } from '../hooks/useTimezone'

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

  const utcTime = formatTimeInTz(utcMs, 'utc', { showSeconds })
  const helTime = formatTimeInTz(utcMs, 'helsinki', { showSeconds })
  const localTime = formatTimeInTz(utcMs, 'local', { showSeconds })

  const helOffset = getOffsetLabelInTz(utcMs, 'helsinki')
  const localOffset = getOffsetLabelInTz(utcMs, 'local')

  const localIsHelsinki = localOffset === helOffset

  const { timezone } = useTimezone()

  const skewMinutes = Math.round(Math.abs(skewMs) / 60000)
  const skewDirection = skewMs > 0 ? 'behind' : 'ahead of'
  const warningText = `Device clock is ${skewMinutes} min ${skewDirection} server time`

  const renderTime = (label: string, selected: boolean, time: string) => (
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
      {selected && <Icon icon='mdi:check' style={{ marginRight: '8px' }} />}
      <span
        style={
          selected
            ? {
                fontWeight: 'bolder',
                opacity: synced ? 1 : 0.6,
              }
            : {}
        }
      >
        {label}
      </span>
      &nbsp;
      {synced ? time : '--:--'}
    </Typography>
  )

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
          <Box component='span' sx={{ display: 'flex', alignItems: 'center', cursor: 'help' }}>
            <Icon icon='mdi:clock-alert-outline' width={16} height={16} color='#ed6c02' />
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
        {renderTime('UTC', timezone === 'utc', utcTime)}

        {/* Local time — shown only when not in Helsinki timezone */}
        {helOffset != localOffset &&
          renderTime(localOffset, timezone === 'local' && !localIsHelsinki, localTime)}

        {renderTime(helOffset, timezone === 'local' && localIsHelsinki, helTime)}

        {/* "Helsinki" label — desktop only when at helsinki zone */}

        {helOffset == localOffset && (
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
        )}
      </Box>
    </Box>
  )
}

export default ClockDisplay
