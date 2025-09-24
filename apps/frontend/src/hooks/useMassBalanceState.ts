import { useState, useCallback } from 'react'

interface WeightPosition {
  weight: number
  arm: number
}

interface FuelState {
  litres: number
  weight: number
  arm: number
}

export type { WeightPosition, FuelState }

export interface MassBalanceState {
  selectedAircraftId: string
  pilot: WeightPosition
  copilot: WeightPosition
  rearLeft: WeightPosition
  rearRight: WeightPosition
  baggage: WeightPosition
  fuel: FuelState
  taxiFuel: number
  fuelFlow: number
  flightTime: number
}

const STORAGE_KEY = 'massBalanceState'

const getDefaultState = (): MassBalanceState => ({
  selectedAircraftId: 'oh-ihq',
  pilot: { weight: 80, arm: 82 },
  copilot: { weight: 0, arm: 82 },
  rearLeft: { weight: 0, arm: 120 },
  rearRight: { weight: 0, arm: 120 },
  baggage: { weight: 0, arm: 140 },
  fuel: { litres: 0, weight: 0, arm: 105 },
  taxiFuel: 5,
  fuelFlow: 25,
  flightTime: 60,
})

export const useMassBalanceState = () => {
  const [state, setState] = useState<MassBalanceState>(() => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY)
      if (savedState) {
        const parsed = JSON.parse(savedState) as MassBalanceState
        // Validate the parsed state has all required fields
        const defaultState = getDefaultState()
        return {
          ...defaultState,
          ...parsed,
          // Ensure nested objects are properly merged
          pilot: { ...defaultState.pilot, ...parsed.pilot },
          copilot: { ...defaultState.copilot, ...parsed.copilot },
          rearLeft: { ...defaultState.rearLeft, ...parsed.rearLeft },
          rearRight: { ...defaultState.rearRight, ...parsed.rearRight },
          baggage: { ...defaultState.baggage, ...parsed.baggage },
          fuel: { ...defaultState.fuel, ...parsed.fuel },
        }
      }
    } catch (error) {
      console.warn('Failed to load saved mass balance state:', error)
    }
    return getDefaultState()
  })

  const saveState = useCallback((newState: Partial<MassBalanceState>) => {
    setState((prevState) => {
      const updatedState = { ...prevState, ...newState }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedState))
      } catch (error) {
        console.warn('Failed to save mass balance state:', error)
      }
      return updatedState
    })
  }, [])

  const updatePilot = useCallback(
    (pilot: WeightPosition) => {
      saveState({ pilot })
    },
    [saveState]
  )

  const updateCopilot = useCallback(
    (copilot: WeightPosition) => {
      saveState({ copilot })
    },
    [saveState]
  )

  const updateRearLeft = useCallback(
    (rearLeft: WeightPosition) => {
      saveState({ rearLeft })
    },
    [saveState]
  )

  const updateRearRight = useCallback(
    (rearRight: WeightPosition) => {
      saveState({ rearRight })
    },
    [saveState]
  )

  const updateBaggage = useCallback(
    (baggage: WeightPosition) => {
      saveState({ baggage })
    },
    [saveState]
  )

  const updateFuel = useCallback(
    (fuel: FuelState) => {
      saveState({ fuel })
    },
    [saveState]
  )

  const updateTaxiFuel = useCallback(
    (taxiFuel: number) => {
      saveState({ taxiFuel })
    },
    [saveState]
  )

  const updateFuelFlow = useCallback(
    (fuelFlow: number) => {
      saveState({ fuelFlow })
    },
    [saveState]
  )

  const updateFlightTime = useCallback(
    (flightTime: number) => {
      saveState({ flightTime })
    },
    [saveState]
  )

  const updateSelectedAircraftId = useCallback(
    (selectedAircraftId: string) => {
      saveState({ selectedAircraftId })
    },
    [saveState]
  )

  return {
    state,
    updatePilot,
    updateCopilot,
    updateRearLeft,
    updateRearRight,
    updateBaggage,
    updateFuel,
    updateTaxiFuel,
    updateFuelFlow,
    updateFlightTime,
    updateSelectedAircraftId,
  }
}
