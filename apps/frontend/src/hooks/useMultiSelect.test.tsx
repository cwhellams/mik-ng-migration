import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useMultiSelect } from './useMultiSelect'

const render = (selectableIds: string[]) =>
  renderHook((ids: string[]) => useMultiSelect(ids), { initialProps: selectableIds })

describe('useMultiSelect', () => {
  it('starts with nothing selected', () => {
    const { result } = render(['a', 'b', 'c'])

    expect(result.current.selectedIds).toEqual([])
    expect(result.current.isAllSelected).toBe(false)
    expect(result.current.isIndeterminate).toBe(false)
  })

  it('toggles a row on and off again', () => {
    const { result } = render(['a', 'b', 'c'])

    act(() => result.current.toggle('a'))
    expect(result.current.selectedIds).toEqual(['a'])
    expect(result.current.isSelected('a')).toBe(true)

    act(() => result.current.toggle('a'))
    expect(result.current.selectedIds).toEqual([])
  })

  it('reports selectedIds in the order of the selectable list, not click order', () => {
    const { result } = render(['a', 'b', 'c'])

    act(() => result.current.toggle('c'))
    act(() => result.current.toggle('a'))

    expect(result.current.selectedIds).toEqual(['a', 'c'])
  })

  it('goes indeterminate on a partial selection', () => {
    const { result } = render(['a', 'b', 'c'])

    act(() => result.current.toggle('a'))

    expect(result.current.isIndeterminate).toBe(true)
    expect(result.current.isAllSelected).toBe(false)
  })

  it('reports all-selected once every row is picked', () => {
    const { result } = render(['a', 'b'])

    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('b'))

    expect(result.current.isAllSelected).toBe(true)
    expect(result.current.isIndeterminate).toBe(false)
  })

  it('selects everything with the header checkbox, then clears it', () => {
    const { result } = render(['a', 'b', 'c'])

    act(() => result.current.toggleAll())
    expect(result.current.selectedIds).toEqual(['a', 'b', 'c'])

    act(() => result.current.toggleAll())
    expect(result.current.selectedIds).toEqual([])
  })

  it('clears the selection outright', () => {
    const { result } = render(['a', 'b'])

    act(() => result.current.toggleAll())
    act(() => result.current.clear())

    expect(result.current.selectedIds).toEqual([])
  })

  it('ignores a row the user is not allowed to select', () => {
    const { result } = render(['a', 'b'])

    act(() => result.current.toggle('forbidden'))

    expect(result.current.selectedIds).toEqual([])
  })

  it('is never all-selected when there is nothing to select', () => {
    const { result } = render([])

    expect(result.current.isAllSelected).toBe(false)
    expect(result.current.isIndeterminate).toBe(false)
  })

  it('drops rows that leave the filter from the visible selection', () => {
    const { result, rerender } = render(['a', 'b', 'c'])

    act(() => result.current.toggleAll())
    expect(result.current.selectedIds).toEqual(['a', 'b', 'c'])

    // The user narrows the filter and 'c' is no longer on screen.
    rerender(['a', 'b'])

    expect(result.current.selectedIds).toEqual(['a', 'b'])
    expect(result.current.isAllSelected).toBe(true)
  })

  it('brings a row back when the filter widens again', () => {
    const { result, rerender } = render(['a', 'b', 'c'])

    act(() => result.current.toggleAll())
    rerender(['a', 'b'])
    rerender(['a', 'b', 'c'])

    // Selection is intersected on read, not destroyed, so 'c' returns selected.
    expect(result.current.selectedIds).toEqual(['a', 'b', 'c'])
  })

  it('keeps the raw selected set even for rows outside the filter', () => {
    const { result, rerender } = render(['a', 'b', 'c'])

    act(() => result.current.toggleAll())
    rerender(['a'])

    expect(result.current.selectedIds).toEqual(['a'])
    expect(result.current.selected.has('c')).toBe(true)
  })
})
