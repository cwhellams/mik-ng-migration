import {
  Grid,
  TextField,
  Box,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  InputAdornment,
  Paper,
} from '@mui/material'
import { Control, Controller, UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { FlightLogInsertRequest } from '@backend/routes/flight-log/models'

interface FlightCrewProps {
  flightType: string
  register: UseFormRegister<FlightLogInsertRequest>
  control: Control<FlightLogInsertRequest>
  errors: Record<string, any>
}

// Crew member types
const CREW_TYPES = [
  { value: 'STU', label: 'Student' },
  { value: 'FI', label: 'Flight Instructor' },
  { value: 'FE', label: 'Flight Examiner' },
  { value: 'OBS', label: 'Observer' },
]

const FlightCrew = ({
  flightType,
  register,
  control,
  errors,
}: FlightCrewProps) => {
  const { t } = useTranslation()
  const [additionalCrewCount, setAdditionalCrewCount] = useState(0)
  // Set copilot as default PIC (index 1)
  const [picPosition, setPicPosition] = useState('copilot')

  if (!flightType) {
    return (
      <Grid item xs={12}>
        <Box
          sx={{
            p: 3,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            textAlign: 'center',
            bgcolor: 'background.paper',
          }}
        >
          <Icon
            icon='mdi:account-question'
            style={{ fontSize: 40, opacity: 0.5, marginBottom: 8 }}
          />
          <Typography color='text.secondary'>
            {t(
              'flightLog.selectFlightTypeCrew',
              'Please select a flight type to continue with crew information'
            )}
          </Typography>
        </Box>
      </Grid>
    )
  }

  // Check if flight type is one that only needs a pilot
  const singlePilotTypes = ['HAR', 'MAT', 'SII', 'KOE']
  const isSinglePilotFlight = singlePilotTypes.includes(flightType)

  // If we're showing a single pilot flight type, set self as PIC
  if (isSinglePilotFlight && picPosition !== 'self') {
    setPicPosition('self')
  }

  const handleAddCrew = () => {
    if (additionalCrewCount < 2) {
      setAdditionalCrewCount(additionalCrewCount + 1)
    }
  }

  const handleRemoveCrew = (index: number) => {
    if (additionalCrewCount > 0) {
      setAdditionalCrewCount(additionalCrewCount - 1)
      // If removed crew was PIC, reset to copilot
      if (picPosition === `additional${index}`) {
        setPicPosition('copilot')
      }
    }
  }

  // PIC button component to use as InputAdornment
  const PicButton = ({ position }: { position: string }) => {
    const isSelected = picPosition === position

    return (
      <Paper
        elevation={0}
        sx={{
          width: '55px',
          height: '38px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          bgcolor: isSelected ? 'primary.main' : 'background.default',
          color: isSelected ? 'primary.contrastText' : 'text.secondary',
          border: isSelected ? 'none' : '1px solid',
          borderColor: 'divider',
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          transition: 'background-color 0.2s, color 0.2s',
          '&:hover': {
            bgcolor: isSelected ? 'primary.dark' : 'action.hover',
          },
          mr: 0, // Remove gap between button and input
        }}
        onClick={() => setPicPosition(position)}
      >
        PIC
      </Paper>
    )
  }

  return (
    <>
      <Grid container spacing={2}>
        {/* Self (Pilot/Captain) */}
        {isSinglePilotFlight ? (
          // Single pilot mode - just display Self field
          <Grid item xs={12}>
            <TextField
              fullWidth
              label={t('flightLog.self', 'Self')}
              disabled={true}
              value='SELF'
              InputProps={{
                startAdornment: (
                  <InputAdornment position='start'>
                    <PicButton position='self' />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        ) : (
          // Multi crew mode - display Self with duty selection
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField
                  fullWidth
                  label={t('flightLog.self', 'Self')}
                  disabled={true}
                  value='SELF'
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position='start'>
                        <PicButton position='self' />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={4}>
                <Controller
                  name='selfType'
                  control={control}
                  defaultValue='PILOT'
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.selfType}>
                      <InputLabel>{t('flightLog.duty', 'Duty')}</InputLabel>
                      <Select
                        {...field}
                        label={t('flightLog.duty', 'Duty')}
                        renderValue={(value) => value}
                      >
                        {CREW_TYPES.map((type) => (
                          <MenuItem key={type.value} value={type.value}>
                            {type.value} - {type.label}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.selfType && (
                        <FormHelperText>
                          {errors.selfType.message?.toString()}
                        </FormHelperText>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>
            </Grid>
          </Grid>
        )}

        {!isSinglePilotFlight && (
          <>
            {/* Copilot */}
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={8}>
                  <TextField
                    fullWidth
                    label={t('flightLog.crew1', 'Crew #1')}
                    {...register('copilot')}
                    error={!!errors.copilot}
                    helperText={errors.copilot?.message?.toString()}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position='start'>
                          <PicButton position='copilot' />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={4}>
                  <Controller
                    name='copilotType'
                    control={control}
                    defaultValue='FI'
                    render={({ field }) => (
                      <FormControl fullWidth error={!!errors.copilotType}>
                        <InputLabel>{t('flightLog.duty', 'Duty')}</InputLabel>
                        <Select
                          {...field}
                          label={t('flightLog.duty', 'Duty')}
                          renderValue={(value) => value}
                        >
                          {CREW_TYPES.map((type) => (
                            <MenuItem key={type.value} value={type.value}>
                              {type.value} - {type.label}
                            </MenuItem>
                          ))}
                        </Select>
                        {errors.copilotType && (
                          <FormHelperText>
                            {errors.copilotType.message?.toString()}
                          </FormHelperText>
                        )}
                      </FormControl>
                    )}
                  />
                </Grid>
              </Grid>
            </Grid>

            {/* Additional crew members */}
            {Array.from({ length: additionalCrewCount }).map((_, index) => (
              <Grid item xs={12} key={`crew-${index}`}>
                <Grid container spacing={2}>
                  <Grid item xs={7}>
                    <TextField
                      fullWidth
                      label={t(
                        'flightLog.additionalCrew',
                        `Additional Crew ${index + 1}`
                      )}
                      {...register(`additionalCrew${index}`)}
                      error={!!errors[`additionalCrew${index}`]}
                      helperText={errors[
                        `additionalCrew${index}`
                      ]?.message?.toString()}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position='start'>
                            <PicButton position={`additional${index}`} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <Controller
                      name={`additionalCrewType${index}`}
                      control={control}
                      defaultValue='OBS'
                      render={({ field }) => (
                        <FormControl
                          fullWidth
                          error={!!errors[`additionalCrewType${index}`]}
                        >
                          <InputLabel>{t('flightLog.duty', 'Duty')}</InputLabel>
                          <Select
                            {...field}
                            label={t('flightLog.duty', 'Duty')}
                            renderValue={(value) => value}
                          >
                            {CREW_TYPES.map((type) => (
                              <MenuItem key={type.value} value={type.value}>
                                {type.value} - {type.label}
                              </MenuItem>
                            ))}
                          </Select>
                          {errors[`additionalCrewType${index}`] && (
                            <FormHelperText>
                              {errors[
                                `additionalCrewType${index}`
                              ].message?.toString()}
                            </FormHelperText>
                          )}
                        </FormControl>
                      )}
                    />
                  </Grid>
                  <Grid
                    item
                    xs={1}
                    sx={{ display: 'flex', alignItems: 'center' }}
                  >
                    <Button
                      color='error'
                      onClick={() => handleRemoveCrew(index)}
                      sx={{ minWidth: 'auto', p: 1 }}
                    >
                      <Icon icon='mdi:close' />
                    </Button>
                  </Grid>
                </Grid>
              </Grid>
            ))}

            {/* Add crew button */}
            {additionalCrewCount < 2 && (
              <Grid item xs={12}>
                <Box>
                  <Button
                    variant='outlined'
                    startIcon={<Icon icon='mdi:account-plus' />}
                    onClick={handleAddCrew}
                    fullWidth
                    sx={{ mt: 1 }}
                  >
                    {t('flightLog.addCrew', 'Add Crew Member')}
                  </Button>
                </Box>
              </Grid>
            )}
          </>
        )}
      </Grid>
    </>
  )
}

export default FlightCrew
