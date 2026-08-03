import { useState } from 'react'
import {
  readWizardDraft,
  findOrphanWizardDrafts,
  adoptWizardDraft,
  discardAllOrphanWizardDrafts,
  type WizardDraftCandidate,
} from '../utils/wizardDraft'

type GateState<T> =
  { status: 'ready' } | { status: 'ambiguous'; candidates: WizardDraftCandidate<T>[] }

export interface WizardDraftGate<T> {
  status: 'ready' | 'ambiguous'
  // Only populated when status is 'ambiguous', most-recently-saved first.
  candidates: WizardDraftCandidate<T>[]
  resumeMostRecent: () => void
  startFresh: () => void
}

// Resolves, once per mount, whether a wizard is safe to render immediately or needs to
// ask the user which of several orphaned drafts (left behind by other, presumably-gone
// tabs) to resume. This — plus wizardDraft.ts — is the shared "wizard" abstraction:
// call it before ever calling readWizardDraft/writeWizardDraft for the same key, so
// orphan adoption has already happened by the time those run.
export function useWizardDraftGate<T>(logicalKey: string): WizardDraftGate<T> {
  const [state, setState] = useState<GateState<T>>(() => {
    if (readWizardDraft<T>(logicalKey) != null) return { status: 'ready' }

    const orphans = findOrphanWizardDrafts<T>(logicalKey)
    if (orphans.length === 0) return { status: 'ready' }
    if (orphans.length === 1) {
      adoptWizardDraft(logicalKey, orphans[0])
      return { status: 'ready' }
    }
    return { status: 'ambiguous', candidates: orphans }
  })

  const resumeMostRecent = () => {
    if (state.status !== 'ambiguous') return
    adoptWizardDraft(logicalKey, state.candidates[0])
    setState({ status: 'ready' })
  }

  const startFresh = () => {
    discardAllOrphanWizardDrafts(logicalKey)
    setState({ status: 'ready' })
  }

  return {
    status: state.status,
    candidates: state.status === 'ambiguous' ? state.candidates : [],
    resumeMostRecent,
    startFresh,
  }
}
