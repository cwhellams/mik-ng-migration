import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
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
import StopIcon from '@mui/icons-material/Stop'
import CloudIcon from '@mui/icons-material/Cloud'
import useApi from '../../../hooks/useApi'
import type { WeatherResponse } from '../../../../../backend/src/routes/weather/models'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useState, useEffect, useRef } from 'react'
import { WindRose, type RunwaySpec } from './WindRose'
import { RemoteContent } from '../../../components/RemoteContent'
import { useTimezone } from '../../../hooks/useTimezone'

dayjs.extend(utc)

const WEATHER_WIDGET_STORAGE_KEY = (site: string) =>
  `weatherWidget.${site}.expanded`

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

const CLOUD_COVERAGE: Record<string, string> = {
  FEW: 'Few',
  SCT: 'Scattered',
  BKN: 'Broken',
  OVC: 'Overcast',
  CLR: 'Clear',
  SKC: 'Sky Clear',
  NSC: 'No Significant Cloud',
  VV: 'Vertical Visibility',
}

const formatCloudCoverage = (type: string): string => {
  return CLOUD_COVERAGE[type.toUpperCase()] || type
}

const SITE_RUNWAYS: Record<string, RunwaySpec[]> = {
  efnu: [
    { heading: 40, oppositeHeading: 220, length: 0.7, width: 0.015 }, // 04/22
    { heading: 90, oppositeHeading: 270, length: 0.5, width: 0.01 }, // 09/27
  ],
  efhk: [
    {
      heading: 44,
      oppositeHeading: 224,
      length: 0.55,
      width: 0.015,
      offsetX: -0.38,
      offsetY: 0.15,
    }, // 04L/22R (SW)
    {
      heading: 44,
      oppositeHeading: 224,
      length: 0.55,
      width: 0.015,
      offsetX: 0.1,
      offsetY: 0.05,
    }, // 04R/22L (near center)
    {
      heading: 150,
      oppositeHeading: 330,
      length: 0.55,
      width: 0.015,
      offsetX: 0.5,
      offsetY: 0.08,
    }, // 15/33 (SE)
  ],
}

interface WeatherWidgetProps {
  site?: string
}

export const WeatherWidget = ({ site = 'efnu' }: WeatherWidgetProps) => {
  const storageKey = WEATHER_WIDGET_STORAGE_KEY(site)
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem(storageKey)
    return stored === null ? true : stored === 'true'
  })
  const [isPlaying, setIsPlaying] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { formatISODateTime, timezoneOffset } = useTimezone()

  const { data, error, isLoading } = useApi<WeatherResponse>(
    {
      url: `v1/weather?site=${site}`,
    },
    {
      refreshInterval: 60000, // Refresh every minute
    },
  )

  // API for fetching audio on demand
  const audioApi = useApi<Blob>({
    url: 'v1/weather/audio',
    skipFetch: true, // Don't fetch on mount
    responseType: 'blob', // Get audio as blob
  })

  useEffect(() => {
    localStorage.setItem(storageKey, String(expanded))
  }, [expanded, storageKey])

  const handleToggle = () => {
    setExpanded((prev) => !prev)
  }

  const state = data?.states?.[0]
  const report = state?.report

  const weatherTime = report ? dayjs.unix(report.datetime_unix) : null

  const reportIdPhonetic = report ? getPhoneticWord(report.repid) : ''

  const handleToggleAudio = async () => {
    if (!audioRef.current) return

    // If audio is playing, stop it
    if (isPlaying) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      return
    }

    // Otherwise, start playing
    if (!state?.mp3) return

    try {
      // Fetch audio with auth via useApi
      const response = await audioApi.fetch.trigger<{ filename: string }, Blob>('GET', {
        filename: state.mp3,
      })

      if (response.error || !response.data) {
        console.error('Failed to fetch audio:', response.error)
        return
      }

      const blob = response.data
      const objectUrl = URL.createObjectURL(blob)

      audioRef.current.src = objectUrl
      audioRef.current.load()
      await audioRef.current.play()
      setIsPlaying(true)

      // Clean up object URL when audio ends
      audioRef.current.onended = () => {
        URL.revokeObjectURL(objectUrl)
        setIsPlaying(false)
      }
    } catch (error) {
      console.error('Error playing audio:', error)
      setIsPlaying(false)
    }
  }

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      {!data?.states || data.states.length === 0 ? (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Alert severity='info'>No weather data available</Alert>
          </CardContent>
        </Card>
      ) : (
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
            {report?.repid}
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
                  {site === 'efnu' ? (
                    <>
                      {site.toUpperCase()} ATIS -{' '}
                      <Box component='span' fontWeight='bold'>
                        {reportIdPhonetic}
                      </Box>
                    </>
                  ) : (
                    <>{site.toUpperCase()} METAR</>
                  )}
                </Typography>
                {state?.mp3 && (
                  <IconButton
                    size='small'
                    color='primary'
                    onClick={handleToggleAudio}
                    aria-label={
                      isPlaying ? 'Stop ATIS audio' : 'Listen to ATIS audio'
                    }
                    sx={{ ml: 0.5 }}
                  >
                    {isPlaying ? (
                      <StopIcon fontSize='small' />
                    ) : (
                      <VolumeUpIcon fontSize='small' />
                    )}
                  </IconButton>
                )}
                <Box sx={{ display: 'none' }}>
                  <audio ref={audioRef} preload='none'>
                    <track kind='captions' />
                  </audio>
                </Box>
                <Chip label='AUTO' size='small' color='primary' />
                {report?.features && report.features.length > 0 && (
                  <>
                    {report.features.map((feature) => (
                      <Chip key={feature} label={feature} size='small' color='success' />
                    ))}
                  </>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant='caption' color='text.secondary'>
                  {formatISODateTime(weatherTime)}{' '}
                  {weatherTime ? timezoneOffset(weatherTime.toDate()) : ''}
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
                {/* Cloud Layers - Top Row spanning full width of left column */}
                {report?.clouds && report.clouds.length > 0 && (
                  <Grid size={{ xs: 12, md: 8 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                      }}
                    >
                      <CloudIcon
                        sx={{
                          fontSize: 32,
                          color: 'text.secondary',
                          mt: 0.5,
                        }}
                      />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant='caption' color='text.secondary'>
                          Cloud Layers
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 1,
                            mt: 0.5,
                          }}
                        >
                          {report.clouds.map((cloud, index) => {
                            const [coverage, heightHundreds, cloudType] = cloud
                            const heightFeet = heightHundreds * 100
                            return (
                              <Chip
                                key={index}
                                label={`${formatCloudCoverage(coverage)} ${heightFeet}ft${cloudType ? ` (${cloudType})` : ''}`}
                                size='small'
                                variant='outlined'
                                sx={{ fontWeight: 'medium' }}
                              />
                            )
                          })}
                        </Box>
                      </Box>
                    </Box>
                  </Grid>
                )}

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
                            {report?.wind_dir}° {report?.wind_kt.toFixed(0)} kt
                            {report?.wind_gust_kt && (
                              <span>, gust {report.wind_gust_kt.toFixed(0)} kt</span>
                            )}
                          </Typography>
                          {report?.wind_dir_min && (
                            <Typography variant='caption' color='text.secondary'>
                              Variable between {report.wind_dir_min}-{report.wind_dir_max}°
                            </Typography>
                          )}
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
                            {report?.temperature.toFixed(1)}°C / {report?.dewpoint.toFixed(1)}°C
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>

                    {/* Visibility */}
                    <Grid size={{ xs: 6, sm: 6 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <VisibilityIcon sx={{ fontSize: 32, color: 'success.main' }} />
                        <Box>
                          <Typography variant='caption' color='text.secondary'>
                            Visibility
                          </Typography>
                          <Typography variant='body1' fontWeight='bold'>
                            {(report?.vis_km_full ?? report?.vis_km)?.toFixed(1)} km
                          </Typography>
                          {report?.vis_m && (
                            <Typography variant='caption' color='text.secondary'>
                              {report.vis_m} m
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Grid>

                    {/* Vertical Visibility */}
                    {report?.vvis_ft !== undefined && (
                      <Grid size={{ xs: 6, sm: 6 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                          }}
                        >
                          <VisibilityIcon sx={{ fontSize: 32, color: 'warning.main' }} />
                          <Box>
                            <Typography variant='caption' color='text.secondary'>
                              Vertical Visibility
                            </Typography>
                            <Typography variant='body1' fontWeight='bold'>
                              {report.vvis_ft} ft
                            </Typography>
                            {report.vvis && (
                              <Typography variant='caption' color='text.secondary'>
                                {report.vvis.toFixed(1)} m
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Grid>
                    )}

                    {/* QNH */}
                    <Grid size={{ xs: 6, sm: 6 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <SpeedIcon sx={{ fontSize: 32, color: 'warning.main' }} />
                        <Box>
                          <Typography variant='caption' color='text.secondary'>
                            QNH
                          </Typography>
                          <Typography variant='body1' fontWeight='bold'>
                            {report?.qnh.toFixed(1)}
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
                            {report?.humidity.toFixed(1)}%
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
                      {site === 'efnu'
                        ? 'Wind Rose - 10 min'
                        : 'Current Wind Direction'}
                    </Typography>
                    {(report?.wind_rose?.length ?? 0) > 0 && (
                      <WindRose
                        windRoseData={report.wind_rose}
                        size={220}
                        runways={SITE_RUNWAYS[site] ?? SITE_RUNWAYS.efnu}
                      />
                    )}
                  </Box>
                </Grid>
              </Grid>
            </Collapse>
          </CardContent>
        </Card>
      )}
    </RemoteContent>
  )
}
