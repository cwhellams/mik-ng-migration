import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  readWizardDraft,
  writeWizardDraft,
  clearWizardDraft,
  findOrphanWizardDrafts,
  adoptWizardDraft,
  discardAllOrphanWizardDrafts,
  getTabId,
} from './wizardDraft'

// vitest here runs in a plain Node environment (no jsdom) — provide minimal
// localStorage/sessionStorage polyfills rather than relying on the ambient
// experimental Node globals, so tests are fully isolated and don't need a
// --localstorage-file flag.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  get length(): number {
    return this.store.size
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
}

const writeAsOtherTab = (
  logicalKey: string,
  tabId: string,
  value: unknown,
  savedAt = Date.now(),
) => {
  localStorage.setItem(`wizardDraft:${logicalKey}:${tabId}`, JSON.stringify({ savedAt, value }))
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getTabId', () => {
  it('is stable across repeated calls within the same tab', () => {
    expect(getTabId()).toBe(getTabId())
  })

  it('differs once sessionStorage is fresh (a different tab)', () => {
    const first = getTabId()
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    expect(getTabId()).not.toBe(first)
  })

  it('falls back to a non-crypto id without throwing when crypto.randomUUID is also unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('sessionStorage unavailable')
      },
      setItem: () => {
        throw new Error('sessionStorage unavailable')
      },
    })
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto.randomUUID unavailable')
    })

    expect(() => getTabId()).not.toThrow()
    expect(typeof getTabId()).toBe('string')
  })
})

describe('readWizardDraft / writeWizardDraft / clearWizardDraft', () => {
  it('round-trips a value written by this tab', () => {
    writeWizardDraft('k', { a: 1 })
    expect(readWizardDraft('k')).toEqual({ a: 1 })
  })

  it('returns null when nothing has been written', () => {
    expect(readWizardDraft('missing')).toBeNull()
  })

  it("clearWizardDraft removes this tab's own slot", () => {
    writeWizardDraft('k', { a: 1 })
    clearWizardDraft('k')
    expect(readWizardDraft('k')).toBeNull()
  })

  it('expires drafts older than the 24h TTL', () => {
    const base = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(base)
    writeWizardDraft('k', { a: 1 })
    vi.spyOn(Date, 'now').mockReturnValue(base + 25 * 60 * 60 * 1000)
    expect(readWizardDraft('k')).toBeNull()
  })
})

describe('findOrphanWizardDrafts / adoptWizardDraft / discardAllOrphanWizardDrafts', () => {
  it('finds no orphans when none exist', () => {
    expect(findOrphanWizardDrafts('k')).toEqual([])
  })

  it('finds a single sibling draft from another tab', () => {
    writeAsOtherTab('k', 'other-tab', { a: 1 })
    const orphans = findOrphanWizardDrafts('k')
    expect(orphans).toHaveLength(1)
    expect(orphans[0].value).toEqual({ a: 1 })
    expect(orphans[0].tabId).toBe('other-tab')
  })

  it("does not include this tab's own slot as an orphan", () => {
    writeWizardDraft('k', { mine: true })
    expect(findOrphanWizardDrafts('k')).toEqual([])
  })

  it('treats the pre-tab-scoping legacy bare key as one more orphan candidate', () => {
    localStorage.setItem(
      'wizardDraft:k',
      JSON.stringify({ savedAt: Date.now(), value: { legacy: true } }),
    )
    const orphans = findOrphanWizardDrafts('k')
    expect(orphans).toHaveLength(1)
    expect(orphans[0].tabId).toBe('__legacy__')
    expect(orphans[0].value).toEqual({ legacy: true })
  })

  it('sorts multiple orphans most-recently-saved first', () => {
    const now = Date.now()
    writeAsOtherTab('k', 'older', { id: 'older' }, now - 1000)
    writeAsOtherTab('k', 'newer', { id: 'newer' }, now)
    const orphans = findOrphanWizardDrafts('k')
    expect(orphans.map((o) => o.value)).toEqual([{ id: 'newer' }, { id: 'older' }])
  })

  it('sweeps expired orphans during the scan', () => {
    const now = Date.now()
    writeAsOtherTab('k', 'stale', { id: 'stale' }, now - 25 * 60 * 60 * 1000)
    expect(findOrphanWizardDrafts('k')).toEqual([])
    expect(localStorage.getItem('wizardDraft:k:stale')).toBeNull()
  })

  it('caps the number of retained siblings, evicting the oldest first', () => {
    const now = Date.now()
    for (let i = 0; i < 25; i++) {
      writeAsOtherTab('k', `tab-${i}`, { id: i }, now - i * 1000)
    }
    const orphans = findOrphanWizardDrafts<{ id: number }>('k')
    expect(orphans).toHaveLength(20)
    expect(orphans.some((o) => o.value.id === 24)).toBe(false)
    expect(orphans.some((o) => o.value.id === 0)).toBe(true)
  })

  it("adoptWizardDraft copies a candidate into this tab's own slot and preserves savedAt", () => {
    const savedAt = Date.now() - 5000
    writeAsOtherTab('k', 'other-tab', { a: 1 }, savedAt)
    const [candidate] = findOrphanWizardDrafts<{ a: number }>('k')
    adoptWizardDraft('k', candidate)
    expect(readWizardDraft('k')).toEqual({ a: 1 })
  })

  it('adoptWizardDraft leaves a sibling tab-scoped source key in place (it may still be owned by an open tab)', () => {
    writeAsOtherTab('k', 'other-tab', { a: 1 })
    const [candidate] = findOrphanWizardDrafts<{ a: number }>('k')
    adoptWizardDraft('k', candidate)
    expect(localStorage.getItem('wizardDraft:k:other-tab')).not.toBeNull()
  })

  it('adoptWizardDraft deletes the legacy source key (nothing writes that format anymore)', () => {
    localStorage.setItem(
      'wizardDraft:k',
      JSON.stringify({ savedAt: Date.now(), value: { legacy: true } }),
    )
    const [candidate] = findOrphanWizardDrafts<{ legacy: boolean }>('k')
    adoptWizardDraft('k', candidate)
    expect(readWizardDraft('k')).toEqual({ legacy: true })
    expect(localStorage.getItem('wizardDraft:k')).toBeNull()
  })

  it("discardAllOrphanWizardDrafts removes every sibling and the legacy key, but not this tab's own slot", () => {
    writeWizardDraft('k', { mine: true })
    writeAsOtherTab('k', 'other-tab', { a: 1 })
    localStorage.setItem(
      'wizardDraft:k',
      JSON.stringify({ savedAt: Date.now(), value: { legacy: true } }),
    )
    discardAllOrphanWizardDrafts('k')
    expect(findOrphanWizardDrafts('k')).toEqual([])
    expect(readWizardDraft('k')).toEqual({ mine: true })
  })

  it("does not let a shorter logicalKey prefix-match a longer one's keys", () => {
    writeAsOtherTab('flightLog:1', 'tab-a', { id: 'one' })
    writeAsOtherTab('flightLog:10', 'tab-b', { id: 'ten' })
    const orphans = findOrphanWizardDrafts('flightLog:1')
    expect(orphans).toHaveLength(1)
    expect(orphans[0].value).toEqual({ id: 'one' })
  })
})
