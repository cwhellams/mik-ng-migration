export const FlightLogListEntry = () => {}
import { Box, Typography } from '@mui/material'
import { Grid, useMediaQuery, useTheme } from '@mui/system'
import { Link, type LinkProps } from 'react-router'
import type { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import PlayCircleFilledWhiteOutlinedIcon from '@mui/icons-material/PlayCircleFilledWhiteOutlined'
import DangerousOutlinedIcon from '@mui/icons-material/DangerousOutlined'
import FlightTakeoffOutlinedIcon from '@mui/icons-material/FlightTakeoffOutlined'
import FlightLandOutlinedIcon from '@mui/icons-material/FlightLandOutlined'
import { useTranslation } from 'react-i18next'
import { useTimezone } from '../hooks/useTimezone'

export const FlightLogBanner = ({
  aircraftRegistration,
  flightType,
}: {
  aircraftRegistration: string
  flightType: string
}) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      px: 1.5,
      py: 0.5,
      borderRadius: 1,
      bgcolor: 'action.hover',
    }}
  >
    <Typography variant='subtitle2' sx={{ fontWeight: 'bold' }}>
      {aircraftRegistration}
    </Typography>
    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
      {flightType}
    </Typography>
  </Box>
)

export const FlightLogDate = ({
  flightId,
  date,
  link,
  ref,
  ...linkProps
}: {
  flightId: string
  date: string
  link: boolean
  ref?: React.Ref<HTMLAnchorElement>
} & Partial<LinkProps>) => {
  const { formatDateCustom } = useTimezone()

  // Month above, year below the day number. Below the `sm` breakpoint (600px — well
  // above phone widths like the iPhone 13's 390px or a typical Android's ~360-412px, so
  // every phone gets the compact version) it's kept as narrow as the digits allow, so
  // the timeline beside it has more room. From `sm` up (tablet/desktop) it's sized up
  // for readability, since width is no longer the constraint.
  const content = (
    <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
      <Typography
        sx={{
          fontSize: { xs: 10, sm: 14 },
          textTransform: 'uppercase',
          color: 'text.secondary',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {formatDateCustom(date, 'MMM')}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: 28, sm: 40 },
          fontWeight: 'bold',
          lineHeight: 1,
        }}
      >
        {formatDateCustom(date, 'D')}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: 10, sm: 14 },
          color: 'text.secondary',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {formatDateCustom(date, 'YYYY')}
      </Typography>
    </Box>
  )

  if (link) {
    return (
      <Link to={`/logs/flights/${flightId}`} {...linkProps} ref={ref}>
        {content}
      </Link>
    )
  } else {
    return <Box ref={ref}>{content}</Box>
  }
}

// A marker on the unified timeline: an icon (or ball, for takeoff/landing) with its
// clock time underneath. The icon sits in a fixed-height box so markers with
// differently-sized icons still line up with the connecting segments beside them.
const TIMELINE_ROW_HEIGHT = 24

const TimelineMarker = ({
  children,
  time,
  bold,
}: {
  children: ReactNode
  time: string
  bold?: boolean
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
    <Box
      sx={{
        height: TIMELINE_ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Box>
    <Typography
      sx={{
        fontSize: bold ? '0.85em' : '0.7em',
        fontWeight: bold ? 'bold' : 'normal',
        color: bold ? 'text.primary' : 'text.secondary',
        whiteSpace: 'nowrap',
        mt: 0.25,
      }}
    >
      {time}
    </Typography>
  </Box>
)

// A connecting segment of the timeline between two markers. Segments grow to fill the
// available width (rather than a fixed pixel size) so the timeline always spans the
// full card, however wide it is.
const TimelineSegment = ({ bold }: { bold?: boolean }) => (
  <Box
    sx={{
      height: TIMELINE_ROW_HEIGHT,
      flex: 1,
      minWidth: 16,
      display: 'flex',
      alignItems: 'center',
    }}
  >
    <Box
      sx={{
        width: '100%',
        height: bold ? 3 : 2,
        borderRadius: 2,
        bgcolor: bold ? 'primary.main' : 'divider',
      }}
    />
  </Box>
)

// Timeline for a single flight: departure/arrival airports, the block time (top) and
// flight time (below it) stacked and centered, and a single unified timeline — spanning
// the full width of the card — running off-block → takeoff → landing → on-block.
export const FlightLogTimeline = ({
  departureAirport,
  arrivalAirport,
  offBlockTimeUtc,
  takeoffTimeUtc,
  landingTimeUtc,
  onBlockTimeUtc,
  flightTime,
  blockTime,
  secondaryTime,
}: {
  departureAirport: string
  arrivalAirport: string
  offBlockTimeUtc?: string
  takeoffTimeUtc: string
  landingTimeUtc: string
  onBlockTimeUtc?: string
  flightTime: string
  blockTime?: string | null
  // Used where there's no off-block/on-block data (e.g. AJLB view), to show a secondary
  // duration (aircraft total time) instead of a block-time row.
  secondaryTime?: string | null
}) => {
  const { formatTime } = useTimezone()
  const { t } = useTranslation()

  const hasBlockRow = Boolean(offBlockTimeUtc && onBlockTimeUtc)

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Box sx={{ fontWeight: 'bold' }}>{departureAirport}</Box>
        <Typography sx={{ fontWeight: 'bold', fontSize: '1.1em' }}>{flightTime}</Typography>
        <Box sx={{ fontWeight: 'bold' }}>{arrivalAirport}</Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%', mt: 0.5 }}>
        {hasBlockRow && (
          <>
            <TimelineMarker time={formatTime(offBlockTimeUtc!)}>
              <PlayCircleFilledWhiteOutlinedIcon sx={{ fontSize: 24, color: 'text.secondary' }} />
            </TimelineMarker>
            <TimelineSegment />
          </>
        )}
        <TimelineMarker time={formatTime(takeoffTimeUtc)} bold>
          <FlightTakeoffOutlinedIcon sx={{ fontSize: 22, color: 'primary.main' }} />
        </TimelineMarker>
        <TimelineSegment bold />
        <TimelineMarker time={formatTime(landingTimeUtc)} bold>
          <FlightLandOutlinedIcon sx={{ fontSize: 22, color: 'primary.main' }} />
        </TimelineMarker>
        {hasBlockRow && (
          <>
            <TimelineSegment />
            <TimelineMarker time={formatTime(onBlockTimeUtc!)}>
              <DangerousOutlinedIcon sx={{ fontSize: 24, color: 'text.secondary' }} />
            </TimelineMarker>
          </>
        )}
      </Box>

      {(hasBlockRow && blockTime) || (!hasBlockRow && secondaryTime) ? (
        <Box sx={{ textAlign: 'center', mt: 0.25 }}>
          <Typography sx={{ fontSize: '0.75em', color: 'text.secondary' }}>
            {hasBlockRow ? `${t('flightLog.blockTime')} ${blockTime}` : secondaryTime}
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}

export const ViewFlightDate = ({
  flightId,
  date,
  link,
  ref,
  ...linkProps
}: {
  flightId: string
  date: string
  link: boolean
  ref?: React.Ref<HTMLAnchorElement>
} & Partial<LinkProps>) => {
  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const { formatDate, formatDateCustom } = useTimezone()

  const content = isMd ? (
    formatDate(date)
  ) : (
    <>
      <Typography
        sx={{
          fontSize: 25,
          lineHeight: 0.75,
        }}
      >
        {formatDateCustom(date, 'DD.MM.')}
      </Typography>
      <Typography
        sx={{
          fontSize: 16,
        }}
      >
        {formatDateCustom(date, 'YYYY')}
      </Typography>
    </>
  )

  if (link) {
    return (
      <Link to={`/logs/flights/${flightId}`} {...linkProps} ref={ref}>
        {content}
      </Link>
    )
  } else {
    return <Box ref={ref}>{content}</Box>
  }
}

export const ViewMobileFlightDetails = ({
  size,
  numberOfLandings,
  flightType,
  children,
}: {
  size: number
  numberOfLandings: number
  flightType: string
  children: ReactNode
}) => {
  const { t } = useTranslation()
  return (
    <Grid
      size={size}
      sx={{
        justifyContent: 'flex-end',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {numberOfLandings} <Icon icon='mdi:airplane-landing' style={{ verticalAlign: 'middle' }} />
      <Box
        sx={{
          mx: 1,
        }}
      >
        {t(`flightLog.flightTypes.${flightType}`)}
      </Box>
      {children}
    </Grid>
  )
}

export const ViewMobileCrew = ({
  size,
  personsOnBoard,
  crew,
}: {
  size: number
  personsOnBoard: number
  crew: (string | null)[]
}) => {
  return (
    <Grid size={size}>
      {crew.map((name, index) => (
        <Box key={`crew-${index}`}>{name}</Box>
      ))}
      <Box>
        ({personsOnBoard}
        <Icon icon='mdi:account' style={{ verticalAlign: 'middle' }} />)
      </Box>
    </Grid>
  )
}
