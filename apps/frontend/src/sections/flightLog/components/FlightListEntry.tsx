export const FlightLogListEntry = () => {}
import { Box, Typography } from '@mui/material'
import { Grid, useMediaQuery, useTheme } from '@mui/system'
import { Link, LinkProps } from 'react-router-dom'
import { formatDate, formatTime } from '../../../utils/date'
import { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'

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

  const content = isMd ? (
    formatDate(date)
  ) : (
    <>
      <Typography fontSize={25} lineHeight={0.75}>
        {formatDate(date, 'D.M.')}
      </Typography>
      <Typography fontSize={16}>{formatDate(date, 'YYYY')}</Typography>
    </>
  )

  if (link) {
    return (
      <Link to={`/logs/${flightId}`} {...linkProps} ref={ref}>
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
  return (
    <Grid size={size} container alignItems='center'>
      <Grid size={12} sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box>{departureAirport}</Box>

        <Box>{arrivalAirport}</Box>
      </Grid>
      <Grid size={3} alignContent='start' alignSelf='start'>
        {offBlockTimeUtc && (
          <Box color='text.secondary'>{formatTime(offBlockTimeUtc)}</Box>
        )}
        <Box color='text.secondary'>{formatTime(takeoffTimeUtc)}</Box>
      </Grid>
      <Grid size={6}>
        <Box
          display='flex'
          alignItems='center'
          textAlign='center'
          flexWrap='wrap'
          sx={{
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
        {secondaryTime && <Box textAlign='center'>{secondaryTime}</Box>}
      </Grid>
      <Grid size={3} textAlign='end' alignSelf='start'>
        <Box color='text.secondary'>{formatTime(landingTimeUtc)}</Box>
        {onBlockTimeUtc && (
          <Box color='text.secondary'>{formatTime(onBlockTimeUtc)}</Box>
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
      justifyContent='flex-end'
      display='flex'
      alignItems='center'
    >
      {numberOfLandings}{' '}
      <Icon icon='mdi:airplane-landing' style={{ verticalAlign: 'middle' }} />
      <Box mx={1}>{t(`flightLog.flightTypes.${flightType}`)}</Box>
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
