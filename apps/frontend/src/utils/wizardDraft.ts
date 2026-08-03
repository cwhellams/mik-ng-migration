// iOS Safari (and standalone/home-screen PWAs especially) can silently kill a
// backgrounded tab's page process to reclaim memory — switching to another app for a
// few minutes and coming back reloads the page from scratch, wiping all in-memory
// React/form state. Multi-step wizards persist their in-progress state here so a
// reload can restore exactly where the user left off instead of forcing a restart.
//
// localStorage is shared across every tab of the origin, so a plain "one slot per
// logical key" scheme would let concurrently open tabs clobber each other's drafts.
// Every draft is instead scoped by a per-tab ID (sessionStorage-backed, since
// sessionStorage is naturally per-tab and survives a reload of that same tab — exactly
// the scenario this exists for). readWizardDraft/writeWizardDraft/clearWizardDraft act
// only on this tab's own slot; useWizardDraftGate (hooks/useWizardDraftGate.ts) is what
// safely resolves orphaned drafts left behind by other, presumably-gone tabs — new
// wizard consumers should go through that hook rather than calling the orphan-scanning
// functions below directly.

const MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_SIBLINGS_PER_KEY = 20
const TAB_ID_STORAGE_KEY = 'wizardDraft:tabId'

let fallbackTabId: string | undefined

// Doesn't depend on crypto.randomUUID (unavailable in some older/restricted contexts)
// — used only as a last resort, so collision risk across two fallback ids in the same
// millisecond is an acceptable tradeoff for never throwing here.
const generateFallbackId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export const getTabId = (): string => {
  try {
    const existing = sessionStorage.getItem(TAB_ID_STORAGE_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, created)
    return created
  } catch {
    // private browsing, sessionStorage unavailable, or no crypto.randomUUID — fall
    // back to an id that's only stable for this page load, so it always takes the
    // safe "fresh tab" path below. Must not itself depend on crypto.randomUUID, or a
    // context missing it would throw here too instead of falling back.
    fallbackTabId ??= generateFallbackId()
    return fallbackTabId
  }
}

const ownStorageKey = (logicalKey: string) => `wizardDraft:${logicalKey}:${getTabId()}`
const legacyStorageKey = (logicalKey: string) => `wizardDraft:${logicalKey}`
// Includes the trailing ':' so a shorter logicalKey can never prefix-match a longer
// one's keys (e.g. 'flightLog:1' vs 'flightLog:10').
const siblingPrefix = (logicalKey: string) => `wizardDraft:${logicalKey}:`

interface StoredDraft<T> {
  savedAt: number
  value: T
}

export interface WizardDraftCandidate<T> {
  // '__legacy__' for a pre-tab-scoping draft with no tab id of its own.
  tabId: string
  savedAt: number
  value: T
}

const allLocalStorageKeys = (): string[] => {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) keys.push(key)
  }
  return keys
}

const parseStoredDraft = <T>(raw: string): StoredDraft<T> | null => {
  try {
    return JSON.parse(raw) as StoredDraft<T>
  } catch {
    return null
  }
}

export const readWizardDraft = <T>(logicalKey: string): T | null => {
  try {
    const key = ownStorageKey(logicalKey)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = parseStoredDraft<T>(raw)
    if (!parsed || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

export const writeWizardDraft = <T>(logicalKey: string, value: T): void => {
  try {
    localStorage.setItem(ownStorageKey(logicalKey), JSON.stringify({ savedAt: Date.now(), value }))
  } catch {
    // storage full/unavailable (e.g. private browsing) — draft just won't survive a reload
  }
}

// Returns when this tab's own draft for logicalKey was last saved, without touching
// its value — lets a caller decide whether the draft still makes sense (e.g. compare
// against a freshly-fetched record's own last-updated time) before merging it in.
export const readWizardDraftSavedAt = (logicalKey: string): number | null => {
  try {
    const raw = localStorage.getItem(ownStorageKey(logicalKey))
    if (!raw) return null
    const parsed = parseStoredDraft(raw)
    if (!parsed || Date.now() - parsed.savedAt > MAX_AGE_MS) return null
    return parsed.savedAt
  } catch {
    return null
  }
}

export const clearWizardDraft = (logicalKey: string): void => {
  try {
    localStorage.removeItem(ownStorageKey(logicalKey))
  } catch {
    // ignore
  }
}

// Scans every OTHER tab's slot for this logical key (plus the pre-tab-scoping legacy
// bare key, treated as just one more candidate), sweeping expired/corrupt entries and
// capping how many siblings can pile up along the way. Returns the survivors,
// most-recently-saved first.
export const findOrphanWizardDrafts = <T>(logicalKey: string): WizardDraftCandidate<T>[] => {
  try {
    const ownKey = ownStorageKey(logicalKey)
    const prefix = siblingPrefix(logicalKey)
    const legacyKey = legacyStorageKey(logicalKey)
    const now = Date.now()

    const found: Array<{ storageKey: string; candidate: WizardDraftCandidate<T> }> = []

    for (const key of allLocalStorageKeys()) {
      const isLegacy = key === legacyKey
      const isSibling = key !== ownKey && key.startsWith(prefix)
      if (!isLegacy && !isSibling) continue

      const raw = localStorage.getItem(key)
      const parsed = raw ? parseStoredDraft<T>(raw) : null
      if (!parsed || now - parsed.savedAt > MAX_AGE_MS) {
        if (raw != null) localStorage.removeItem(key)
        continue
      }

      found.push({
        storageKey: key,
        candidate: {
          tabId: isLegacy ? '__legacy__' : key.slice(prefix.length),
          savedAt: parsed.savedAt,
          value: parsed.value,
        },
      })
    }

    found.sort((a, b) => b.candidate.savedAt - a.candidate.savedAt)

    // Bound unbounded accumulation from many tabs each leaving their own orphan
    // behind — evict the oldest beyond the cap.
    for (const { storageKey } of found.slice(MAX_SIBLINGS_PER_KEY)) {
      localStorage.removeItem(storageKey)
    }

    return found.slice(0, MAX_SIBLINGS_PER_KEY).map((f) => f.candidate)
  } catch {
    return []
  }
}

// Copies a specific orphan candidate into this tab's own slot — preserving its
// original savedAt, so the TTL reflects staleness of the content rather than of the
// adoption. Only the legacy bare key (nothing writes that format anymore) is deleted
// outright; a tab-scoped sibling key is left in place, since that "orphan" may
// actually belong to a tab that's still open (just unfocused) — deleting it here would
// silently wipe that tab's only copy if it gets reloaded before its next autosave.
// The existing TTL/sibling-cap sweep in findOrphanWizardDrafts cleans it up instead.
export const adoptWizardDraft = <T>(
  logicalKey: string,
  candidate: WizardDraftCandidate<T>,
): void => {
  try {
    localStorage.setItem(
      ownStorageKey(logicalKey),
      JSON.stringify({ savedAt: candidate.savedAt, value: candidate.value }),
    )
    if (candidate.tabId === '__legacy__') {
      localStorage.removeItem(legacyStorageKey(logicalKey))
    }
  } catch {
    // ignore — worst case the candidate simply isn't adopted
  }
}

// Discards every sibling/legacy draft for a logical key ("start fresh").
export const discardAllOrphanWizardDrafts = (logicalKey: string): void => {
  try {
    const ownKey = ownStorageKey(logicalKey)
    const prefix = siblingPrefix(logicalKey)
    const legacyKey = legacyStorageKey(logicalKey)
    for (const key of allLocalStorageKeys()) {
      if (key === legacyKey || (key !== ownKey && key.startsWith(prefix))) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}
