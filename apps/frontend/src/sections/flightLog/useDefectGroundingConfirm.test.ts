import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useDefectGroundingConfirm } from './useDefectGroundingConfirm'

describe('useDefectGroundingConfirm', () => {
  it('submits immediately when no defect was reported', () => {
    const { result } = renderHook(() => useDefectGroundingConfirm())
    const submit = vi.fn()

    act(() => result.current.withGroundingConfirm([], submit))

    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.groundingDialogProps.open).toBe(false)
  })

  it('submits immediately when every reported defect is blank', () => {
    const { result } = renderHook(() => useDefectGroundingConfirm())
    const submit = vi.fn()

    act(() => result.current.withGroundingConfirm(['', '   '], submit))

    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.groundingDialogProps.open).toBe(false)
  })

  it('withholds submission behind the dialog when a defect was reported', () => {
    const { result } = renderHook(() => useDefectGroundingConfirm())
    const submit = vi.fn()

    act(() => result.current.withGroundingConfirm(['Oil stain on the ramp'], submit))

    expect(submit).not.toHaveBeenCalled()
    expect(result.current.groundingDialogProps.open).toBe(true)
  })

  it('submits and closes the dialog once confirmed', () => {
    const { result } = renderHook(() => useDefectGroundingConfirm())
    const submit = vi.fn()

    act(() => result.current.withGroundingConfirm(['Oil stain on the ramp'], submit))
    act(() => result.current.groundingDialogProps.onConfirm())

    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.groundingDialogProps.open).toBe(false)
  })

  it('never submits if the dialog is cancelled instead of confirmed', () => {
    const { result } = renderHook(() => useDefectGroundingConfirm())
    const submit = vi.fn()

    act(() => result.current.withGroundingConfirm(['Oil stain on the ramp'], submit))
    act(() => result.current.groundingDialogProps.onClose())

    expect(submit).not.toHaveBeenCalled()
    expect(result.current.groundingDialogProps.open).toBe(false)
  })
})
