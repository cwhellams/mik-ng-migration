import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { useIsFormSubmitted } from './useIsFormSubmitted'

interface Fields {
  name: string
}

/** Exposes both the form and the flag, so a test can submit and then read it. */
const renderWithForm = (onValid: () => void = () => {}) =>
  renderHook(() => {
    const form = useForm<Fields>({ defaultValues: { name: '' } })
    return { form, isSubmitted: useIsFormSubmitted(form.control), onValid }
  })

describe('useIsFormSubmitted', () => {
  it('is false before the first save attempt', () => {
    const { result } = renderWithForm()

    expect(result.current.isSubmitted).toBe(false)
  })

  it('stays false while the user merely edits fields', async () => {
    const { result } = renderWithForm()

    await act(async () => {
      result.current.form.setValue('name', 'Matti', { shouldDirty: true })
    })

    expect(result.current.isSubmitted).toBe(false)
  })

  it('becomes true once a save has been attempted', async () => {
    const { result } = renderWithForm()

    await act(async () => {
      await result.current.form.handleSubmit(() => {})()
    })

    expect(result.current.isSubmitted).toBe(true)
  })

  it('is true even when the submit was blocked by validation', async () => {
    const { result } = renderHook(() => {
      const form = useForm<Fields>({ defaultValues: { name: '' } })
      return { form, isSubmitted: useIsFormSubmitted(form.control) }
    })

    await act(async () => {
      // A rejected submit still counts — that is the whole point: every
      // remaining problem should surface after the user presses save.
      await result.current.form.handleSubmit(
        () => {},
        () => {},
      )()
    })

    expect(result.current.isSubmitted).toBe(true)
  })

  it('goes back to false when the form is reset', async () => {
    const { result } = renderWithForm()

    await act(async () => {
      await result.current.form.handleSubmit(() => {})()
    })
    expect(result.current.isSubmitted).toBe(true)

    await act(async () => {
      result.current.form.reset()
    })

    expect(result.current.isSubmitted).toBe(false)
  })
})
