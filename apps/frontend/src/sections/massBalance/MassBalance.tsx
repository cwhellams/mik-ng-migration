import React, { useState, useEffect } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Card,
  CardContent,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import WarningIcon from '@mui/icons-material/Warning'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useTranslation } from 'react-i18next'
import { loadAircraftSpecs, AircraftSpecs, CONVERSIONS } from './components/specsParser'
import WeightBalanceEnvelope from './components/WeightBalanceEnvelope'
import WeightSlider from './components/WeightSlider'
import CollapsibleSection from './components/CollapsibleSection'
import { useMassBalanceState } from '../../hooks/useMassBalanceState'
import { Title } from '@mik/ui/components/Title'
import {
  calculateMassBalance,
  getWeightBalanceStatus,
  type CalculationResults,
  type WeightBalanceStatus,
} from './lib/massBalanceCalculations'

const STATUS_DISPLAY: Record<WeightBalanceStatus, { messageKey: string; color: string }> = {
  unknown: { messageKey: 'massBalance.status.calculating', color: 'grey.500' },
  over: { messageKey: 'massBalance.status.overLimits', color: 'error.main' },
  near: { messageKey: 'massBalance.status.nearLimits', color: 'warning.main' },
  within: { messageKey: 'massBalance.status.withinLimits', color: 'success.main' },
}

/**
 * Mass & Balance Calculator Component
 *
 * Interactive weight and balance calculator for aircraft flight planning.
 * Features:
 * - Aircraft selection (OH-IHQ Diamond DV20, OH-STL Diamond DA40NG)
 * - Real-time weight and CG calculations
 * - Flight envelope validation
 * - Fuel planning with US gallons conversion
 * - Color-coded status indicators
 * - Multilingual support (EN/FI/SV)
 */
const MassBalance: React.FC = () => {
  const { t } = useTranslation()

  // #382: the read-only blocks wrapped around the inputs are several screens
  // tall on a phone, which put the first input field below the fold. Under
  // `sm` they start folded shut; from `sm` up the page is as it was.
  const muiTheme = useTheme()
  const isSmUp = useMediaQuery(muiTheme.breakpoints.up('sm'))

  // Use custom hook for persistent state management
  const {
    state,
    updatePilot,
    updateCopilot,
    updateRearSeat,
    updateBaggage,
    updateFuel,
    updateTaxiFuel,
    updateFuelFlow,
    updateFlightTime,
    updateSelectedAircraftId,
  } = useMassBalanceState()

  // Extract state values for easier access
  const {
    selectedAircraftId,
    pilot,
    copilot,
    rearSeats,
    baggage,
    fuel,
    taxiFuel,
    fuelFlow,
    flightTime,
  } = state

  // Aircraft loading and error states
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftSpecs | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [results, setResults] = useState<CalculationResults | null>(null)

  // Load aircraft specifications and initialize/update values
  useEffect(() => {
    const loadSpecs = async () => {
      try {
        setLoadError(null)
        const specs = await loadAircraftSpecs(selectedAircraftId)
        setSelectedAircraft(specs)

        // When aircraft changes, update the moment arms but preserve user weights
        // We need to get the current state directly from localStorage to avoid dependency issues
        const currentState = (() => {
          try {
            const saved = localStorage.getItem('massBalanceState')
            return saved ? JSON.parse(saved) : null
          } catch {
            return null
          }
        })()

        // Always update moment arms from aircraft specs, preserving user weights
        // from saved state when available. This ensures correct CG on first page
        // load even when there is no saved state in localStorage.
        updatePilot({
          weight: currentState?.pilot?.weight || specs.loadPoints.pilot.defaultValue || 80,
          arm: specs.loadPoints.pilot.momentArm ?? 0,
        })

        updateCopilot({
          weight: currentState?.copilot?.weight || specs.loadPoints.copilot.defaultValue || 0,
          arm: specs.loadPoints.copilot.momentArm ?? 0,
        })

        // Handle rear seats
        if (specs.loadPoints.rearSeat) {
          updateRearSeat({
            weight: currentState?.rearSeats?.weight || specs.loadPoints.rearSeat.defaultValue || 0,
            arm: specs.loadPoints.rearSeat.momentArm ?? 0,
          })
        } else {
          // Reset rear seat weight to 0 if aircraft doesn't have rear seats
          updateRearSeat({
            weight: 0,
            arm: 0,
          })
        }

        updateBaggage({
          weight: currentState?.baggage?.weight || specs.loadPoints.baggage.defaultValue || 10,
          arm: specs.loadPoints.baggage.momentArm ?? 0,
        })

        updateFuel({
          litres: currentState?.fuel?.litres || specs.loadPoints.fuel.defaultValue || 30,
          weight: currentState?.fuel?.weight || 0,
          arm: specs.loadPoints.fuel.momentArm ?? 0,
        })

        // Update fuel parameters only if they haven't been changed from defaults
        if (!currentState?.taxiFuel || currentState.taxiFuel === 5) {
          updateTaxiFuel(specs.loadPoints.taxiFuel.defaultValue || 3)
        }
        if (!currentState?.fuelFlow || currentState.fuelFlow === 25) {
          updateFuelFlow(specs.loadPoints.fuelFlow.defaultValue || 25)
        }
        if (!currentState?.flightTime || currentState.flightTime === 60) {
          updateFlightTime(specs.loadPoints.flightTime.defaultValue || 45)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        setLoadError(
          `Failed to load specifications for ${selectedAircraftId.toUpperCase()}: ${errorMessage}`,
        )
      }
    }

    loadSpecs()
  }, [
    selectedAircraftId,
    updateBaggage,
    updateCopilot,
    updateFlightTime,
    updateFuel,
    updateFuelFlow,
    updatePilot,
    updateRearSeat,
    updateTaxiFuel,
  ])

  // Update fuel weight when litres change
  useEffect(() => {
    if (selectedAircraft) {
      const fuelWeight = fuel.litres * selectedAircraft.fuelConversion.litre2Kilo
      updateFuel({ litres: fuel.litres, arm: fuel.arm, weight: fuelWeight })
    }
  }, [fuel.litres, selectedAircraft, updateFuel, fuel.arm])

  // Recalculate weight & balance whenever any load or fuel-planning input changes
  useEffect(() => {
    if (!selectedAircraft) {
      setResults(null)
      return
    }

    setResults(
      calculateMassBalance(selectedAircraft, {
        pilot,
        copilot,
        rearSeats,
        baggage,
        fuel,
        taxiFuel,
        fuelFlow,
        flightTime,
      }),
    )
  }, [selectedAircraft, pilot, copilot, rearSeats, baggage, fuel, taxiFuel, fuelFlow, flightTime])

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select()
  }

  const handleResetFuelPlanning = () => {
    if (selectedAircraft) {
      updateTaxiFuel(selectedAircraft.loadPoints.taxiFuel.defaultValue || 3)
      updateFuelFlow(selectedAircraft.loadPoints.fuelFlow.defaultValue || 25)
      updateFlightTime(selectedAircraft.loadPoints.flightTime.defaultValue || 45)
    }
  }

  return (
    <Box sx={{ py: { xs: 2, sm: 4 } }}>
      <Title label={t('massBalance.title')} />
      <Typography
        variant='body1'
        sx={{
          color: 'text.secondary',
          mb: { xs: 2, sm: 4 },
        }}
      >
        {t('massBalance.description')}
      </Typography>
      {/* Disclaimer. The warning banner and its heading stay visible at every
          width -- only the body text folds away on a phone. */}
      <Alert
        severity='warning'
        icon={<WarningIcon fontSize='large' />}
        sx={{
          mb: { xs: 2, sm: 4 },
          fontWeight: 500,
          '& .MuiAlert-message': { width: '100%', py: 0 },
        }}
      >
        <Accordion
          key={isSmUp ? 'expanded' : 'collapsed'}
          defaultExpanded={isSmUp}
          disableGutters
          elevation={0}
          sx={{
            bgcolor: 'transparent',
            color: 'inherit',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ color: 'inherit' }} />}
            sx={{ p: 0, minHeight: 0, '& .MuiAccordionSummary-content': { my: 1 } }}
          >
            <Typography variant='subtitle1' sx={{ fontWeight: 'bold' }}>
              {t('massBalance.disclaimer.title')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0, pb: 1 }}>
            <Typography variant='body2'>{t('massBalance.disclaimer.text')}</Typography>
          </AccordionDetails>
        </Accordion>
      </Alert>
      {/* Aircraft Selection. Never collapsed -- the selector is itself an input
          -- just trimmed of its heading and data-origin chip on a phone. */}
      <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 3 } }}>
        <Typography variant='h6' gutterBottom sx={{ display: { xs: 'none', sm: 'block' } }}>
          {t('massBalance.aircraftSelection')}
        </Typography>
        <FormControl fullWidth sx={{ mb: { xs: 0, sm: 2 } }}>
          <InputLabel>{t('massBalance.selectAircraft')}</InputLabel>
          <Select
            value={selectedAircraftId}
            label={t('massBalance.selectAircraft')}
            onChange={(e) => updateSelectedAircraftId(e.target.value)}
          >
            <MenuItem value='oh-ihq'>OH-IHQ - Diamond DV20</MenuItem>
            <MenuItem value='oh-stl'>OH-STL - Diamond DA40NG</MenuItem>
          </Select>
        </FormControl>

        {loadError && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        )}

        {selectedAircraft && (
          <Chip
            label={`${t('massBalance.dataOrigin')}: ${selectedAircraft.dataOrigin}`}
            size='small'
            variant='outlined'
            sx={{
              // Repeated as "Data Source" in Aircraft Specifications, so on a
              // phone it costs three lines above the inputs for nothing new.
              display: { xs: 'none', sm: 'inline-flex' },
              height: 'auto',
              '& .MuiChip-label': {
                display: 'block',
                whiteSpace: 'normal',
              },
            }}
          />
        )}
      </Paper>
      {/* Weight Summary Section */}
      {selectedAircraft && results && (
        <CollapsibleSection
          key={isSmUp ? 'expanded' : 'collapsed'}
          title={t('massBalance.weightSummary')}
          defaultExpanded={isSmUp}
        >
          {/* Basic Empty Weight - Full Width */}
          <Box sx={{ mb: 3 }}>
            <Card
              sx={{
                bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                borderLeft: '4px solid',
                borderColor: (theme) => (theme.palette.mode === 'dark' ? 'grey.500' : 'grey.700'),
              }}
            >
              <CardContent>
                <Typography
                  variant='subtitle2'
                  component='div'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('massBalance.basicEmptyWeight')}
                </Typography>
                <Typography variant='h5' sx={{ fontWeight: 'bold', mt: 0.5 }}>
                  {selectedAircraft.weightLimits.basicEmptyWeight} kg
                </Typography>
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  (
                  {(selectedAircraft.weightLimits.basicEmptyWeight * CONVERSIONS.KG_TO_LBS).toFixed(
                    1,
                  )}{' '}
                  lbs)
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 2.4 }}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor: 'info.light',
                  color: 'info.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    {t('massBalance.zeroFuelWeight')}
                  </Typography>
                  <Typography variant='h4'>{results.zeroFuelWeight.toFixed(1)} kg</Typography>
                  <Typography variant='body2'>
                    ({(results.zeroFuelWeight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 2.4 }}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor: 'primary.light',
                  color: 'primary.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    {t('massBalance.rampWeight')}
                  </Typography>
                  <Typography variant='h4'>{results.rampWeight.toFixed(1)} kg</Typography>
                  <Typography variant='body2'>
                    ({(results.rampWeight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 2.4 }}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor:
                    results.takeoffWeight > selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.main'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff *
                            selectedAircraft.warningThresholds.nearLimitPercent
                        ? 'warning.main'
                        : 'success.light',
                  color:
                    results.takeoffWeight > selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.contrastText'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff *
                            selectedAircraft.warningThresholds.nearLimitPercent
                        ? 'warning.contrastText'
                        : 'success.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    {t('massBalance.takeoffWeight')}
                  </Typography>
                  <Typography variant='h4'>{results.takeoffWeight.toFixed(1)} kg</Typography>
                  <Typography variant='body2'>
                    ({(results.takeoffWeight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                  </Typography>
                  <Typography variant='caption' sx={{ display: 'block', mt: 1, opacity: 0.8 }}>
                    {t('massBalance.max')}: {selectedAircraft.weightLimits.maxTakeoff} kg
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 2.4 }}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor:
                    results.landingWeight >
                    (selectedAircraft.weightLimits.maxLanding ||
                      selectedAircraft.weightLimits.maxTakeoff)
                      ? 'error.main'
                      : results.landingWeight >=
                          (selectedAircraft.weightLimits.maxLanding ||
                            selectedAircraft.weightLimits.maxTakeoff) *
                            selectedAircraft.warningThresholds.nearLimitPercent
                        ? 'warning.main'
                        : 'secondary.light',
                  color:
                    results.landingWeight >
                    (selectedAircraft.weightLimits.maxLanding ||
                      selectedAircraft.weightLimits.maxTakeoff)
                      ? 'error.contrastText'
                      : results.landingWeight >=
                          (selectedAircraft.weightLimits.maxLanding ||
                            selectedAircraft.weightLimits.maxTakeoff) *
                            selectedAircraft.warningThresholds.nearLimitPercent
                        ? 'warning.contrastText'
                        : 'secondary.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    {t('massBalance.landingWeight')}
                  </Typography>
                  <Typography variant='h4'>{results.landingWeight.toFixed(1)} kg</Typography>
                  <Typography variant='body2'>
                    ({(results.landingWeight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 2.4 }}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor:
                    results.takeoffWeight > selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.main'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff *
                            selectedAircraft.warningThresholds.nearLimitPercent
                        ? 'warning.main'
                        : 'info.light',
                  color:
                    results.takeoffWeight > selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.contrastText'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff *
                            selectedAircraft.warningThresholds.nearLimitPercent
                        ? 'warning.contrastText'
                        : 'info.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    {t('massBalance.availableWeight')}
                  </Typography>
                  <Typography variant='h4'>
                    {Math.max(
                      0,
                      selectedAircraft.weightLimits.maxTakeoff - results.takeoffWeight,
                    ).toFixed(1)}{' '}
                    kg
                  </Typography>
                  <Typography variant='body2'>
                    (
                    {Math.max(
                      0,
                      (selectedAircraft.weightLimits.maxTakeoff - results.takeoffWeight) *
                        CONVERSIONS.KG_TO_LBS,
                    ).toFixed(1)}{' '}
                    lbs)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Flight Planning Summary */}
          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant='h6' component='div'>
                    {t('massBalance.totalFuelBurn')}
                  </Typography>
                  <Typography variant='h4'>{results.totalFuelBurnLitres.toFixed(1)} L</Typography>
                  <Typography variant='body2'>
                    ({(results.totalFuelBurnLitres * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG) -{' '}
                    {results.totalFuelBurnWeight.toFixed(1)} kg
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant='h6' component='div'>
                    {t('massBalance.endurance')}
                  </Typography>
                  <Typography variant='h4'>{results?.endurance.toFixed(1) || '0.0'} h</Typography>
                  <Typography variant='body2'>
                    ({((results?.endurance || 0) * 60).toFixed(0)} min)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CollapsibleSection>
      )}
      <Grid container spacing={3}>
        {/* Loading Section */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant='h6' gutterBottom>
              {t('massBalance.loading')}
            </Typography>

            {/* Pilot */}
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ pb: '16px !important' }}>
                <Typography variant='subtitle2' sx={{ mb: 1 }}>
                  {t('massBalance.pilot')}
                </Typography>
                <Grid container spacing={2} sx={{ mb: 1 }}>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label={t('massBalance.weight')}
                      type='number'
                      value={pilot.weight === 0 ? '0' : pilot.weight}
                      onChange={(e) =>
                        updatePilot({
                          ...pilot,
                          weight: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      onFocus={handleInputFocus}
                      size='small'
                      slotProps={{
                        input: { endAdornment: 'kg' },
                        htmlInput: { min: 0 },
                      }}
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxWeight = selectedAircraft.loadPoints.pilot.maxValue!
                      return (
                        <>
                          <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                            {t('massBalance.currentLoad')}: {pilot.weight} kg /{' '}
                            {t('massBalance.maxLoad')}: {maxWeight} kg (
                            {(pilot.weight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                          </Typography>
                          <WeightSlider
                            value={pilot.weight}
                            onChange={(newValue) =>
                              updatePilot({
                                ...pilot,
                                weight: newValue,
                              })
                            }
                            min={selectedAircraft.loadPoints.pilot.minValue!}
                            max={maxWeight}
                            step={selectedAircraft.loadPoints.pilot.step || 1}
                            isOverLimit={pilot.weight > maxWeight}
                          />
                        </>
                      )
                    })()}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Co-Pilot */}
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ pb: '16px !important' }}>
                <Typography variant='subtitle2' sx={{ mb: 1 }}>
                  {t('massBalance.copilot')}
                </Typography>
                <Grid container spacing={2} sx={{ mb: 1 }}>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label={t('massBalance.weight')}
                      type='number'
                      value={copilot.weight === 0 ? '0' : copilot.weight}
                      onChange={(e) =>
                        updateCopilot({
                          ...copilot,
                          weight: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      onFocus={handleInputFocus}
                      size='small'
                      slotProps={{
                        input: { endAdornment: 'kg' },
                        htmlInput: { min: 0 },
                      }}
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxWeight = selectedAircraft.loadPoints.copilot.maxValue!
                      return (
                        <>
                          <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                            {t('massBalance.currentLoad')}: {copilot.weight} kg /{' '}
                            {t('massBalance.maxLoad')}: {maxWeight} kg (
                            {(copilot.weight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                          </Typography>
                          <WeightSlider
                            value={copilot.weight}
                            onChange={(newValue) =>
                              updateCopilot({
                                ...copilot,
                                weight: newValue,
                              })
                            }
                            min={selectedAircraft.loadPoints.copilot.minValue!}
                            max={maxWeight}
                            step={selectedAircraft.loadPoints.copilot.step || 1}
                            isOverLimit={copilot.weight > maxWeight}
                          />
                        </>
                      )
                    })()}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Rear Seats - Only show if aircraft has them */}
            {selectedAircraft?.seatingConfiguration.hasRearSeats && (
              <>
                {/* Single rear seat for OH-STL */}
                {selectedAircraft.loadPoints.rearSeat && (
                  <Card sx={{ mb: 2 }}>
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Typography variant='subtitle2' sx={{ mb: 1 }}>
                        {t('massBalance.rearSeats')}
                      </Typography>
                      <Grid container spacing={2} sx={{ mb: 1 }}>
                        <Grid size={{ xs: 12 }}>
                          <TextField
                            fullWidth
                            label={t('massBalance.weight')}
                            type='number'
                            value={rearSeats.weight === 0 ? '0' : rearSeats.weight}
                            onChange={(e) =>
                              updateRearSeat({
                                ...rearSeats,
                                weight: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            onFocus={handleInputFocus}
                            size='small'
                            slotProps={{
                              input: { endAdornment: 'kg' },
                              htmlInput: { min: 0 },
                            }}
                          />
                        </Grid>
                      </Grid>
                      <Box>
                        {(() => {
                          const maxWeight = selectedAircraft.loadPoints.rearSeat.maxValue!
                          return (
                            <>
                              <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                                {t('massBalance.currentLoad')}: {rearSeats.weight} kg /{' '}
                                {t('massBalance.maxLoad')}: {maxWeight} kg (
                                {(rearSeats.weight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                              </Typography>
                              <WeightSlider
                                value={rearSeats.weight}
                                onChange={(newValue) =>
                                  updateRearSeat({
                                    ...rearSeats,
                                    weight: newValue,
                                  })
                                }
                                min={selectedAircraft.loadPoints.rearSeat.minValue!}
                                max={maxWeight}
                                step={selectedAircraft.loadPoints.rearSeat.step || 1}
                                isOverLimit={rearSeats.weight > maxWeight}
                              />
                            </>
                          )
                        })()}
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Baggage */}
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ pb: '16px !important' }}>
                <Typography variant='subtitle2' sx={{ mb: 1 }}>
                  {t('massBalance.baggage')}
                </Typography>
                <Grid container spacing={2} sx={{ mb: 1 }}>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label={t('massBalance.weight')}
                      type='number'
                      value={baggage.weight === 0 ? '0' : baggage.weight}
                      onChange={(e) =>
                        updateBaggage({
                          ...baggage,
                          weight: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      onFocus={handleInputFocus}
                      size='small'
                      slotProps={{
                        input: { endAdornment: 'kg' },
                        htmlInput: { min: 0 },
                      }}
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxWeight = selectedAircraft.loadPoints.baggage.maxValue!
                      return (
                        <>
                          <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                            {t('massBalance.currentLoad')}: {baggage.weight} kg /{' '}
                            {t('massBalance.maxLoad')}: {maxWeight} kg (
                            {(baggage.weight * CONVERSIONS.KG_TO_LBS).toFixed(1)} lbs)
                          </Typography>
                          <WeightSlider
                            value={baggage.weight}
                            onChange={(newValue) =>
                              updateBaggage({
                                ...baggage,
                                weight: newValue,
                              })
                            }
                            min={selectedAircraft.loadPoints.baggage.minValue!}
                            max={maxWeight}
                            step={selectedAircraft.loadPoints.baggage.step || 1}
                            isOverLimit={baggage.weight > maxWeight}
                          />
                        </>
                      )
                    })()}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Fuel */}
            <Card sx={{ boxShadow: 0 }}>
              <CardContent sx={{ pb: '16px !important' }}>
                <Typography variant='subtitle2' sx={{ mb: 1 }}>
                  {t('massBalance.fuel')}
                </Typography>
                <Grid container spacing={2} sx={{ mb: 1 }}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      fullWidth
                      label={`${t('massBalance.fuelVolume')} (L)`}
                      type='number'
                      value={fuel.litres === 0 ? '0' : fuel.litres}
                      onChange={(e) =>
                        updateFuel({
                          ...fuel,
                          litres: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      onFocus={handleInputFocus}
                      size='small'
                      slotProps={{
                        input: { endAdornment: 'L' },
                        htmlInput: { min: 0 },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      fullWidth
                      label={t('massBalance.fuelWeight')}
                      type='number'
                      value={fuel.weight.toFixed(1)}
                      size='small'
                      disabled
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'background.paper',
                        },
                      }}
                      slotProps={{
                        input: { endAdornment: 'kg', readOnly: true },
                      }}
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxLitres = selectedAircraft.loadPoints.fuel.maxValue!
                      return (
                        <>
                          <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                            {t('massBalance.currentLoad')}: {fuel.litres} L /{' '}
                            {t('massBalance.maxLoad')}: {maxLitres} L (
                            {(fuel.litres * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG)
                          </Typography>
                          <WeightSlider
                            value={fuel.litres}
                            onChange={(newValue) =>
                              updateFuel({
                                ...fuel,
                                litres: newValue,
                              })
                            }
                            min={selectedAircraft.loadPoints.fuel.minValue!}
                            max={maxLitres}
                            step={selectedAircraft.loadPoints.fuel.step || 1}
                            isOverLimit={fuel.litres > maxLitres}
                          />
                        </>
                      )
                    })()}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Paper>
        </Grid>

        {/* Fuel Planning Panel */}
        <Grid size={{ xs: 12, lg: 3 }}>
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <Typography variant='h6'>{t('massBalance.fuelPlanning')}</Typography>
              <Button
                size='small'
                variant='outlined'
                onClick={handleResetFuelPlanning}
                sx={{
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {t('massBalance.resetToDefaults')}
              </Button>
            </Box>

            {/* Taxi Fuel */}
            <Box sx={{ mb: 2 }}>
              <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                {t('massBalance.taxiFuel')}: {taxiFuel} L (
                {(taxiFuel * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG)
              </Typography>
              <WeightSlider
                value={taxiFuel}
                onChange={(newValue) => updateTaxiFuel(newValue)}
                min={selectedAircraft?.loadPoints.taxiFuel.minValue || 0}
                max={selectedAircraft?.loadPoints.taxiFuel.maxValue || 20}
                step={selectedAircraft?.loadPoints.taxiFuel.step || 0.5}
              />
            </Box>

            {/* Fuel Flow */}
            <Box sx={{ mb: 2 }}>
              <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                {t('massBalance.fuelFlow')}: {fuelFlow} L/h (
                {(fuelFlow * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG/h)
              </Typography>
              <WeightSlider
                value={fuelFlow}
                onChange={(newValue) => updateFuelFlow(newValue)}
                min={selectedAircraft?.loadPoints.fuelFlow.minValue || 15}
                max={selectedAircraft?.loadPoints.fuelFlow.maxValue || 50}
                step={selectedAircraft?.loadPoints.fuelFlow.step || 1}
              />
            </Box>

            {/* Flight Time */}
            <Box sx={{ mb: 2 }}>
              <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                {t('massBalance.plannedFlightTime')}: {(flightTime / 60).toFixed(1)}{' '}
                {t('massBalance.hours')} ({flightTime} mins)
              </Typography>
              <WeightSlider
                value={flightTime}
                onChange={(newValue) => updateFlightTime(newValue)}
                min={selectedAircraft?.loadPoints.flightTime.minValue || 0}
                max={selectedAircraft?.loadPoints.flightTime.maxValue || 480}
                step={selectedAircraft?.loadPoints.flightTime.step || 5}
              />
            </Box>

            {/* Consumed Fuel */}
            <Box sx={{ mb: 2 }}>
              <Typography variant='caption' sx={{ mb: 1, display: 'block', fontWeight: 'bold' }}>
                {t('massBalance.consumedFuel')}: {(results?.totalFuelBurnLitres ?? 0).toFixed(1)} L
                ({((results?.totalFuelBurnLitres ?? 0) * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG) -{' '}
                {(results?.totalFuelBurnWeight ?? 0).toFixed(1)} kg
              </Typography>
              <Typography
                variant='caption'
                sx={{
                  display: 'block',
                  color: 'text.secondary',
                  fontStyle: 'italic',
                }}
              >
                {t('massBalance.taxi')}: {taxiFuel} L + {t('massBalance.flight')}:{' '}
                {(results?.flightFuelLitres ?? 0).toFixed(1)} L
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Visual W&B Status Indicator */}
        <Grid size={{ xs: 12, lg: 3 }}>
          <Paper elevation={2} sx={{ p: 3, mb: 3, height: 'fit-content' }}>
            <Typography variant='h6' gutterBottom>
              {t('massBalance.weightBalanceStatus')}
            </Typography>
            {(() => {
              const status = STATUS_DISPLAY[getWeightBalanceStatus(results, selectedAircraft)]
              return (
                <Card
                  sx={{
                    bgcolor: status.color,
                    color: status.color === 'grey.500' ? 'text.primary' : 'white',
                    textAlign: 'center',
                    py: 3,
                  }}
                >
                  <CardContent>
                    <Typography variant='h5' component='div' sx={{ fontWeight: 'bold' }}>
                      {t(status.messageKey)}
                    </Typography>
                    {results && selectedAircraft && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant='body2' sx={{ opacity: 0.9 }}>
                          {t('massBalance.takeoff')}: {results.takeoffWeight.toFixed(1)} /{' '}
                          {selectedAircraft.weightLimits.maxTakeoff} kg
                        </Typography>
                        <Typography variant='body2' sx={{ opacity: 0.9 }}>
                          {t('massBalance.landing')}: {results.landingWeight.toFixed(1)} /{' '}
                          {selectedAircraft.weightLimits.maxLanding ||
                            selectedAircraft.weightLimits.maxTakeoff}{' '}
                          kg
                        </Typography>
                        <Typography variant='body2' sx={{ opacity: 0.9 }}>
                          {t('massBalance.cg')}: {results.takeoffCG.toFixed(1)} cm
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )
            })()}
          </Paper>
        </Grid>
      </Grid>
      {/* Weight & Balance Envelope Chart - Full Width */}
      <Box sx={{ mt: 4 }}>
        {results && selectedAircraft && (
          <WeightBalanceEnvelope
            aircraft={selectedAircraft}
            takeoffWeight={results.takeoffWeight}
            takeoffCG={results.takeoffCG}
            landingWeight={results.landingWeight}
            landingCG={results.landingCG}
          />
        )}
      </Box>
      {/* Aircraft Base Data Grid - Moved to Bottom */}
      <Box sx={{ mt: 4 }}>
        {selectedAircraft && (
          <CollapsibleSection
            key={isSmUp ? 'expanded' : 'collapsed'}
            title={`${t('massBalance.aircraftSpecifications')} - ${selectedAircraft.registration}`}
            defaultExpanded={isSmUp}
          >
            <Typography
              variant='caption'
              sx={{
                color: 'text.secondary',
                mb: 2,
                display: 'block',
              }}
            >
              {t('massBalance.dataSource')}: {selectedAircraft.dataOrigin}
            </Typography>

            <Grid container spacing={2}>
              {/* Weight Information */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
                      {t('massBalance.weightInformation')}
                    </Typography>
                    <Box
                      sx={{
                        '& > div': {
                          display: 'flex',
                          justifyContent: 'space-between',
                          mb: 1,
                        },
                      }}
                    >
                      <div>
                        <Typography variant='body2'>
                          {t('massBalance.basicEmptyWeight')}:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.weightLimits.basicEmptyWeight} kg
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>
                          {t('massBalance.maxTakeoffWeight')}:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.weightLimits.maxTakeoff} kg
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>
                          {t('massBalance.maxLandingWeight')}:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.weightLimits.maxLanding ||
                            selectedAircraft.weightLimits.maxTakeoff}{' '}
                          kg
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>{t('massBalance.cgRange')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.cgLimits.forward} - {selectedAircraft.cgLimits.aft} cm
                        </Typography>
                      </div>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Load Point Arms */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
                      {t('massBalance.momentArmsFixed')}
                    </Typography>
                    <Box
                      sx={{
                        '& > div': {
                          display: 'flex',
                          justifyContent: 'space-between',
                          mb: 1,
                        },
                      }}
                    >
                      <div>
                        <Typography variant='body2'>
                          {t('massBalance.basicEmptyWeight')}:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.loadPoints.basicEmptyWeight.momentArm} cm
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>{t('massBalance.pilotCopilot')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.loadPoints.pilot.momentArm} cm
                        </Typography>
                      </div>
                      {selectedAircraft.loadPoints.rearSeat && (
                        <div>
                          <Typography variant='body2'>{t('massBalance.rearSeat')}:</Typography>
                          <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                            {selectedAircraft.loadPoints.rearSeat.momentArm} cm
                          </Typography>
                        </div>
                      )}
                      <div>
                        <Typography variant='body2'>{t('massBalance.fuelTank')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.loadPoints.fuel.momentArm} cm
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>{t('massBalance.baggage')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.loadPoints.baggage.momentArm} cm
                        </Typography>
                      </div>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </CollapsibleSection>
        )}
      </Box>
      {/* Conversion Factors */}
      <Box sx={{ mt: 3 }}>
        {selectedAircraft && (
          <CollapsibleSection
            key={isSmUp ? 'expanded' : 'collapsed'}
            title={t('massBalance.conversionFactors')}
            defaultExpanded={isSmUp}
          >
            <Typography
              variant='caption'
              sx={{
                color: 'text.secondary',
                mb: 2,
                display: 'block',
              }}
            >
              {t('massBalance.unitConversionFactorsDescription')}
            </Typography>

            <Grid container spacing={2}>
              {/* Standard Conversions */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
                      {t('massBalance.standardConversions')}
                    </Typography>
                    <Box
                      sx={{
                        '& > div': {
                          display: 'flex',
                          justifyContent: 'space-between',
                          mb: 1,
                        },
                      }}
                    >
                      <div>
                        <Typography variant='body2'>{t('massBalance.weightKgToLbs')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          × {CONVERSIONS.KG_TO_LBS.toFixed(5)}
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>{t('massBalance.volumeLToUsg')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          × {CONVERSIONS.LTR_TO_USG.toFixed(5)}
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>{t('massBalance.lengthMToInches')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          × {CONVERSIONS.M_TO_INCHES.toFixed(5)}
                        </Typography>
                      </div>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Aircraft-Specific Conversions */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
                      {t('massBalance.aircraftSpecificConversions')}
                    </Typography>
                    <Box
                      sx={{
                        '& > div': {
                          display: 'flex',
                          justifyContent: 'space-between',
                          mb: 1,
                        },
                      }}
                    >
                      <div>
                        <Typography variant='body2'>
                          {t('massBalance.fuelDensityLToKg')}:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          × {selectedAircraft.fuelConversion.litre2Kilo.toFixed(2)} kg/L
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>{t('massBalance.fuelType')}:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.fuelConversion.litre2Kilo === 0.72
                            ? 'AVGAS 100LL / 98E5'
                            : 'JET A-1'}{' '}
                          @ 15°C
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>
                          {t('massBalance.warningThreshold')}:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {(selectedAircraft.warningThresholds.nearLimitPercent * 100).toFixed(0)}%{' '}
                          {t('massBalance.ofMaxWeight')}
                        </Typography>
                      </div>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </CollapsibleSection>
        )}
      </Box>
    </Box>
  )
}

export default MassBalance
