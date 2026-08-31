import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readWizardDraft, writeWizardDraft } from '../utils/wizardDraft'
import { useWizardDraftAutosave, WIZARD_DRAFT_DEBOUNCE_MS } from './useWizardDraftAutosave'

const KEY = 'autosaveTest'

interface Form {
  headline: string
}

interface Draft {
  values: Form
  step: number
}

/** Reads through the Storage API so it works against the harness's in-memory stub. */
const wizardDraftKeys = () =>
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(
    (key): key is string => !!key?.startsWith('wizardDraft:'),
  )

const draftFromOtherTab = (tabId: string, value: unknown) => {
  localStorage.setItem(
    `wizardDraft:${KEY}:${tabId}`,
    JSON.stringify({ savedAt: Date.now(), value }),
  )
}

/**
 * Renders the hook over a real react-hook-form, since the whole point of it is the
 * interaction with `watch()` — a stubbed subscription would prove nothing about the
 * debounce.
 */
const renderAutosave = ({ enabled = true, step = 0 }: { enabled?: boolean; step?: number } = {}) =>
  renderHook(
    ({ enabled, step }: { enabled: boolean; step: number }) => {
      const { watch, getValues, setValue } = useForm<Form>({
        defaultValues: { headline: 'initial' },
      })
      const { discardDraft } = useWizardDraftAutosave<Draft, Form>(
        {
          key: KEY,
          watch,
          enabled,
          build: () => ({ values: getValues(), step }),
        },
        [step, getValues],
      )
      return { setValue, discardDraft }
    },
    { initialProps: { enabled, step } },
  )

describe('useWizardDraftAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('snapshots the form immediately on mount', () => {
    renderAutosave()

    expect(readWizardDraft<Draft>(KEY)).toEqual({ values: { headline: 'initial' }, step: 0 })
  })

  it('writes nothing at all when disabled', () => {
    renderAutosave({ enabled: false })

    expect(readWizardDraft<Draft>(KEY)).toBeNull()
  })

  it('debounces a form change rather than writing per keystroke', () => {
    const { result } = renderAutosave()

    act(() => {
      result.current.setValue('headline', 'a')
      result.current.setValue('headline', 'ab')
      result.current.setValue('headline', 'abc')
    })
    // Still the mount snapshot: nothing has been persisted for the three changes yet.
    expect(readWizardDraft<Draft>(KEY)).toEqual({ values: { headline: 'initial' }, step: 0 })

    act(() => vi.advanceTimersByTime(WIZARD_DRAFT_DEBOUNCE_MS))

    expect(readWizardDraft<Draft>(KEY)).toEqual({ values: { headline: 'abc' }, step: 0 })
  })

  it('re-snapshots when a non-form dependency changes', () => {
    const { rerender } = renderAutosave()

    rerender({ enabled: true, step: 3 })

    // No form change and no debounce elapsed — the step alone is enough.
    expect(readWizardDraft<Draft>(KEY)).toEqual({ values: { headline: 'initial' }, step: 3 })
  })

  it('persists the latest build when a debounced write lands after a dependency change', () => {
    const { result, rerender } = renderAutosave()

    act(() => result.current.setValue('headline', 'typed'))
    rerender({ enabled: true, step: 5 })
    act(() => vi.advanceTimersByTime(WIZARD_DRAFT_DEBOUNCE_MS))

    // The timer was armed while step was 0; it must not write that stale value back.
    expect(readWizardDraft<Draft>(KEY)).toEqual({ values: { headline: 'typed' }, step: 5 })
  })

  it("discardDraft clears this tab's slot and every orphan sibling", () => {
    draftFromOtherTab('gone-tab', { values: { headline: 'someone else' }, step: 1 })
    const { result } = renderAutosave()

    act(() => result.current.discardDraft())

    expect(wizardDraftKeys()).toEqual([])
  })

  it('a write already armed when the draft is discarded cannot resurrect it', () => {
    const { result } = renderAutosave()

    act(() => result.current.setValue('headline', 'late'))
    act(() => result.current.discardDraft())
    act(() => vi.advanceTimersByTime(WIZARD_DRAFT_DEBOUNCE_MS))

    // The timer armed by the keystroke still fires — the cleared flag is what stops it
    // writing the just-discarded draft straight back.
    expect(readWizardDraft<Draft>(KEY)).toBeNull()
  })

  it('stops writing on unmount', () => {
    const { result, unmount } = renderAutosave()

    act(() => result.current.setValue('headline', 'pending'))
    unmount()
    writeWizardDraft(KEY, { values: { headline: 'written after unmount' }, step: 9 })
    act(() => vi.advanceTimersByTime(WIZARD_DRAFT_DEBOUNCE_MS))

    expect(readWizardDraft<Draft>(KEY)).toEqual({
      values: { headline: 'written after unmount' },
      step: 9,
    })
  })
})
