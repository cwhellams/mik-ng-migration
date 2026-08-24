import { useMemo, useState } from 'react'

/**
 * Row-selection state for list views with checkboxes and a "select all" header.
 *
 * `selectableIds` is the set of ids the user is allowed to select (e.g. the rows
 * currently matching a filter, minus any that must be excluded). Selection is
 * always intersected with this set, so ids that scroll out of the current filter
 * are automatically dropped from `selectedIds`, `isAllSelected` and actions.
 */
export function useMultiSelect(selectableIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const selectableSet = useMemo(() => new Set(selectableIds), [selectableIds])

  // Only ids that are both selected and still selectable.
  const selectedIds = useMemo(
    () => selectableIds.filter((id) => selected.has(id)),
    [selectableIds, selected],
  )

  const isAllSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length
  const isIndeterminate = selectedIds.length > 0 && !isAllSelected

  const toggle = (id: string) => {
    if (!selectableSet.has(id)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    setSelected(isAllSelected ? new Set() : new Set(selectableIds))
  }

  const clear = () => setSelected(new Set())

  const isSelected = (id: string) => selected.has(id)

  return {
    selected,
    selectedIds,
    isSelected,
    isAllSelected,
    isIndeterminate,
    toggle,
    toggleAll,
    clear,
  }
}
