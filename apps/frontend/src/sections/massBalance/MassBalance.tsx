import React, { useState, useEffect } from 'react'
import {
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
  Slider,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import {
  loadAircraftSpecs,
  AircraftSpecs,
  CONVERSIONS,
  isPointInFlightEnvelope,
} from './components/specsParser'
import WeightBalanceEnvelope from './components/WeightBalanceEnvelope'
import {
  useMassBalanceState,
  type WeightPosition,
} from '../../hooks/useMassBalanceState'
import { Title } from '../../components/Title'

interface CalculationResults {
  zeroFuelWeight: number
  zeroFuelMoment: number
  zeroFuelCG: number
  takeoffWeight: number
  takeoffMoment: number
  takeoffCG: number
  landingWeight: number
  landingMoment: number
  landingCG: number
  endurance: number
  isValid: boolean
  warnings: string[]
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
  const [selectedAircraft, setSelectedAircraft] =
    useState<AircraftSpecs | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Aggregated values for calculations
  const [frontSeats, setFrontSeats] = useState<WeightPosition>({
    weight: 0,
    arm: 0,
  })
  const [totalFuelBurn, setTotalFuelBurn] = useState<number>(0)

  const [results, setResults] = useState<CalculationResults | null>(null)

  // Function to get W&B validation status
  const getWeightBalanceStatus = () => {
    if (!results || !selectedAircraft) {
      return { status: 'unknown', message: 'Calculating...', color: 'grey.500' }
    }

    // Check if takeoff weight exceeds maximum
    if (results.takeoffWeight > selectedAircraft.weightLimits.maxTakeoff) {
      return { status: 'over', message: 'Over Limits', color: 'error.main' }
    }

    // Check if landing weight exceeds maximum
    const maxLanding =
      selectedAircraft.weightLimits.maxLanding ||
      selectedAircraft.weightLimits.maxTakeoff
    if (results.landingWeight > maxLanding) {
      return { status: 'over', message: 'Over Limits', color: 'error.main' }
    }

    // Check if CG is outside envelope
    const takeoffInEnvelope = isPointInFlightEnvelope(
      selectedAircraft,
      results.takeoffWeight,
      results.takeoffCG
    )
    const landingInEnvelope = isPointInFlightEnvelope(
      selectedAircraft,
      results.landingWeight,
      results.landingCG
    )

    if (!takeoffInEnvelope || !landingInEnvelope) {
      return {
        status: 'over',
        message: 'CG Outside Limits',
        color: 'error.main',
      }
    }

    // Check if near limits (≥95% of max weight)
    if (
      results.takeoffWeight >=
        selectedAircraft.weightLimits.maxTakeoff * 0.95 ||
      results.landingWeight >= maxLanding * 0.95
    ) {
      return { status: 'near', message: 'Near Limits', color: 'warning.main' }
    }

    // All good
    return { status: 'within', message: 'Within Limits', color: 'success.main' }
  }

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

        if (currentState) {
          // Update only the moment arms based on new aircraft specs, preserve weights
          updatePilot({
            weight:
              currentState.pilot?.weight ||
              specs.loadPoints.pilot.defaultValue ||
              80,
            arm: specs.loadPoints.pilot.momentArm,
          })

          updateCopilot({
            weight:
              currentState.copilot?.weight ||
              specs.loadPoints.copilot.defaultValue ||
              0,
            arm: specs.loadPoints.copilot.momentArm,
          })

          // Handle rear seats
          if (specs.loadPoints.rearSeat) {
            updateRearSeat({
              weight:
                currentState.rearSeats?.weight ||
                specs.loadPoints.rearSeat.defaultValue ||
                0,
              arm: specs.loadPoints.rearSeat.momentArm,
            })
          } else {
            // Reset rear seat weight to 0 if aircraft doesn't have rear seats
            updateRearSeat({
              weight: 0,
              arm: 0,
            })
          }

          updateBaggage({
            weight:
              currentState.baggage?.weight ||
              specs.loadPoints.baggage.defaultValue ||
              10,
            arm: specs.loadPoints.baggage.momentArm,
          })

          updateFuel({
            litres:
              currentState.fuel?.litres ||
              specs.loadPoints.fuel.defaultValue ||
              30,
            weight: currentState.fuel?.weight || 0,
            arm: specs.loadPoints.fuel.momentArm,
          })

          // Update fuel parameters only if they haven't been changed from defaults
          if (!currentState.taxiFuel || currentState.taxiFuel === 5) {
            updateTaxiFuel(specs.loadPoints.taxiFuel.defaultValue || 3)
          }
          if (!currentState.fuelFlow || currentState.fuelFlow === 25) {
            updateFuelFlow(specs.loadPoints.fuelFlow.defaultValue || 25)
          }
          if (!currentState.flightTime || currentState.flightTime === 60) {
            updateFlightTime(specs.loadPoints.flightTime.defaultValue || 45)
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred'
        setLoadError(
          `Failed to load specifications for ${selectedAircraftId.toUpperCase()}: ${errorMessage}`
        )
      }
    }

    loadSpecs()
  }, [selectedAircraftId, updateBaggage, updateCopilot, updateFlightTime, updateFuel, updateFuelFlow, updatePilot, updateRearSeat, updateTaxiFuel])

  // Update fuel weight when litres change
  useEffect(() => {
    if (selectedAircraft) {
      const fuelWeight =
        fuel.litres * selectedAircraft.fuelConversion.litre2Kilo
      updateFuel({ litres: fuel.litres, arm: fuel.arm, weight: fuelWeight })
    }
  }, [fuel.litres, selectedAircraft, updateFuel, fuel.arm])

  // Calculate aggregated front seats
  useEffect(() => {
    const totalWeight = pilot.weight + copilot.weight
    const totalMoment = pilot.weight * pilot.arm + copilot.weight * copilot.arm
    const avgArm = totalWeight > 0 ? totalMoment / totalWeight : pilot.arm
    setFrontSeats({ weight: totalWeight, arm: avgArm })
  }, [pilot, copilot])

  // Calculate total fuel burn
  useEffect(() => {
    const calculatedFuelBurn = taxiFuel + (flightTime / 60) * fuelFlow
    setTotalFuelBurn(calculatedFuelBurn)
  }, [taxiFuel, flightTime, fuelFlow])

  useEffect(() => {
    if (!selectedAircraft) return

    const calculateResults = () => {
      const warnings: string[] = []

      // Check individual load limits
      if (pilot.weight > selectedAircraft.loadPoints.pilot.maxValue!) {
        warnings.push(t('massBalance.warnings.loadExceedsMaximum'))
      }
      if (copilot.weight > selectedAircraft.loadPoints.copilot.maxValue!) {
        warnings.push(t('massBalance.warnings.loadExceedsMaximum'))
      }
      if (
        selectedAircraft.loadPoints.rearSeat &&
        rearSeats.weight > selectedAircraft.loadPoints.rearSeat.maxValue!
      ) {
        warnings.push(t('massBalance.warnings.loadExceedsMaximum'))
      }
      if (
        fuel.weight >
        selectedAircraft.loadPoints.fuel.maxValue! *
          selectedAircraft.fuelConversion.litre2Kilo
      ) {
        warnings.push(t('massBalance.warnings.loadExceedsMaximum'))
      }
      if (
        baggage.weight > selectedAircraft.loadPoints.baggage.maxValue!
      ) {
        warnings.push(t('massBalance.warnings.loadExceedsMaximum'))
      }

      // Calculate zero fuel weight and moment
      const zeroFuelWeight =
        selectedAircraft.weightLimits.basicEmptyWeight +
        frontSeats.weight +
        rearSeats.weight +
        baggage.weight
      const basicArm = selectedAircraft.loadPoints.basicEmptyWeight.momentArm
      const zeroFuelMoment =
        selectedAircraft.weightLimits.basicEmptyWeight * basicArm +
        frontSeats.weight * frontSeats.arm +
        rearSeats.weight * rearSeats.arm +
        baggage.weight * baggage.arm

      const zeroFuelCG =
        zeroFuelWeight > 0 ? zeroFuelMoment / zeroFuelWeight : 0

      // Calculate takeoff weight and moment (subtract taxi fuel used on ground)
      const taxiFuelWeight =
        taxiFuel * selectedAircraft.fuelConversion.litre2Kilo
      const takeoffWeight = zeroFuelWeight + fuel.weight - taxiFuelWeight
      const takeoffMoment =
        zeroFuelMoment + fuel.weight * fuel.arm - taxiFuelWeight * fuel.arm
      const takeoffCG = takeoffWeight > 0 ? takeoffMoment / takeoffWeight : 0

      // Calculate landing weight and moment
      const landingWeight =
        takeoffWeight -
        totalFuelBurn * selectedAircraft.fuelConversion.litre2Kilo
      const landingMoment =
        takeoffMoment -
        totalFuelBurn * selectedAircraft.fuelConversion.litre2Kilo * fuel.arm
      const landingCG = landingWeight > 0 ? landingMoment / landingWeight : 0

      // Calculate endurance
      const availableFuel = fuel.litres - taxiFuel
      const endurance = fuelFlow > 0 ? availableFuel / fuelFlow : 0

      // Validation checks
      let isValid = true

      if (takeoffWeight > selectedAircraft.weightLimits.maxTakeoff) {
        warnings.push(t('massBalance.warnings.takeoffWeightExceeded'))
        isValid = false
      }

      if (landingWeight > selectedAircraft.weightLimits.maxLanding) {
        warnings.push(t('massBalance.warnings.landingWeightExceeded'))
        isValid = false
      }

      // Use flight envelope validation instead of simple CG limits
      if (
        !isPointInFlightEnvelope(selectedAircraft, takeoffWeight, takeoffCG)
      ) {
        warnings.push(t('massBalance.warnings.takeoffCGOutOfLimits'))
        isValid = false
      }

      if (
        !isPointInFlightEnvelope(selectedAircraft, landingWeight, landingCG)
      ) {
        warnings.push(t('massBalance.warnings.landingCGOutOfLimits'))
        isValid = false
      }

      setResults({
        zeroFuelWeight,
        zeroFuelMoment,
        zeroFuelCG,
        takeoffWeight,
        takeoffMoment,
        takeoffCG,
        landingWeight,
        landingMoment,
        landingCG,
        endurance,
        isValid,
        warnings,
      })
    }

    calculateResults()
  }, [
    selectedAircraft,
    frontSeats,
    rearSeats,
    baggage,
    fuel,
    totalFuelBurn,
    taxiFuel,
    fuelFlow,
    flightTime,
    t,
    pilot.weight,
    copilot.weight,
    rearSeats.weight,
  ])

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select()
  }

  return (
    <Box sx={{ py: 4 }}>
      <Title label={t('massBalance.title')} />

      <Typography variant='body1' color='text.secondary' sx={{ mb: 4 }}>
        {t('massBalance.description')}
      </Typography>

      {/* Aircraft Selection */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant='h6' gutterBottom>
          {t('massBalance.aircraftSelection')}
        </Typography>
        <FormControl fullWidth sx={{ mb: 2 }}>
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
            label={`Data: ${selectedAircraft.dataOrigin}`}
            size='small'
            variant='outlined'
            sx={{
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
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant='h6' gutterBottom>
            Weight Summary
          </Typography>
          <Grid container spacing={2}>
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
                    Basic Weight
                  </Typography>
                  <Typography variant='h4'>
                    {selectedAircraft.weightLimits.basicEmptyWeight} kg
                  </Typography>
                  <Typography variant='body2'>
                    (
                    {(
                      selectedAircraft.weightLimits.basicEmptyWeight *
                      CONVERSIONS.KG_TO_LBS
                    ).toFixed(1)}{' '}
                    lbs)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
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
                    Zero Fuel Weight
                  </Typography>
                  <Typography variant='h4'>
                    {results.zeroFuelWeight.toFixed(1)} kg
                  </Typography>
                  <Typography variant='body2'>
                    (
                    {(results.zeroFuelWeight * CONVERSIONS.KG_TO_LBS).toFixed(
                      1
                    )}{' '}
                    lbs)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 2.4 }}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor:
                    results.takeoffWeight >
                    selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.main'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff * 0.95
                        ? 'warning.main'
                        : 'success.light',
                  color:
                    results.takeoffWeight >
                    selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.contrastText'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff * 0.95
                        ? 'warning.contrastText'
                        : 'success.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    Takeoff Weight
                  </Typography>
                  <Typography variant='h4'>
                    {results.takeoffWeight.toFixed(1)} kg
                  </Typography>
                  <Typography variant='body2'>
                    (
                    {(results.takeoffWeight * CONVERSIONS.KG_TO_LBS).toFixed(1)}{' '}
                    lbs)
                  </Typography>
                  <Typography
                    variant='caption'
                    sx={{ display: 'block', mt: 1, opacity: 0.8 }}
                  >
                    Max: {selectedAircraft.weightLimits.maxTakeoff} kg
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
                            0.95
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
                            0.95
                        ? 'warning.contrastText'
                        : 'secondary.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    Landing Weight
                  </Typography>
                  <Typography variant='h4'>
                    {results.landingWeight.toFixed(1)} kg
                  </Typography>
                  <Typography variant='body2'>
                    (
                    {(results.landingWeight * CONVERSIONS.KG_TO_LBS).toFixed(1)}{' '}
                    lbs)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 2.4 }}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor:
                    results.takeoffWeight >
                    selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.main'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff * 0.95
                        ? 'warning.main'
                        : 'info.light',
                  color:
                    results.takeoffWeight >
                    selectedAircraft.weightLimits.maxTakeoff
                      ? 'error.contrastText'
                      : results.takeoffWeight >=
                          selectedAircraft.weightLimits.maxTakeoff * 0.95
                        ? 'warning.contrastText'
                        : 'info.contrastText',
                }}
              >
                <CardContent>
                  <Typography variant='h6' component='div'>
                    Available Weight
                  </Typography>
                  <Typography variant='h4'>
                    {Math.max(
                      0,
                      selectedAircraft.weightLimits.maxTakeoff -
                        results.takeoffWeight
                    ).toFixed(1)}{' '}
                    kg
                  </Typography>
                  <Typography variant='body2'>
                    (
                    {Math.max(
                      0,
                      (selectedAircraft.weightLimits.maxTakeoff -
                        results.takeoffWeight) *
                        CONVERSIONS.KG_TO_LBS
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
                    Total Fuel Burn
                  </Typography>
                  <Typography variant='h4'>
                    {totalFuelBurn.toFixed(1)} L
                  </Typography>
                  <Typography variant='body2'>
                    ({(totalFuelBurn * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant='h6' component='div'>
                    Endurance
                  </Typography>
                  <Typography variant='h4'>
                    {results?.endurance.toFixed(1) || '0.0'} h
                  </Typography>
                  <Typography variant='body2'>
                    ({((results?.endurance || 0) * 60).toFixed(0)} min)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>
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
                      InputProps={{ endAdornment: 'kg' }}
                      inputProps={{ min: 0 }}
                      size='small'
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxWeight =
                        selectedAircraft.loadPoints.pilot.maxValue!
                      return (
                        <>
                          <Typography
                            variant='caption'
                            sx={{ mb: 1, display: 'block' }}
                          >
                            {t('massBalance.currentLoad')}: {pilot.weight} kg /{' '}
                            {t('massBalance.maxLoad')}: {maxWeight} kg (
                            {(pilot.weight * CONVERSIONS.KG_TO_LBS).toFixed(1)}{' '}
                            lbs)
                          </Typography>
                          <Slider
                            value={pilot.weight}
                            onChange={(_, newValue) =>
                              updatePilot({
                                ...pilot,
                                weight: newValue as number,
                              })
                            }
                            min={selectedAircraft.loadPoints.pilot.minValue!}
                            max={maxWeight}
                            step={selectedAircraft.loadPoints.pilot.step || 1}
                            valueLabelDisplay='auto'
                            sx={{
                              '& .MuiSlider-thumb': {
                                backgroundColor:
                                  pilot.weight > maxWeight
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                              '& .MuiSlider-track': {
                                backgroundColor:
                                  pilot.weight > maxWeight
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                            }}
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
                      InputProps={{ endAdornment: 'kg' }}
                      inputProps={{ min: 0 }}
                      size='small'
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxWeight =
                        selectedAircraft.loadPoints.copilot.maxValue!
                      return (
                        <>
                          <Typography
                            variant='caption'
                            sx={{ mb: 1, display: 'block' }}
                          >
                            {t('massBalance.currentLoad')}: {copilot.weight} kg
                            / {t('massBalance.maxLoad')}: {maxWeight} kg (
                            {(copilot.weight * CONVERSIONS.KG_TO_LBS).toFixed(
                              1
                            )}{' '}
                            lbs)
                          </Typography>
                          <Slider
                            value={copilot.weight}
                            onChange={(_, newValue) =>
                              updateCopilot({
                                ...copilot,
                                weight: newValue as number,
                              })
                            }
                            min={selectedAircraft.loadPoints.copilot.minValue!}
                            max={maxWeight}
                            step={selectedAircraft.loadPoints.copilot.step || 1}
                            valueLabelDisplay='auto'
                            sx={{
                              '& .MuiSlider-thumb': {
                                backgroundColor:
                                  copilot.weight > maxWeight
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                              '& .MuiSlider-track': {
                                backgroundColor:
                                  copilot.weight > maxWeight
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                            }}
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
                            value={
                              rearSeats.weight === 0 ? '0' : rearSeats.weight                              
                            }
                            onChange={(e) =>
                              updateRearSeat({
                                ...rearSeats,
                                weight: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              })
                            }
                            onFocus={handleInputFocus}
                            InputProps={{ endAdornment: 'kg' }}
                            inputProps={{ min: 0 }}
                            size='small'
                          />
                        </Grid>
                      </Grid>
                      <Box>
                        {(() => {
                          const maxWeight =
                            selectedAircraft.loadPoints.rearSeat.maxValue!
                          return (
                            <>
                              <Typography
                                variant='caption'
                                sx={{ mb: 1, display: 'block' }}
                              >
                                {t('massBalance.currentLoad')}:{' '}
                                {rearSeats.weight} kg /{' '}
                                {t('massBalance.maxLoad')}: {maxWeight} kg (
                                {(
                                  rearSeats.weight * CONVERSIONS.KG_TO_LBS
                                ).toFixed(1)}{' '}
                                lbs)
                              </Typography>
                              <Slider
                                value={rearSeats.weight}
                                onChange={(_, newValue) =>
                                  updateRearSeat({
                                    ...rearSeats,
                                    weight: newValue as number,
                                  })
                                }
                                min={
                                  selectedAircraft.loadPoints.rearSeat.minValue!
                                }
                                max={maxWeight}
                                step={
                                  selectedAircraft.loadPoints.rearSeat.step || 1
                                }
                                valueLabelDisplay='auto'
                                sx={{
                                  '& .MuiSlider-thumb': {
                                    backgroundColor:
                                      rearSeats.weight > maxWeight
                                        ? 'error.main'
                                        : 'primary.main',
                                  },
                                  '& .MuiSlider-track': {
                                    backgroundColor:
                                      rearSeats.weight > maxWeight
                                        ? 'error.main'
                                        : 'primary.main',
                                  },
                                }}
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
                      InputProps={{ endAdornment: 'kg' }}
                      inputProps={{ min: 0 }}
                      size='small'
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxWeight =
                        selectedAircraft.loadPoints.baggage.maxValue!
                      return (
                        <>
                          <Typography
                            variant='caption'
                            sx={{ mb: 1, display: 'block' }}
                          >
                            {t('massBalance.currentLoad')}: {baggage.weight} kg
                            / {t('massBalance.maxLoad')}: {maxWeight} kg (
                            {(baggage.weight * CONVERSIONS.KG_TO_LBS).toFixed(
                              1
                            )}{' '}
                            lbs)
                          </Typography>
                          <Slider
                            value={baggage.weight}
                            onChange={(_, newValue) =>
                              updateBaggage({
                                ...baggage,
                                weight: newValue as number,
                              })
                            }
                            min={selectedAircraft.loadPoints.baggage.minValue!}
                            max={maxWeight}
                            step={selectedAircraft.loadPoints.baggage.step || 1}
                            valueLabelDisplay='auto'
                            sx={{
                              '& .MuiSlider-thumb': {
                                backgroundColor:
                                  baggage.weight > maxWeight
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                              '& .MuiSlider-track': {
                                backgroundColor:
                                  baggage.weight > maxWeight
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                            }}
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
                      label='Fuel Volume (L)'
                      type='number'
                      value={fuel.litres === 0 ? '0' : fuel.litres}
                      onChange={(e) =>
                        updateFuel({
                          ...fuel,
                          litres: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      onFocus={handleInputFocus}
                      InputProps={{ endAdornment: 'L' }}
                      inputProps={{ min: 0 }}
                      size='small'
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      fullWidth
                      label='Fuel Weight'
                      type='number'
                      value={fuel.weight.toFixed(1)}
                      InputProps={{ endAdornment: 'kg', readOnly: true }}
                      size='small'
                      disabled
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'background.paper',
                        },
                      }}
                    />
                  </Grid>
                </Grid>
                {selectedAircraft && (
                  <Box>
                    {(() => {
                      const maxLitres =
                        selectedAircraft.loadPoints.fuel.maxValue!
                      return (
                        <>
                          <Typography
                            variant='caption'
                            sx={{ mb: 1, display: 'block' }}
                          >
                            Current Load: {fuel.litres} L / Max Load:{' '}
                            {maxLitres} L (
                            {(fuel.litres * CONVERSIONS.LTR_TO_USG).toFixed(1)}{' '}
                            USG)
                          </Typography>
                          <Slider
                            value={fuel.litres}
                            onChange={(_, newValue) =>
                              updateFuel({
                                ...fuel,
                                litres: newValue as number,
                              })
                            }
                            min={selectedAircraft.loadPoints.fuel.minValue!}
                            max={maxLitres}
                            step={selectedAircraft.loadPoints.fuel.step || 1}
                            valueLabelDisplay='auto'
                            sx={{
                              '& .MuiSlider-thumb': {
                                backgroundColor:
                                  fuel.litres > maxLitres
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                              '& .MuiSlider-track': {
                                backgroundColor:
                                  fuel.litres > maxLitres
                                    ? 'error.main'
                                    : 'primary.main',
                              },
                            }}
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
            <Typography variant='h6' gutterBottom>
              {t('massBalance.fuelPlanning')}
            </Typography>

            {/* Taxi Fuel */}
            <Box sx={{ mb: 2 }}>
              <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                Taxi Fuel: {taxiFuel} L (
                {(taxiFuel * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG)
              </Typography>
              <Slider
                value={taxiFuel}
                onChange={(_, newValue) => updateTaxiFuel(newValue as number)}
                min={selectedAircraft?.loadPoints.taxiFuel.minValue || 0}
                max={selectedAircraft?.loadPoints.taxiFuel.maxValue || 20}
                step={selectedAircraft?.loadPoints.taxiFuel.step || 0.5}
                valueLabelDisplay='auto'
              />
            </Box>

            {/* Fuel Flow */}
            <Box sx={{ mb: 2 }}>
              <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                Fuel Flow: {fuelFlow} L/h (
                {(fuelFlow * CONVERSIONS.LTR_TO_USG).toFixed(1)} USG/h)
              </Typography>
              <Slider
                value={fuelFlow}
                onChange={(_, newValue) => updateFuelFlow(newValue as number)}
                min={selectedAircraft?.loadPoints.fuelFlow.minValue || 15}
                max={selectedAircraft?.loadPoints.fuelFlow.maxValue || 50}
                step={selectedAircraft?.loadPoints.fuelFlow.step || 1}
                valueLabelDisplay='auto'
              />
            </Box>

            {/* Flight Time */}
            <Box sx={{ mb: 2 }}>
              <Typography variant='caption' sx={{ mb: 1, display: 'block' }}>
                Planned Flight Time: {(flightTime / 60).toFixed(1)} hours (
                {flightTime} mins)
              </Typography>
              <Slider
                value={flightTime}
                onChange={(_, newValue) => updateFlightTime(newValue as number)}
                min={selectedAircraft?.loadPoints.flightTime.minValue || 0}
                max={selectedAircraft?.loadPoints.flightTime.maxValue || 480}
                step={selectedAircraft?.loadPoints.flightTime.step || 5}
                valueLabelDisplay='auto'
              />
            </Box>
          </Paper>
        </Grid>

        {/* Visual W&B Status Indicator */}
        <Grid size={{ xs: 12, lg: 3 }}>
          <Paper elevation={2} sx={{ p: 3, mb: 3, height: 'fit-content' }}>
            <Typography variant='h6' gutterBottom>
              Weight & Balance Status
            </Typography>
            {(() => {
              const status = getWeightBalanceStatus()
              return (
                <Card
                  sx={{
                    bgcolor: status.color,
                    color:
                      status.color === 'grey.500' ? 'text.primary' : 'white',
                    textAlign: 'center',
                    py: 3,
                  }}
                >
                  <CardContent>
                    <Typography
                      variant='h5'
                      component='div'
                      sx={{ fontWeight: 'bold' }}
                    >
                      {status.message}
                    </Typography>
                    {results && selectedAircraft && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant='body2' sx={{ opacity: 0.9 }}>
                          Takeoff: {results.takeoffWeight.toFixed(1)} /{' '}
                          {selectedAircraft.weightLimits.maxTakeoff} kg
                        </Typography>
                        <Typography variant='body2' sx={{ opacity: 0.9 }}>
                          Landing: {results.landingWeight.toFixed(1)} /{' '}
                          {selectedAircraft.weightLimits.maxLanding ||
                            selectedAircraft.weightLimits.maxTakeoff}{' '}
                          kg
                        </Typography>
                        <Typography variant='body2' sx={{ opacity: 0.9 }}>
                          CG: {results.takeoffCG.toFixed(1)} cm
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
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant='h6' gutterBottom>
              Aircraft Specifications - {selectedAircraft.registration}
            </Typography>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ mb: 2, display: 'block' }}
            >
              Data Source: {selectedAircraft.dataOrigin}
            </Typography>

            <Grid container spacing={2}>
              {/* Weight Information */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography
                      variant='subtitle1'
                      gutterBottom
                      sx={{ fontWeight: 'bold' }}
                    >
                      Weight Information
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
                          Basic Empty Weight:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.weightLimits.basicEmptyWeight} kg
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>
                          Max Takeoff Weight:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.weightLimits.maxTakeoff} kg
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>
                          Max Landing Weight:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.weightLimits.maxLanding ||
                            selectedAircraft.weightLimits.maxTakeoff}{' '}
                          kg
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>CG Range:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.cgLimits.forward} -{' '}
                          {selectedAircraft.cgLimits.aft} cm
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
                    <Typography
                      variant='subtitle1'
                      gutterBottom
                      sx={{ fontWeight: 'bold' }}
                    >
                      Moment Arms (Fixed)
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
                          Basic Empty Weight:
                        </Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {
                            selectedAircraft.loadPoints.basicEmptyWeight
                              .momentArm
                          }{' '}
                          cm
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>Pilot/Co-pilot:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.loadPoints.pilot.momentArm} cm
                        </Typography>
                      </div>
                      {selectedAircraft.loadPoints.rearSeat && (
                        <div>
                          <Typography variant='body2'>Rear Seat:</Typography>
                          <Typography
                            variant='body2'
                            sx={{ fontWeight: 'bold' }}
                          >
                            {selectedAircraft.loadPoints.rearSeat.momentArm} cm
                          </Typography>
                        </div>
                      )}
                      <div>
                        <Typography variant='body2'>Fuel Tank:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.loadPoints.fuel.momentArm} cm
                        </Typography>
                      </div>
                      <div>
                        <Typography variant='body2'>Baggage:</Typography>
                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>
                          {selectedAircraft.loadPoints.baggage.momentArm} cm
                        </Typography>
                      </div>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        )}
      </Box>
    </Box>
  )
}

export default MassBalance
