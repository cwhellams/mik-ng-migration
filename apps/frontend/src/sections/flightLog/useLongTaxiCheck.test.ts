import type { FlightLogUpsertRequest } from '@mik/contracts/flight-log'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useLongTaxiCheck } from './useLongTaxiCheck'

const values = (overrides: Partial<FlightLogUpsertRequest> = {}) =>
  ({
    offBlockTimeEpoch: '1000',
    takeoffTimeEpoch: '1600', // 10 min taxi-out
    landingTimeEpoch: '5000',
    onBlockTimeEpoch: '5300', // 5 min taxi-in
    ...overrides,
  }) as FlightLogUpsertRequest

describe('useLongTaxiCheck', () => {
  it('submits immediately when neither taxi leg is long', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    act(() => result.current.withLongTaxiCheck(values(), submit))

    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.longTaxiDialogProps.open).toBe(false)
  })

  it('withholds submission when taxi-out exceeds 30 minutes', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    // 65 minutes taxi-out
    act(() =>
      result.current.withLongTaxiCheck(
        values({ offBlockTimeEpoch: '1000', takeoffTimeEpoch: String(1000 + 65 * 60) }),
        submit,
      ),
    )

    expect(submit).not.toHaveBeenCalled()
    expect(result.current.longTaxiDialogProps.open).toBe(true)
    expect(result.current.longTaxiDialogProps.longLegs).toEqual([{ leg: 'out', minutes: 65 }])
  })

  it('withholds submission when taxi-in exceeds 30 minutes', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    // 31 minutes taxi-in -- the exact scenario from issue #1223
    act(() =>
      result.current.withLongTaxiCheck(
        values({ landingTimeEpoch: '5000', onBlockTimeEpoch: String(5000 + 31 * 60) }),
        submit,
      ),
    )

    expect(submit).not.toHaveBeenCalled()
    expect(result.current.longTaxiDialogProps.longLegs).toEqual([{ leg: 'in', minutes: 31 }])
  })

  it('reports both legs when both are long', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    act(() =>
      result.current.withLongTaxiCheck(
        values({
          offBlockTimeEpoch: '1000',
          takeoffTimeEpoch: String(1000 + 65 * 60),
          landingTimeEpoch: '5000',
          onBlockTimeEpoch: String(5000 + 31 * 60),
        }),
        submit,
      ),
    )

    expect(result.current.longTaxiDialogProps.longLegs).toEqual([
      { leg: 'out', minutes: 65 },
      { leg: 'in', minutes: 31 },
    ])
  })

  it('reports both legs at 50 minutes each -- one threshold, not 60 out / 30 in', () => {
    // The exact scenario from #1250. Under the old inherited 60/30 split the
    // 50-minute taxi-out was silently under its bar and only the taxi-in warned,
    // so the pilot was asked about one of two identical entries.
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    act(() =>
      result.current.withLongTaxiCheck(
        values({
          offBlockTimeEpoch: '1000',
          takeoffTimeEpoch: String(1000 + 50 * 60),
          landingTimeEpoch: '5000',
          onBlockTimeEpoch: String(5000 + 50 * 60),
        }),
        submit,
      ),
    )

    expect(submit).not.toHaveBeenCalled()
    expect(result.current.longTaxiDialogProps.longLegs).toEqual([
      { leg: 'out', minutes: 50 },
      { leg: 'in', minutes: 50 },
    ])
  })

  it('does not warn at exactly the threshold, only past it -- on either leg', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    act(() =>
      result.current.withLongTaxiCheck(
        values({
          offBlockTimeEpoch: '1000',
          takeoffTimeEpoch: String(1000 + 30 * 60),
          landingTimeEpoch: '5000',
          onBlockTimeEpoch: String(5000 + 30 * 60),
        }),
        submit,
      ),
    )

    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.longTaxiDialogProps.open).toBe(false)
  })

  it('submits and closes the dialog once confirmed', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    act(() =>
      result.current.withLongTaxiCheck(
        values({ offBlockTimeEpoch: '1000', takeoffTimeEpoch: String(1000 + 65 * 60) }),
        submit,
      ),
    )
    act(() => result.current.longTaxiDialogProps.onConfirm())

    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.longTaxiDialogProps.open).toBe(false)
  })

  it('never submits if the dialog is cancelled instead of confirmed', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    act(() =>
      result.current.withLongTaxiCheck(
        values({ offBlockTimeEpoch: '1000', takeoffTimeEpoch: String(1000 + 65 * 60) }),
        submit,
      ),
    )
    act(() => result.current.longTaxiDialogProps.onClose())

    expect(submit).not.toHaveBeenCalled()
    expect(result.current.longTaxiDialogProps.open).toBe(false)
  })

  it('does nothing when the times needed to compute a leg are missing', () => {
    const { result } = renderHook(() => useLongTaxiCheck())
    const submit = vi.fn()

    act(() =>
      result.current.withLongTaxiCheck(
        values({ offBlockTimeEpoch: undefined, landingTimeEpoch: undefined }),
        submit,
      ),
    )

    expect(submit).toHaveBeenCalledTimes(1)
  })
})
