export const FlightLogListEntry = () => {}
import { Box, Typography } from '@mui/material'
import { Grid, useMediaQuery, useTheme } from '@mui/system'
import { Link, LinkProps } from 'react-router-dom'
import { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { useTimezone } from '../../../hooks/useTimezone'

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

export const ViewMobileFlightTime = ({
  size,
  departureAirport,
  arrivalAirport,
  offBlockTimeUtc,
  takeoffTimeUtc,
  landingTimeUtc,
  onBlockTimeUtc,
  flightTime,
  secondaryTime,
}: {
  size: number
  departureAirport: string
  arrivalAirport: string
  offBlockTimeUtc?: string
  takeoffTimeUtc: string
  landingTimeUtc: string
  onBlockTimeUtc?: string
  flightTime: string
  secondaryTime?: string | null
}) => {
  const { formatTime } = useTimezone()

  return (
    <Grid
      size={size}
      container
      sx={{
        alignItems: 'center',
      }}
    >
      <Grid size={12} sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box>{departureAirport}</Box>

        <Box>{arrivalAirport}</Box>
      </Grid>
      <Grid
        size={3}
        sx={{
          alignContent: 'start',
          alignSelf: 'start',
        }}
      >
        {offBlockTimeUtc && (
          <Box
            sx={{
              color: 'text.secondary',
            }}
          >
            {formatTime(offBlockTimeUtc)}
          </Box>
        )}
        <Box
          sx={{
            color: 'text.secondary',
          }}
        >
          {formatTime(takeoffTimeUtc)}
        </Box>
      </Grid>
      <Grid size={6}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            textAlign: 'center',
            flexWrap: 'wrap',

            ':before': {
              content: '""',
              flex: 1,
              borderBottom: '1px solid',
              marginRight: '5px',
            },

            ':after': {
              content: '""',
              flex: 1,
              borderBottom: '1px solid',
              marginLeft: '5px',
            },
          }}
        >
          {flightTime}
        </Box>
        {secondaryTime && (
          <Box
            sx={{
              textAlign: 'center',
            }}
          >
            {secondaryTime}
          </Box>
        )}
      </Grid>
      <Grid
        size={3}
        sx={{
          textAlign: 'end',
          alignSelf: 'start',
        }}
      >
        <Box
          sx={{
            color: 'text.secondary',
          }}
        >
          {formatTime(landingTimeUtc)}
        </Box>
        {onBlockTimeUtc && (
          <Box
            sx={{
              color: 'text.secondary',
            }}
          >
            {formatTime(onBlockTimeUtc)}
          </Box>
        )}
      </Grid>
    </Grid>
  )
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
