import { useEffect, useRef, type DependencyList } from 'react'
import type { FieldValues, UseFormWatch } from 'react-hook-form'

import {
  clearWizardDraft,
  discardAllOrphanWizardDrafts,
  writeWizardDraft,
} from '../utils/wizardDraft'

// watch() fires on every keystroke (including per-digit numeric inputs). Writing
// synchronously that often would stringify and persist the whole draft on the main
// thread once per keystroke — jank that is especially noticeable on lower-end mobile
// Safari, which is exactly where draft persistence matters most. Debounce it.
export const WIZARD_DRAFT_DEBOUNCE_MS = 400

interface WizardDraftAutosaveOptions<TDraft, TForm extends FieldValues> {
  /** The logical draft key — the same one handed to useWizardDraftGate. */
  key: string
  /** The react-hook-form `watch` of the form being autosaved: the change stream. */
  watch: UseFormWatch<TForm>
  /**
   * Builds the draft to persist. Read the form through `getValues()` in here rather
   * than trusting `watch()`'s own callback payload, which is partial and still in flux
   * — the point of a snapshot is that it is the complete, current form.
   *
   * Anything this closure reads that is *not* form state (a step index, a set of
   * staged records) must appear in `deps`, or a change to it won't trigger a snapshot.
   */
  build: () => TDraft
  /** `false` switches autosave off entirely — e.g. editing a stored record rather than creating one. */
  enabled?: boolean
}

export interface WizardDraftAutosave {
  /**
   * Stops autosaving for good and clears this tab's slot plus every orphan sibling.
   * Call it when the draft is intentionally finished with: submitted, or discarded.
   */
  discardDraft: () => void
}

/**
 * Debounced autosave of a react-hook-form wizard's state into `wizardDraft` storage,
 * so a reload — or an iOS-killed background tab — resumes where the user left off.
 *
 * This is the write half of the wizard-draft abstraction: `useWizardDraftGate` resolves
 * which draft to resume before the form mounts, `readWizardDraft` seeds the form's
 * defaults from it, and this keeps it up to date afterwards. It exists because the
 * flight-log wizard and the occurrence form had grown two hand-copied versions of the
 * same effect (#1303 review): the same 400 ms debounce, the same "snapshot now, then on
 * every change" shape, and the same cleared-flag guard — three details that have to
 * agree between them and had no single place to be fixed.
 */
export function useWizardDraftAutosave<TDraft, TForm extends FieldValues>(
  { key, watch, build, enabled = true }: WizardDraftAutosaveOptions<TDraft, TForm>,
  deps: DependencyList = [],
): WizardDraftAutosave {
  // Kept current so a debounced snapshot — which may fire long after the render that
  // armed it — always persists the latest non-form state rather than that render's.
  // Declared before the autosave effect so it is refreshed first: effects run in
  // declaration order, and a re-armed subscription must not snapshot a stale closure.
  const buildRef = useRef(build)
  useEffect(() => {
    buildRef.current = build
  })

  // Set the instant the draft is intentionally cleared so a pending write can never
  // resurrect it. Clearing storage alone isn't enough: the debounce timer armed by the
  // user's last keystroke is only cancelled by the effect's cleanup on unmount, and
  // unmount (a route transition, an onClose) is a subsequent React render that isn't
  // guaranteed to beat the timer. If it doesn't, that write would silently put the
  // just-cleared draft straight back into storage.
  const clearedRef = useRef(false)

  const discardDraft = () => {
    clearedRef.current = true
    clearWizardDraft(key)
    // Orphan siblings left by other tabs (or by an earlier auto-adoption that
    // intentionally didn't delete its source — see adoptWizardDraft) must go too, or
    // the next mount's gate silently re-adopts one and the draft comes right back even
    // though it was just discarded or saved.
    discardAllOrphanWizardDrafts(key)
  }

  useEffect(() => {
    if (!enabled) return

    const snapshot = () => {
      if (clearedRef.current) return
      writeWizardDraft<TDraft>(key, buildRef.current())
    }
    snapshot()

    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const subscription = watch(() => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(snapshot, WIZARD_DRAFT_DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(debounceTimer)
      subscription.unsubscribe()
    }
    // `build` is deliberately not a dependency: it is a fresh closure on every render,
    // so depending on it would resubscribe watch() per render. The caller instead lists
    // the non-form values it reads, which is what decides when a re-snapshot is due.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, watch, ...deps])

  return { discardDraft }
}
