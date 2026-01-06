import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Collapse,
  IconButton,
} from '@mui/material'
import AirIcon from '@mui/icons-material/Air'
import ThermostatIcon from '@mui/icons-material/Thermostat'
import VisibilityIcon from '@mui/icons-material/Visibility'
import SpeedIcon from '@mui/icons-material/Speed'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import useApi from '../../../hooks/useApi'
import type { WeatherResponse } from '../../../types/weather'
import { WindRose } from './WindRose'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useState, useEffect, useRef } from 'react'

dayjs.extend(utc)

const WEATHER_WIDGET_STORAGE_KEY = 'weatherWidget.expanded'

const PHONETIC_ALPHABET: Record<string, string> = {
  A: 'Alpha',
  B: 'Bravo',
  C: 'Charlie',
  D: 'Delta',
  E: 'Echo',
  F: 'Foxtrot',
  G: 'Golf',
  H: 'Hotel',
  I: 'India',
  J: 'Juliet',
  K: 'Kilo',
  L: 'Lima',
  M: 'Mike',
  N: 'November',
  O: 'Oscar',
  P: 'Papa',
  Q: 'Quebec',
  R: 'Romeo',
  S: 'Sierra',
  T: 'Tango',
  U: 'Uniform',
  V: 'Victor',
  W: 'Whiskey',
  X: 'X-ray',
  Y: 'Yankee',
  Z: 'Zulu',
}

const getPhoneticWord = (letter: string): string => {
  return PHONETIC_ALPHABET[letter.toUpperCase()] || letter
}

export const WeatherWidget = () => {
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem(WEATHER_WIDGET_STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { data, error, isLoading } = useApi<WeatherResponse>(
    {
      url: 'v1/weather?site=efnu',
    },
    {
      refreshInterval: 60000, // Refresh every minute
    }
  )

  // API for fetching audio on demand
  const audioApi = useApi<Blob>({
    url: 'v1/weather/audio',
    skipFetch: true, // Don't fetch on mount
    responseType: 'blob', // Get audio as blob
  })

  useEffect(() => {
    localStorage.setItem(WEATHER_WIDGET_STORAGE_KEY, String(expanded))
  }, [expanded])

  const handleToggle = () => {
    setExpanded((prev) => !prev)
  }

  if (isLoading) {
    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            display='flex'
            justifyContent='center'
            alignItems='center'
            minHeight={200}
          >
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    const errorMessage = error.title || 'Weather Data Unavailable'
    const errorDetail =
      error.detail || 'Unable to fetch weather information at this time.'
    const severity =
      error.status === 503 || error.status === 504 ? 'warning' : 'error'

    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Alert severity={severity}>
            <strong>{errorMessage}</strong>
            <br />
            {errorDetail}
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!data?.states || data.states.length === 0) {
    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Alert severity='info'>No weather data available</Alert>
        </CardContent>
      </Card>
    )
  }

  const state = data.states[0]
  const report = state.report

  // Format the datetime
  const weatherTime = dayjs
    .unix(report.datetime_unix)
    .utc()
    .format('YYYY-MM-DD HH:mm')

  const reportIdPhonetic = getPhoneticWord(report.repid)

  const handlePlayAudio = async () => {
    if (!audioRef.current) return

    try {
      // Fetch audio with auth via useApi
      const response = await audioApi.fetch.trigger<{ filename: string }, Blob>(
        'GET',
        { filename: state.mp3 }
      )

      if (response.error || !response.data) {
        console.error('Failed to fetch audio:', response.error)
        return
      }

      const blob = response.data
      const objectUrl = URL.createObjectURL(blob)

      audioRef.current.src = objectUrl
      audioRef.current.load()
      await audioRef.current.play()

      // Clean up object URL when audio ends
      audioRef.current.onended = () => {
        URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      console.error('Error playing audio:', error)
    }
  }

  return (
    <Card sx={{ mb: 3, position: 'relative', overflow: 'hidden' }}>
      {/* Watermark - RepID Letter */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: { xs: '200px', sm: '300px', md: '400px' },
          fontWeight: 900,
          color: 'text.primary',
          opacity: 0.03,
          userSelect: 'none',
          pointerEvents: 'none',
          zIndex: 0,
          lineHeight: 1,
        }}
      >
        {report.repid}
      </Box>
      <CardContent sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            mb: expanded ? 2 : 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant='h5' component='h2'>
              EFNU Wx -{' '}
              <Box component='span' fontWeight='bold'>
                {reportIdPhonetic}
              </Box>
            </Typography>
            <IconButton
              size='small'
              color='primary'
              onClick={handlePlayAudio}
              aria-label='Listen to ATIS audio'
              sx={{ ml: 0.5 }}
            >
              <VolumeUpIcon fontSize='small' />
            </IconButton>
            <Box sx={{ display: 'none' }}>
              <audio ref={audioRef} preload='none'>
                <track kind='captions' />
              </audio>
            </Box>
            <Chip label='AUTO' size='small' color='primary' />
            {report.features && report.features.length > 0 && (
              <>
                {report.features.map((feature) => (
                  <Chip
                    key={feature}
                    label={feature}
                    size='small'
                    color='success'
                  />
                ))}
              </>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant='caption' color='text.secondary'>
              {weatherTime} UTC
            </Typography>
            <IconButton
              size='small'
              onClick={handleToggle}
              aria-label={expanded ? 'collapse' : 'expand'}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expanded} timeout='auto' unmountOnExit>
          <Grid container spacing={2}>
            {/* Weather data */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Grid container spacing={2}>
                {/* Wind */}
                <Grid size={{ xs: 6, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <AirIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                    <Box>
                      <Typography variant='caption' color='text.secondary'>
                        Wind
                      </Typography>
                      <Typography variant='body1' fontWeight='bold'>
                        {report.wind_dir}° {report.wind_kt.toFixed(1)} kt
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        {report.wind_ms.toFixed(1)} m/s
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Temperature & Dew Point */}
                <Grid size={{ xs: 6, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <ThermostatIcon sx={{ fontSize: 32, color: 'info.main' }} />
                    <Box>
                      <Typography variant='caption' color='text.secondary'>
                        Temp / Dew Point
                      </Typography>
                      <Typography variant='body1' fontWeight='bold'>
                        {report.temperature.toFixed(1)}°C /{' '}
                        {report.dewpoint.toFixed(1)}°C
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Visibility */}
                <Grid size={{ xs: 6, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <VisibilityIcon
                      sx={{ fontSize: 32, color: 'success.main' }}
                    />
                    <Box>
                      <Typography variant='caption' color='text.secondary'>
                        Visibility
                      </Typography>
                      <Typography variant='body1' fontWeight='bold'>
                        {report.vis_km_full} km
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* QNH */}
                <Grid size={{ xs: 6, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <SpeedIcon sx={{ fontSize: 32, color: 'warning.main' }} />
                    <Box>
                      <Typography variant='caption' color='text.secondary'>
                        QNH
                      </Typography>
                      <Typography variant='body1' fontWeight='bold'>
                        {report.qnh.toFixed(1)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Humidity */}
                <Grid size={{ xs: 6, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <WaterDropIcon sx={{ fontSize: 32, color: 'info.light' }} />
                    <Box>
                      <Typography variant='caption' color='text.secondary'>
                        Humidity
                      </Typography>
                      <Typography variant='body1' fontWeight='bold'>
                        {report.humidity.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Grid>

            {/* Right column - Wind Rose */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                <Typography
                  variant='caption'
                  color='text.secondary'
                  sx={{ mb: 0.5 }}
                >
                  Wind Rose - 10 min
                </Typography>
                <WindRose windRoseData={report.wind_rose} size={220} />
              </Box>
            </Grid>
          </Grid>
        </Collapse>
      </CardContent>
    </Card>
  )
}
