import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { getTabId, readWizardDraft, writeWizardDraft } from '../utils/wizardDraft'
import { useWizardDraftGate } from './useWizardDraftGate'

const KEY = 'expenseClaim'

/**
 * Writes a draft as if another tab had left it behind. Ages are relative to now
 * because anything older than the module's max age is swept on read.
 */
const draftFromOtherTab = (tabId: string, value: unknown, msAgo = 0) => {
  localStorage.setItem(
    `wizardDraft:${KEY}:${tabId}`,
    JSON.stringify({ savedAt: Date.now() - msAgo, value }),
  )
}

/** Reads through the Storage API so it works against the harness's in-memory stub. */
const wizardDraftKeys = () =>
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(
    (key): key is string => !!key?.startsWith('wizardDraft:'),
  )

const renderGate = () => renderHook(() => useWizardDraftGate<{ step: number }>(KEY))

describe('useWizardDraftGate', () => {
  it('is ready when there is nothing saved anywhere', () => {
    const { result } = renderGate()

    expect(result.current.status).toBe('ready')
    expect(result.current.candidates).toEqual([])
  })

  it('is ready when this tab already has its own draft', () => {
    writeWizardDraft(KEY, { step: 2 })
    draftFromOtherTab('other-tab', { step: 9 })

    const { result } = renderGate()

    // This tab's own draft wins outright — no adoption, no question asked.
    expect(result.current.status).toBe('ready')
    expect(readWizardDraft(KEY)).toEqual({ step: 2 })
  })

  it('silently adopts a single orphan from a gone tab', () => {
    draftFromOtherTab('gone-tab', { step: 4 })

    const { result } = renderGate()

    expect(result.current.status).toBe('ready')
    expect(readWizardDraft(KEY)).toEqual({ step: 4 })
  })

  it('asks the user which to resume when several orphans exist', () => {
    draftFromOtherTab('tab-a', { step: 1 }, 60_000)
    draftFromOtherTab('tab-b', { step: 2 }, 30_000)

    const { result } = renderGate()

    expect(result.current.status).toBe('ambiguous')
    expect(result.current.candidates).toHaveLength(2)
  })

  it('orders the candidates most recently saved first', () => {
    draftFromOtherTab('older', { step: 1 }, 60_000)
    draftFromOtherTab('newer', { step: 2 }, 5_000)

    const { result } = renderGate()

    expect(result.current.candidates[0].value).toEqual({ step: 2 })
  })

  it('adopts the newest draft on resume, and becomes ready', () => {
    draftFromOtherTab('older', { step: 1 }, 60_000)
    draftFromOtherTab('newer', { step: 7 }, 5_000)

    const { result } = renderGate()
    act(() => result.current.resumeMostRecent())

    expect(result.current.status).toBe('ready')
    expect(result.current.candidates).toEqual([])
    expect(readWizardDraft(KEY)).toEqual({ step: 7 })
  })

  it('throws away every orphan on start-fresh', () => {
    draftFromOtherTab('tab-a', { step: 1 }, 60_000)
    draftFromOtherTab('tab-b', { step: 2 }, 30_000)

    const { result } = renderGate()
    act(() => result.current.startFresh())

    expect(result.current.status).toBe('ready')
    expect(readWizardDraft(KEY)).toBeNull()
    expect(wizardDraftKeys()).toEqual([])
  })

  it('ignores resumeMostRecent once the gate is already ready', () => {
    draftFromOtherTab('gone-tab', { step: 4 })

    const { result } = renderGate()
    expect(result.current.status).toBe('ready')

    act(() => result.current.resumeMostRecent())

    expect(readWizardDraft(KEY)).toEqual({ step: 4 })
  })

  it('resolves once per mount and does not re-run on re-render', () => {
    draftFromOtherTab('tab-a', { step: 1 }, 60_000)
    draftFromOtherTab('tab-b', { step: 2 }, 30_000)

    const { result, rerender } = renderGate()
    expect(result.current.status).toBe('ambiguous')

    rerender()

    expect(result.current.status).toBe('ambiguous')
    expect(result.current.candidates).toHaveLength(2)
  })

  it('does not look at drafts for a different wizard', () => {
    draftFromOtherTab('gone-tab', { step: 4 })
    localStorage.setItem(
      `wizardDraft:flightLog:other-tab`,
      JSON.stringify({ savedAt: Date.now(), value: { step: 99 } }),
    )

    const { result } = renderGate()

    expect(result.current.status).toBe('ready')
    expect(readWizardDraft(KEY)).toEqual({ step: 4 })
  })

  it('does not treat this tab’s own key as an orphan', () => {
    draftFromOtherTab(getTabId(), { step: 3 })

    const { result } = renderGate()

    // It is this tab's own draft, so it is read directly rather than adopted.
    expect(result.current.status).toBe('ready')
    expect(readWizardDraft(KEY)).toEqual({ step: 3 })
  })
})
