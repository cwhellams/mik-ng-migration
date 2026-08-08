import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMassBalanceState } from './useMassBalanceState'

const STORAGE_KEY = 'massBalanceState'

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')

afterEach(() => vi.restoreAllMocks())

describe('useMassBalanceState defaults', () => {
  it('starts from the built-in defaults with nothing saved', () => {
    const { result } = renderHook(() => useMassBalanceState())

    expect(result.current.state).toEqual({
      selectedAircraftId: 'oh-ihq',
      pilot: { weight: 80, arm: 82 },
      copilot: { weight: 0, arm: 82 },
      rearSeats: { weight: 0, arm: 120 },
      baggage: { weight: 0, arm: 140 },
      fuel: { litres: 0, weight: 0, arm: 105 },
      taxiFuel: 5,
      fuelFlow: 25,
      flightTime: 60,
    })
  })

  it('does not write to storage until something changes', () => {
    renderHook(() => useMassBalanceState())

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('useMassBalanceState persistence', () => {
  it('restores a previously saved loading', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ selectedAircraftId: 'oh-stl', pilot: { weight: 95, arm: 82 } }),
    )

    const { result } = renderHook(() => useMassBalanceState())

    expect(result.current.state.selectedAircraftId).toBe('oh-stl')
    expect(result.current.state.pilot.weight).toBe(95)
  })

  it('fills in fields a saved loading is missing, so an older shape still loads', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pilot: { weight: 95, arm: 82 } }))

    const { result } = renderHook(() => useMassBalanceState())

    expect(result.current.state.pilot.weight).toBe(95)
    expect(result.current.state.baggage).toEqual({ weight: 0, arm: 140 })
    expect(result.current.state.fuelFlow).toBe(25)
  })

  it('fills in missing keys inside a nested station', () => {
    // A saved pilot with no arm must not end up with arm: undefined.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pilot: { weight: 95 } }))

    const { result } = renderHook(() => useMassBalanceState())

    expect(result.current.state.pilot).toEqual({ weight: 95, arm: 82 })
  })

  it('falls back to the defaults when the saved value is corrupt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, 'not json')

    const { result } = renderHook(() => useMassBalanceState())

    expect(result.current.state.pilot.weight).toBe(80)
    expect(warn).toHaveBeenCalled()
  })

  it('persists every change so the loading survives a reload', () => {
    const { result } = renderHook(() => useMassBalanceState())

    act(() => result.current.updatePilot({ weight: 95, arm: 82 }))

    expect(stored().pilot).toEqual({ weight: 95, arm: 82 })

    // A fresh mount picks it up.
    const remounted = renderHook(() => useMassBalanceState())
    expect(remounted.result.current.state.pilot.weight).toBe(95)
  })

  it('keeps working when storage refuses the write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const { result } = renderHook(() => useMassBalanceState())
    act(() => result.current.updatePilot({ weight: 95, arm: 82 }))

    // The in-memory state still updates — only persistence is lost.
    expect(result.current.state.pilot.weight).toBe(95)
    expect(warn).toHaveBeenCalled()
  })
})

describe('useMassBalanceState updates', () => {
  it.each([
    ['updatePilot', 'pilot', { weight: 95, arm: 82 }],
    ['updateCopilot', 'copilot', { weight: 70, arm: 82 }],
    ['updateRearSeat', 'rearSeats', { weight: 60, arm: 120 }],
    ['updateBaggage', 'baggage', { weight: 12, arm: 140 }],
    ['updateFuel', 'fuel', { litres: 100, weight: 84, arm: 105 }],
  ] as const)('%s writes to state.%s', (method, field, value) => {
    const { result } = renderHook(() => useMassBalanceState())

    act(() => (result.current[method] as (v: typeof value) => void)(value))

    expect(result.current.state[field]).toEqual(value)
  })

  it.each([
    ['updateTaxiFuel', 'taxiFuel', 8],
    ['updateFuelFlow', 'fuelFlow', 23.2],
    ['updateFlightTime', 'flightTime', 120],
  ] as const)('%s writes to state.%s', (method, field, value) => {
    const { result } = renderHook(() => useMassBalanceState())

    act(() => (result.current[method] as (v: number) => void)(value))

    expect(result.current.state[field]).toBe(value)
  })

  it('switches aircraft without losing the rest of the loading', () => {
    const { result } = renderHook(() => useMassBalanceState())

    act(() => result.current.updateBaggage({ weight: 12, arm: 140 }))
    act(() => result.current.updateSelectedAircraftId('oh-stl'))

    expect(result.current.state.selectedAircraftId).toBe('oh-stl')
    expect(result.current.state.baggage.weight).toBe(12)
  })

  it('keeps its updater identities stable across renders', () => {
    // The updaters are passed into memoised inputs, so a new identity every
    // render would re-render the whole mass & balance form on each keystroke.
    const { result, rerender } = renderHook(() => useMassBalanceState())
    const first = result.current.updatePilot

    rerender()

    expect(result.current.updatePilot).toBe(first)
  })
})
